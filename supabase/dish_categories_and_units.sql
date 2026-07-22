-- Dish categories, selling units and quantity-aware order lines.
-- Additive migration: existing dishes remain available under "Other dishes".

create table if not exists public.dish_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists dish_categories_set_updated_at on public.dish_categories;
create trigger dish_categories_set_updated_at before update on public.dish_categories
for each row execute function public.set_updated_at();

alter table public.dish_categories enable row level security;
grant select on public.dish_categories to anon, authenticated;
grant insert, update, delete on public.dish_categories to authenticated;

drop policy if exists "Anyone reads active dish categories" on public.dish_categories;
create policy "Anyone reads active dish categories" on public.dish_categories
  for select to anon, authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "Admins manage dish categories" on public.dish_categories;
create policy "Admins manage dish categories" on public.dish_categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.dish_categories (name, slug, description, sort_order)
values
  ('Paranthas', 'paranthas', 'All paranthas are made in Desi Ghee and prepared fresh after you order.', 10),
  ('Other dishes', 'other-dishes', 'Fresh home-style dishes from Neeru''s kitchen.', 999)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

alter table public.menu_items
  add column if not exists category_id uuid references public.dish_categories(id) on delete set null;
alter table public.menu_items
  add column if not exists unit_label text not null default 'portion';
alter table public.order_items
  add column if not exists unit_label text not null default 'portion';

update public.menu_items
set category_id = (select id from public.dish_categories where slug = 'other-dishes')
where category_id is null;

create index if not exists menu_items_category_idx on public.menu_items(category_id);

-- Import the current All Day Parantha menu supplied by the kitchen.
update public.menu_items
set name = 'Aloo Parantha'
where lower(name) = 'aloo paratha'
  and not exists (select 1 from public.menu_items where name = 'Aloo Parantha');

insert into public.menu_items (name, price, description, spice_level, category_id, unit_label, is_active)
select dishes.name, dishes.price, dishes.description, dishes.spice_level,
       categories.id, '2 pcs', true
from public.dish_categories categories
cross join (values
  ('Plain Parantha', 200::numeric, 'Served with Curd, Pickle & Amul Butter', 'mild'),
  ('Green Chilli Parantha', 220::numeric, 'Served with Curd, Pickle & Amul Butter', 'spicy'),
  ('Missa Parantha', 250::numeric, 'Served with Curd, Pickle & Amul Butter', 'medium'),
  ('Aloo Parantha', 250::numeric, 'Served with Curd, Pickle & Amul Butter', 'medium'),
  ('Paneer Parantha', 350::numeric, 'Served with Curd, Pickle & Amul Butter', 'mild'),
  ('Vegetable Parantha', 350::numeric, 'Stuffed with Carrot, Capsicum, Onion & Paneer. Served with Curd, Pickle & Amul Butter', 'medium'),
  ('Besan Chilla', 350::numeric, 'Stuffed with Paneer, Onion & Capsicum. Served with Chutney', 'medium')
) as dishes(name, price, description, spice_level)
where categories.slug = 'paranthas'
on conflict (name) do update set
  price = excluded.price,
  description = excluded.description,
  spice_level = excluded.spice_level,
  category_id = excluded.category_id,
  unit_label = excluded.unit_label,
  is_active = true;

-- Keep the existing customer-order RPC quantity-aware and preserve the unit
-- that was sold even if the dish configuration changes later.
create or replace function public.place_customer_order(
  p_delivery_time time,
  p_instructions text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.kitchen_today();
  v_local_time time := (timezone('Asia/Kolkata', now()))::time;
  v_settings public.storefront_settings%rowtype;
  v_profile public.customer_profiles%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_daily public.daily_menu%rowtype;
  v_quantity integer;
  v_price numeric(10,2);
  v_total numeric(10,2) := 0;
  v_details text := '';
  v_line_count integer := 0;
begin
  if v_user is null then raise exception 'Please sign in before ordering.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty.'; end if;

  select * into v_settings from public.storefront_settings where id = 1;
  if not found or not v_settings.ordering_open then
    raise exception 'The kitchen is not taking orders right now.';
  end if;
  if v_settings.order_cutoff is not null and v_local_time > v_settings.order_cutoff then
    raise exception 'Today''s order cutoff has passed.';
  end if;

  select * into v_profile from public.customer_profiles where id = v_user;
  if not found or trim(v_profile.full_name) = '' or trim(v_profile.flat_number) = '' then
    raise exception 'Complete your name and flat number before ordering.';
  end if;

  insert into public.orders (
    order_date, customer_id, customer_name, flat_number, order_details,
    delivery_time, amount, delivered_by, is_paid, stage, remarks,
    source, payment_status, payment_method
  ) values (
    v_today, v_user, v_profile.full_name, v_profile.flat_number, 'Preparing order…',
    p_delivery_time, 0, 'nanny', false, 'new',
    trim(concat_ws(' · ', nullif(v_profile.standing_instructions, ''), nullif(p_instructions, ''))),
    'customer', 'pending', 'upi'
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 20 then raise exception 'Invalid item quantity.'; end if;

    select * into v_menu from public.menu_items
    where id = (v_item ->> 'menu_item_id')::uuid and is_active = true;
    if not found then raise exception 'A selected dish is no longer available.'; end if;

    select * into v_daily from public.daily_menu
    where menu_item_id = v_menu.id and menu_date = v_today;
    if found and not v_daily.is_available then raise exception '% is sold out.', v_menu.name; end if;
    if found and v_daily.portions_available is not null then
      update public.daily_menu
      set portions_available = portions_available - v_quantity, updated_at = now()
      where id = v_daily.id and portions_available >= v_quantity;
      if not found then raise exception 'Not enough portions of % remain.', v_menu.name; end if;
    end if;

    v_price := coalesce(v_daily.special_price, v_menu.price);
    insert into public.order_items (order_id, menu_item_id, item_name, unit_price, quantity, unit_label)
    values (v_order_id, v_menu.id, v_menu.name, v_price, v_quantity, v_menu.unit_label);
    v_total := v_total + (v_price * v_quantity);
    v_details := concat_ws(', ', nullif(v_details, ''),
      format('%s × %s%s', v_menu.name, v_quantity,
        case when v_menu.unit_label <> 'portion' then format(' (%s each)', v_menu.unit_label) else '' end));
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then raise exception 'Your cart is empty.'; end if;
  update public.orders set amount = v_total, order_details = v_details where id = v_order_id;
  return v_order_id;
end;
$$;

revoke all on function public.place_customer_order(time, text, jsonb) from public;
grant execute on function public.place_customer_order(time, text, jsonb) to authenticated;
