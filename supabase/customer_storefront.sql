-- Customer storefront and strict family/customer access separation.
-- Safe to run after supabase/schema.sql.

create or replace function public.kitchen_today()
returns date language sql stable set search_path = public
as $$ select (timezone('Asia/Kolkata', now()))::date; $$;

grant execute on function public.kitchen_today() to anon, authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

insert into public.admin_users (user_id)
select id from auth.users where lower(email) in ('krsnasolo@gmail.com', 'neofyne@gmail.com')
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users" on public.admin_users
  for select to authenticated using (public.is_admin());

alter table public.menu_items add column if not exists description text not null default '';
alter table public.menu_items add column if not exists spice_level text not null default 'mild'
  check (spice_level in ('mild', 'medium', 'spicy'));

alter table public.orders add column if not exists customer_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists source text not null default 'family'
  check (source in ('family', 'customer'));
alter table public.orders add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending', 'submitted', 'verified', 'failed', 'refunded'));
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists payment_method text not null default 'upi'
  check (payment_method in ('upi', 'cash'));

create index if not exists orders_customer_id_idx on public.orders(customer_id);

create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  flat_number text not null default '',
  email text not null default '',
  phone text not null default '',
  spice_preference text not null default 'mild'
    check (spice_preference in ('mild', 'medium', 'spicy')),
  standing_instructions text not null default '',
  access_status text not null default 'approved'
    check (access_status in ('pending', 'approved', 'rejected')),
  access_requested_at timestamptz,
  access_reviewed_at timestamptz,
  access_reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_menu (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  menu_date date not null default public.kitchen_today(),
  is_available boolean not null default true,
  is_featured boolean not null default false,
  portions_available integer check (portions_available is null or portions_available >= 0),
  special_price numeric(10,2) check (special_price is null or special_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_item_id, menu_date)
);

create index if not exists daily_menu_date_idx on public.daily_menu(menu_date);

create table if not exists public.storefront_settings (
  id smallint primary key default 1 check (id = 1),
  ordering_open boolean not null default true,
  hero_message text not null default 'Fresh home-style food, prepared with care and delivered to your door.',
  upi_id text not null default 'krsnasolo@okicici',
  merchant_name text not null default 'Neeru''s Kitchen',
  order_cutoff time,
  updated_at timestamptz not null default now()
);

insert into public.storefront_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0 and quantity <= 20),
  line_total numeric(10,2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items(order_id);

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_profiles (id, full_name, flat_number, email, phone, access_status, access_requested_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'flat_number', ''),
    coalesce(new.email, ''),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone', ''),
    case when coalesce(new.phone, '') <> '' then 'pending' else 'approved' end,
    case when coalesce(new.phone, '') <> '' then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function public.handle_new_customer();

insert into public.customer_profiles (id, full_name, flat_number, email, phone, access_status, access_requested_at)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), coalesce(raw_user_meta_data ->> 'flat_number', ''), coalesce(email, ''), coalesce(phone, raw_user_meta_data ->> 'phone', ''),
  case when coalesce(phone, '') <> '' then 'pending' else 'approved' end,
  case when coalesce(phone, '') <> '' then created_at else null end
from auth.users
on conflict (id) do nothing;

create or replace function public.review_customer_access(p_customer_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Family administrator access required.'; end if;
  if not exists (
    select 1 from public.customer_profiles
    where id = p_customer_id and phone <> '' and access_requested_at is not null
  ) then
    raise exception 'This is not a phone access request.';
  end if;

  update public.customer_profiles
  set access_status = case when p_approve then 'approved' else 'rejected' end,
      access_reviewed_at = now(),
      access_reviewed_by = auth.uid(),
      updated_at = now()
  where id = p_customer_id;
  if not found then raise exception 'Customer request not found.'; end if;
end;
$$;

revoke all on function public.review_customer_access(uuid, boolean) from public;
grant execute on function public.review_customer_access(uuid, boolean) to authenticated;

create or replace function public.protect_customer_access_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.access_status is distinct from old.access_status
     and auth.role() <> 'service_role'
     and not public.is_admin() then
    raise exception 'Only a family administrator can change customer access.';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_access_status_is_admin_only on public.customer_profiles;
create trigger customer_access_status_is_admin_only
before update of access_status on public.customer_profiles
for each row execute function public.protect_customer_access_status();

create or replace function public.enforce_approved_customer_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'customer' and not exists (
    select 1 from public.customer_profiles
    where id = new.customer_id and access_status = 'approved'
  ) then
    raise exception 'Your customer account is waiting for kitchen approval.';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_order_requires_approval on public.orders;
create trigger customer_order_requires_approval
before insert on public.orders
for each row execute function public.enforce_approved_customer_order();

insert into public.daily_menu (menu_item_id, menu_date, is_available, is_featured)
select id, public.kitchen_today(), true, row_number() over (order by created_at) <= 3
from public.menu_items
on conflict (menu_item_id, menu_date) do nothing;

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
  if not found or not v_settings.ordering_open then raise exception 'The kitchen is not taking orders right now.'; end if;
  if v_settings.order_cutoff is not null and v_local_time > v_settings.order_cutoff then raise exception 'Today''s order cutoff has passed.'; end if;

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
    insert into public.order_items (order_id, menu_item_id, item_name, unit_price, quantity)
    values (v_order_id, v_menu.id, v_menu.name, v_price, v_quantity);
    v_total := v_total + (v_price * v_quantity);
    v_details := concat_ws(', ', nullif(v_details, ''), format('%s × %s', v_menu.name, v_quantity));
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then raise exception 'Your cart is empty.'; end if;
  update public.orders set amount = v_total, order_details = v_details where id = v_order_id;
  return v_order_id;
end;
$$;

create or replace function public.submit_payment_reference(p_order_id uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if length(trim(p_reference)) < 6 or length(trim(p_reference)) > 80 then raise exception 'Enter a valid UPI transaction reference.'; end if;
  update public.orders
  set payment_reference = trim(p_reference), payment_status = 'submitted', updated_at = now()
  where id = p_order_id and customer_id = auth.uid() and payment_status in ('pending', 'submitted');
  if not found then raise exception 'Order not found or payment already verified.'; end if;
end;
$$;

revoke all on function public.place_customer_order(time, text, jsonb) from public;
revoke all on function public.submit_payment_reference(uuid, text) from public;
grant execute on function public.place_customer_order(time, text, jsonb) to authenticated;
grant execute on function public.submit_payment_reference(uuid, text) to authenticated;

alter table public.customer_profiles enable row level security;
alter table public.daily_menu enable row level security;
alter table public.storefront_settings enable row level security;
alter table public.order_items enable row level security;

grant select on public.menu_items to anon, authenticated;
grant select on public.daily_menu to anon, authenticated;
grant select on public.storefront_settings to anon, authenticated;
grant select on public.orders to authenticated;
grant select, insert, update on public.customer_profiles to authenticated;
grant select on public.order_items to authenticated;
grant all on public.menu_items, public.daily_menu, public.storefront_settings, public.orders, public.order_items to authenticated;

drop policy if exists "Family members manage orders" on public.orders;
drop policy if exists "Admins manage orders" on public.orders;
drop policy if exists "Customers read own orders" on public.orders;
create policy "Admins manage orders" on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Customers read own orders" on public.orders
  for select to authenticated using (customer_id = auth.uid());

drop policy if exists "Family members manage menu" on public.menu_items;
drop policy if exists "Anyone reads active menu" on public.menu_items;
drop policy if exists "Admins manage menu" on public.menu_items;
create policy "Anyone reads active menu" on public.menu_items
  for select to anon, authenticated using (is_active = true or public.is_admin());
create policy "Admins manage menu" on public.menu_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Customers manage own profile" on public.customer_profiles;
drop policy if exists "Admins read customer profiles" on public.customer_profiles;
create policy "Customers manage own profile" on public.customer_profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Admins read customer profiles" on public.customer_profiles
  for select to authenticated using (public.is_admin());

drop policy if exists "Anyone reads today's menu" on public.daily_menu;
drop policy if exists "Admins manage daily menu" on public.daily_menu;
create policy "Anyone reads today's menu" on public.daily_menu
  for select to anon, authenticated using (menu_date = public.kitchen_today() or public.is_admin());
create policy "Admins manage daily menu" on public.daily_menu
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Anyone reads storefront settings" on public.storefront_settings;
drop policy if exists "Admins manage storefront settings" on public.storefront_settings;
create policy "Anyone reads storefront settings" on public.storefront_settings
  for select to anon, authenticated using (true);
create policy "Admins manage storefront settings" on public.storefront_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Customers read own order items" on public.order_items;
drop policy if exists "Admins manage order items" on public.order_items;
create policy "Customers read own order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders where orders.id = order_items.order_id and orders.customer_id = auth.uid())
  );
create policy "Admins manage order items" on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop trigger if exists customer_profiles_set_updated_at on public.customer_profiles;
create trigger customer_profiles_set_updated_at before update on public.customer_profiles
for each row execute function public.set_updated_at();

drop trigger if exists daily_menu_set_updated_at on public.daily_menu;
create trigger daily_menu_set_updated_at before update on public.daily_menu
for each row execute function public.set_updated_at();

drop trigger if exists storefront_settings_set_updated_at on public.storefront_settings;
create trigger storefront_settings_set_updated_at before update on public.storefront_settings
for each row execute function public.set_updated_at();
