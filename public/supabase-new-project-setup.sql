-- Neeru's Home Kitchen — complete setup for a NEW Supabase project
-- Generated from the versioned SQL files in this repository.
--
-- 1. Create the new Supabase project.
-- 2. Create the intended administrator in Authentication > Users.
--    Use krsnasolo@gmail.com or neofyne@gmail.com, or update the admin seed
--    statement in customer_storefront.sql before running this file.
-- 3. Open SQL Editor, paste this entire file, and click Run once.
-- 4. Point Netlify's VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to
--    the new project and redeploy.
-- 5. Sign in at /admin and upload the portable JSON backup in Settings.
--
-- Run only on a new/empty project. Existing authentication passwords are not
-- transferable; customers reconnect with the same phone or email after restore.

-- ============================================================================
-- schema.sql
-- ============================================================================

create type public.order_stage as enum ('new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered');
create type public.delivery_person as enum ('nanny', 'others');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_date date not null default current_date,
  customer_name text not null,
  flat_number text not null,
  order_details text not null,
  delivery_time time,
  amount numeric(10,2) not null default 0 check (amount >= 0),
  delivered_by public.delivery_person not null default 'nanny',
  is_paid boolean not null default false,
  stage public.order_stage not null default 'new',
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_date_idx on public.orders(order_date);
create index orders_customer_idx on public.orders(customer_name);
create index orders_flat_idx on public.orders(flat_number);

alter table public.orders enable row level security;
create policy "Family members manage orders" on public.orders
  for all to authenticated using (true) with check (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.orders;

-- Only an opaque Netlify Blob key is stored here. Image bytes do not live in
-- Supabase; the authenticated Netlify Function stores and serves them.
alter table public.orders add column if not exists photo_path text;

-- Menu catalogue: family-editable food names and optional dish photos.
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(10,2) not null default 0 check (price >= 0),
  photo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.menu_items add column if not exists price numeric(10,2) not null default 0;
alter table public.menu_items enable row level security;
create policy "Family members manage menu" on public.menu_items
  for all to authenticated using (true) with check (true);
insert into public.menu_items (name, price) values
  ('Veg sandwich', 120), ('Paneer sandwich', 150), ('Masala khichdi', 140),
  ('Moong dal khichdi', 130), ('Dal rice', 140), ('Rajma rice', 160),
  ('Veg pulao', 150), ('Curd rice', 130), ('Aloo paratha', 90), ('Poha', 80)
on conflict (name) do nothing;

-- ============================================================================
-- customer_storefront.sql
-- ============================================================================

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
  merchant_name text not null default 'Neeru''s Home Kitchen',
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

-- ============================================================================
-- phone_otp_auth.sql
-- ============================================================================

-- Phone OTP customer onboarding.
-- Safe to run after customer_storefront.sql.

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_profiles (id, full_name, flat_number, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'flat_number', ''),
    coalesce(new.email, ''),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do update set
    email = case when public.customer_profiles.email = '' then excluded.email else public.customer_profiles.email end,
    phone = case when public.customer_profiles.phone = '' then excluded.phone else public.customer_profiles.phone end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function public.handle_new_customer();

update public.customer_profiles as profile
set
  email = case when profile.email = '' then coalesce(account.email, '') else profile.email end,
  phone = case when profile.phone = '' then coalesce(account.phone, account.raw_user_meta_data ->> 'phone', '') else profile.phone end,
  updated_at = now()
from auth.users as account
where profile.id = account.id
  and (profile.email = '' or profile.phone = '');

-- ============================================================================
-- storefront_hardening.sql
-- ============================================================================

-- Storefront hardening: India-local operating day, order cutoff and test UPI.
-- Safe to run after customer_storefront.sql.

create or replace function public.kitchen_today()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Asia/Kolkata', now()))::date;
$$;

grant execute on function public.kitchen_today() to anon, authenticated;

-- Repair customer orders created after midnight in India but stamped with the
-- previous UTC calendar date.
update public.orders
set order_date = (created_at at time zone 'Asia/Kolkata')::date
where source = 'customer'
  and order_date is distinct from (created_at at time zone 'Asia/Kolkata')::date;

-- Move any daily-menu records affected by the same UTC/India date boundary.
insert into public.daily_menu (
  menu_item_id, menu_date, is_available, is_featured,
  portions_available, special_price, created_at, updated_at
)
select
  menu_item_id,
  (created_at at time zone 'Asia/Kolkata')::date,
  is_available,
  is_featured,
  portions_available,
  special_price,
  created_at,
  now()
from public.daily_menu
where menu_date is distinct from (created_at at time zone 'Asia/Kolkata')::date
on conflict (menu_item_id, menu_date) do update set
  is_available = excluded.is_available,
  is_featured = excluded.is_featured,
  portions_available = excluded.portions_available,
  special_price = excluded.special_price,
  updated_at = now();

delete from public.daily_menu
where menu_date is distinct from (created_at at time zone 'Asia/Kolkata')::date;

update public.storefront_settings
set upi_id = 'krsnasolo@okicici',
    merchant_name = 'Neeru''s Home Kitchen',
    updated_at = now()
where id = 1;

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

revoke all on function public.place_customer_order(time, text, jsonb) from public;
grant execute on function public.place_customer_order(time, text, jsonb) to authenticated;

drop policy if exists "Anyone reads today's menu" on public.daily_menu;
create policy "Anyone reads today's menu" on public.daily_menu
  for select to anon, authenticated
  using (menu_date = public.kitchen_today() or public.is_admin());

-- ============================================================================
-- customer_access_approval.sql
-- ============================================================================

-- Free customer access flow: every phone + PIN user starts pending,
-- then a family admin approves their profile before the storefront accepts login.
-- Safe to run after phone_otp_auth.sql.

alter table public.customer_profiles
  add column if not exists access_status text not null default 'approved',
  add column if not exists access_requested_at timestamptz,
  add column if not exists access_reviewed_at timestamptz,
  add column if not exists access_reviewed_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_profiles_access_status_check'
  ) then
    alter table public.customer_profiles
      add constraint customer_profiles_access_status_check
      check (access_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_profiles (
    id, full_name, flat_number, email, phone, access_status, access_requested_at
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'flat_number', ''),
    coalesce(new.email, ''),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone', ''),
    case when coalesce(new.phone, '') <> '' then 'pending' else 'approved' end,
    case when coalesce(new.phone, '') <> '' then now() else null end
  )
  on conflict (id) do update set
    email = case when public.customer_profiles.email = '' then excluded.email else public.customer_profiles.email end,
    phone = case when public.customer_profiles.phone = '' then excluded.phone else public.customer_profiles.phone end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function public.handle_new_customer();

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

-- ============================================================================
-- instant_customer_access.sql
-- ============================================================================

-- Let residents create a phone + PIN account and order immediately.
-- Existing pending signups are approved; explicitly rejected accounts stay blocked.

update public.customer_profiles
set access_status = 'approved',
    access_reviewed_at = now(),
    access_requested_at = null,
    updated_at = now()
where access_status = 'pending';

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_profiles (
    id, full_name, flat_number, email, phone, access_status, access_requested_at
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'flat_number', ''),
    coalesce(new.email, ''),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone', ''),
    'approved',
    null
  )
  on conflict (id) do update set
    email = case when public.customer_profiles.email = '' then excluded.email else public.customer_profiles.email end,
    phone = case when public.customer_profiles.phone = '' then excluded.phone else public.customer_profiles.phone end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function public.handle_new_customer();

drop trigger if exists customer_order_requires_approval on public.orders;

-- ============================================================================
-- customer_contact.sql
-- ============================================================================

-- Customer WhatsApp contact shown on the public storefront.
-- Safe to run after supabase/customer_storefront.sql.

alter table public.storefront_settings
  add column if not exists whatsapp_number text not null default '918483000013';

update public.storefront_settings
set whatsapp_number = '918483000013'
where id = 1;

-- ============================================================================
-- dish_promotions.sql
-- ============================================================================

-- Optional WhatsApp promotion copy and expiry for each day's menu item.

alter table public.daily_menu
  add column if not exists promotion_message text not null default '',
  add column if not exists promotion_until time;

-- ============================================================================
-- two_state_orders.sql
-- ============================================================================

-- Neeru's Home Kitchen intentionally uses a two-state workflow. Historical
-- intermediate values remain in the enum for compatibility, but are no longer
-- valid order states.
update public.orders
set stage = 'new'
where stage not in ('new', 'delivered');

alter table public.orders
  drop constraint if exists orders_two_state_stage;

alter table public.orders
  add constraint orders_two_state_stage
  check (stage in ('new', 'delivered'));

-- ============================================================================
-- delivered_photo_guard.sql
-- ============================================================================

-- A delivered order must never retain a reference to a temporary order photo.
-- Apply after cleaning any legacy delivered-order photos through Admin Settings.

alter table public.orders
  drop constraint if exists orders_delivered_without_photo;

alter table public.orders
  add constraint orders_delivered_without_photo
  check (stage <> 'delivered' or photo_path is null);

-- ============================================================================
-- admin_action_centre.sql
-- ============================================================================

-- Admin action-centre alerts depend on Postgres Changes being published for
-- both new customer access requests and new customer orders.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_profiles'
  ) then
    alter publication supabase_realtime add table public.customer_profiles;
  end if;
end;
$$;

-- ============================================================================
-- portable_backup_restore.sql
-- ============================================================================

-- Portable, administrator-only backup and restore for Neeru's Home Kitchen.
-- Run after every other application migration.
--
-- Authentication passwords are deliberately not exportable. Customer identity
-- details are retained in restored_customer_profiles and are claimed when the
-- same email address or phone number signs up in the replacement project.

alter table public.orders
  add column if not exists legacy_customer_id uuid;

create table if not exists public.restored_customer_profiles (
  legacy_id uuid primary key,
  full_name text not null default '',
  flat_number text not null default '',
  email text not null default '',
  phone text not null default '',
  spice_preference text not null default 'mild'
    check (spice_preference in ('mild', 'medium', 'spicy')),
  standing_instructions text not null default '',
  access_status text not null default 'approved'
    check (access_status in ('pending', 'approved', 'rejected')),
  original_created_at timestamptz,
  original_updated_at timestamptz,
  claimed_user_id uuid references auth.users(id) on delete set null,
  restored_at timestamptz not null default now()
);

alter table public.restored_customer_profiles enable row level security;

drop policy if exists "Admins manage restored customers" on public.restored_customer_profiles;
create policy "Admins manage restored customers" on public.restored_customer_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.restored_customer_profiles to authenticated;

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_restored public.restored_customer_profiles%rowtype;
  v_phone text := regexp_replace(coalesce(new.phone, new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g');
begin
  select * into v_restored
  from public.restored_customer_profiles
  where claimed_user_id is null
    and (
      (coalesce(new.email, '') <> '' and email <> '' and lower(email) = lower(new.email))
      or
      (v_phone <> '' and phone <> '' and regexp_replace(phone, '\D', '', 'g') = v_phone)
    )
  order by restored_at desc
  limit 1;

  insert into public.customer_profiles (
    id, full_name, flat_number, email, phone, spice_preference,
    standing_instructions, access_status, access_requested_at,
    access_reviewed_at, access_reviewed_by, created_at, updated_at
  ) values (
    new.id,
    coalesce(nullif(v_restored.full_name, ''), new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(nullif(v_restored.flat_number, ''), new.raw_user_meta_data ->> 'flat_number', ''),
    coalesce(new.email, v_restored.email, ''),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone', v_restored.phone, ''),
    coalesce(v_restored.spice_preference, 'mild'),
    coalesce(v_restored.standing_instructions, ''),
    coalesce(v_restored.access_status, 'approved'),
    null,
    null,
    null,
    coalesce(v_restored.original_created_at, new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    full_name = case when public.customer_profiles.full_name = '' then excluded.full_name else public.customer_profiles.full_name end,
    flat_number = case when public.customer_profiles.flat_number = '' then excluded.flat_number else public.customer_profiles.flat_number end,
    email = case when public.customer_profiles.email = '' then excluded.email else public.customer_profiles.email end,
    phone = case when public.customer_profiles.phone = '' then excluded.phone else public.customer_profiles.phone end,
    spice_preference = excluded.spice_preference,
    standing_instructions = case when public.customer_profiles.standing_instructions = '' then excluded.standing_instructions else public.customer_profiles.standing_instructions end,
    access_status = excluded.access_status,
    updated_at = now();

  if v_restored.legacy_id is not null then
    update public.restored_customer_profiles
    set claimed_user_id = new.id
    where legacy_id = v_restored.legacy_id;

    update public.orders
    set customer_id = new.id
    where customer_id is null and legacy_customer_id = v_restored.legacy_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function public.handle_new_customer();

create or replace function public.create_portable_backup()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_backup jsonb;
begin
  if not public.is_admin() then
    raise exception 'Family administrator access required.';
  end if;

  select jsonb_build_object(
    'format', 'neerus-home-kitchen-backup',
    'version', 1,
    'created_at', now(),
    'app_name', 'Neeru''s Home Kitchen',
    'notes', jsonb_build_object(
      'passwords_included', false,
      'photo_files_included', false,
      'photo_storage', 'Netlify Blobs',
      'account_recovery', 'Customers sign up with the same email or phone number to reclaim restored history.'
    ),
    'counts', jsonb_build_object(
      'orders', (select count(*) from public.orders),
      'order_items', (select count(*) from public.order_items),
      'menu_items', (select count(*) from public.menu_items),
      'daily_menu', (select count(*) from public.daily_menu),
      'customer_profiles', (select count(*) from public.customer_profiles),
      'restored_customer_profiles', (select count(*) from public.restored_customer_profiles)
    ),
    'admin_accounts', coalesce((
      select jsonb_agg(jsonb_build_object('email', users.email, 'phone', users.phone) order by users.email)
      from public.admin_users admins
      join auth.users users on users.id = admins.user_id
    ), '[]'::jsonb),
    'data', jsonb_build_object(
      'storefront_settings', coalesce((select jsonb_agg(to_jsonb(row_value)) from public.storefront_settings row_value), '[]'::jsonb),
      'menu_items', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id) from public.menu_items row_value), '[]'::jsonb),
      'daily_menu', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.menu_date, row_value.menu_item_id) from public.daily_menu row_value), '[]'::jsonb),
      'customer_profiles', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id) from public.customer_profiles row_value), '[]'::jsonb),
      'restored_customer_profiles', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.restored_at, row_value.legacy_id) from public.restored_customer_profiles row_value), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id) from public.orders row_value), '[]'::jsonb),
      'order_items', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.created_at, row_value.id) from public.order_items row_value), '[]'::jsonb)
    )
  ) into v_backup;

  return v_backup;
end;
$$;

revoke all on function public.create_portable_backup() from public;
grant execute on function public.create_portable_backup() to authenticated;

create or replace function public.restore_portable_backup(p_backup jsonb, p_mode text default 'replace')
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_data jsonb;
  v_profile public.restored_customer_profiles%rowtype;
  v_user_id uuid;
  v_matched integer := 0;
  v_waiting integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Family administrator access required.';
  end if;
  if p_mode <> 'replace' then
    raise exception 'Only replace mode is supported.';
  end if;
  if coalesce(p_backup ->> 'format', '') <> 'neerus-home-kitchen-backup'
     or coalesce((p_backup ->> 'version')::integer, 0) <> 1 then
    raise exception 'This is not a supported Neeru''s Home Kitchen backup file.';
  end if;

  v_data := p_backup -> 'data';
  if jsonb_typeof(v_data) <> 'object' then
    raise exception 'The backup data section is missing.';
  end if;
  if jsonb_typeof(coalesce(v_data -> 'orders', 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_data -> 'menu_items', 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_data -> 'customer_profiles', 'null'::jsonb)) <> 'array' then
    raise exception 'The backup contains invalid table data.';
  end if;
  if jsonb_array_length(v_data -> 'orders') > 100000
     or jsonb_array_length(v_data -> 'menu_items') > 10000
     or jsonb_array_length(v_data -> 'customer_profiles') > 100000 then
    raise exception 'The backup is larger than the supported safety limit.';
  end if;

  -- Replace dependent business records first. Auth users and administrator
  -- permissions are intentionally retained in the destination project.
  delete from public.order_items;
  delete from public.orders;
  delete from public.daily_menu;
  delete from public.menu_items;
  delete from public.restored_customer_profiles;

  insert into public.restored_customer_profiles (
    legacy_id, full_name, flat_number, email, phone, spice_preference,
    standing_instructions, access_status, original_created_at, original_updated_at
  )
  select
    profile.id,
    coalesce(profile.full_name, ''),
    coalesce(profile.flat_number, ''),
    coalesce(profile.email, ''),
    coalesce(profile.phone, ''),
    coalesce(profile.spice_preference, 'mild'),
    coalesce(profile.standing_instructions, ''),
    coalesce(profile.access_status, 'approved'),
    profile.created_at,
    profile.updated_at
  from jsonb_to_recordset(v_data -> 'customer_profiles') as profile(
    id uuid, full_name text, flat_number text, email text, phone text,
    spice_preference text, standing_instructions text, access_status text,
    created_at timestamptz, updated_at timestamptz
  );

  insert into public.restored_customer_profiles (
    legacy_id, full_name, flat_number, email, phone, spice_preference,
    standing_instructions, access_status, original_created_at, original_updated_at
  )
  select
    profile.legacy_id,
    coalesce(profile.full_name, ''),
    coalesce(profile.flat_number, ''),
    coalesce(profile.email, ''),
    coalesce(profile.phone, ''),
    coalesce(profile.spice_preference, 'mild'),
    coalesce(profile.standing_instructions, ''),
    coalesce(profile.access_status, 'approved'),
    profile.original_created_at,
    profile.original_updated_at
  from jsonb_to_recordset(coalesce(v_data -> 'restored_customer_profiles', '[]'::jsonb)) as profile(
    legacy_id uuid, full_name text, flat_number text, email text, phone text,
    spice_preference text, standing_instructions text, access_status text,
    original_created_at timestamptz, original_updated_at timestamptz
  )
  on conflict (legacy_id) do update set
    full_name = excluded.full_name,
    flat_number = excluded.flat_number,
    email = excluded.email,
    phone = excluded.phone,
    spice_preference = excluded.spice_preference,
    standing_instructions = excluded.standing_instructions,
    access_status = excluded.access_status,
    original_created_at = excluded.original_created_at,
    original_updated_at = excluded.original_updated_at,
    claimed_user_id = null,
    restored_at = now();

  -- Match profiles to accounts already created in the destination. Unmatched
  -- profiles remain archived and are claimed automatically on future signup.
  for v_profile in select * from public.restored_customer_profiles
  loop
    v_user_id := null;
    select users.id into v_user_id
    from auth.users users
    where users.id = v_profile.legacy_id
       or (v_profile.email <> '' and coalesce(users.email, '') <> '' and lower(users.email) = lower(v_profile.email))
       or (v_profile.phone <> '' and regexp_replace(coalesce(users.phone, users.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g') = regexp_replace(v_profile.phone, '\D', '', 'g'))
    order by case when users.id = v_profile.legacy_id then 0 else 1 end, users.created_at
    limit 1;

    if v_user_id is not null then
      insert into public.customer_profiles (
        id, full_name, flat_number, email, phone, spice_preference,
        standing_instructions, access_status, access_requested_at,
        access_reviewed_at, access_reviewed_by, created_at, updated_at
      ) values (
        v_user_id, v_profile.full_name, v_profile.flat_number,
        v_profile.email, v_profile.phone, v_profile.spice_preference,
        v_profile.standing_instructions, v_profile.access_status,
        null, null, null,
        coalesce(v_profile.original_created_at, now()),
        coalesce(v_profile.original_updated_at, now())
      )
      on conflict (id) do update set
        full_name = excluded.full_name,
        flat_number = excluded.flat_number,
        email = excluded.email,
        phone = excluded.phone,
        spice_preference = excluded.spice_preference,
        standing_instructions = excluded.standing_instructions,
        access_status = excluded.access_status,
        updated_at = now();

      update public.restored_customer_profiles
      set claimed_user_id = v_user_id
      where legacy_id = v_profile.legacy_id;
      v_matched := v_matched + 1;
    else
      v_waiting := v_waiting + 1;
    end if;
  end loop;

  insert into public.menu_items (
    id, name, price, photo_path, is_active, created_at, description, spice_level
  )
  select
    item.id, item.name, coalesce(item.price, 0), item.photo_path,
    coalesce(item.is_active, true), coalesce(item.created_at, now()),
    coalesce(item.description, ''), coalesce(item.spice_level, 'mild')
  from jsonb_to_recordset(v_data -> 'menu_items') as item(
    id uuid, name text, price numeric, photo_path text, is_active boolean,
    created_at timestamptz, description text, spice_level text
  );

  insert into public.daily_menu (
    id, menu_item_id, menu_date, is_available, is_featured,
    portions_available, special_price, promotion_message, promotion_until,
    created_at, updated_at
  )
  select
    item.id, item.menu_item_id, item.menu_date,
    coalesce(item.is_available, true), coalesce(item.is_featured, false),
    item.portions_available, item.special_price,
    coalesce(item.promotion_message, ''), item.promotion_until,
    coalesce(item.created_at, now()), coalesce(item.updated_at, now())
  from jsonb_to_recordset(coalesce(v_data -> 'daily_menu', '[]'::jsonb)) as item(
    id uuid, menu_item_id uuid, menu_date date, is_available boolean,
    is_featured boolean, portions_available integer, special_price numeric,
    promotion_message text, promotion_until time,
    created_at timestamptz, updated_at timestamptz
  );

  insert into public.storefront_settings (
    id, ordering_open, hero_message, upi_id, merchant_name,
    order_cutoff, whatsapp_number, updated_at
  )
  select
    coalesce(settings.id, 1), coalesce(settings.ordering_open, true),
    coalesce(settings.hero_message, ''), coalesce(settings.upi_id, ''),
    coalesce(settings.merchant_name, 'Neeru''s Home Kitchen'),
    settings.order_cutoff, coalesce(settings.whatsapp_number, ''),
    coalesce(settings.updated_at, now())
  from jsonb_to_recordset(coalesce(v_data -> 'storefront_settings', '[]'::jsonb)) as settings(
    id smallint, ordering_open boolean, hero_message text, upi_id text,
    merchant_name text, order_cutoff time, whatsapp_number text, updated_at timestamptz
  )
  on conflict (id) do update set
    ordering_open = excluded.ordering_open,
    hero_message = excluded.hero_message,
    upi_id = excluded.upi_id,
    merchant_name = excluded.merchant_name,
    order_cutoff = excluded.order_cutoff,
    whatsapp_number = excluded.whatsapp_number,
    updated_at = now();

  insert into public.orders (
    id, order_date, customer_id, legacy_customer_id, customer_name,
    flat_number, order_details, delivery_time, amount, delivered_by,
    is_paid, stage, remarks, photo_path, source, payment_status,
    payment_reference, payment_method, created_at, updated_at
  )
  select
    item.id,
    item.order_date,
    restored.claimed_user_id,
    coalesce(item.legacy_customer_id, item.customer_id),
    item.customer_name,
    item.flat_number,
    item.order_details,
    item.delivery_time,
    coalesce(item.amount, 0),
    coalesce(item.delivered_by, 'nanny')::public.delivery_person,
    coalesce(item.is_paid, false),
    case when item.stage = 'delivered' then 'delivered'::public.order_stage else 'new'::public.order_stage end,
    coalesce(item.remarks, ''),
    case when item.stage = 'delivered' then null else item.photo_path end,
    coalesce(item.source, 'family'),
    coalesce(item.payment_status, case when item.is_paid then 'verified' else 'pending' end),
    item.payment_reference,
    coalesce(item.payment_method, 'upi'),
    coalesce(item.created_at, now()),
    coalesce(item.updated_at, now())
  from jsonb_to_recordset(v_data -> 'orders') as item(
    id uuid, order_date date, customer_id uuid, legacy_customer_id uuid,
    customer_name text, flat_number text, order_details text,
    delivery_time time, amount numeric, delivered_by text, is_paid boolean,
    stage text, remarks text, photo_path text, source text,
    payment_status text, payment_reference text, payment_method text,
    created_at timestamptz, updated_at timestamptz
  )
  left join public.restored_customer_profiles restored
    on restored.legacy_id = coalesce(item.legacy_customer_id, item.customer_id);

  insert into public.order_items (
    id, order_id, menu_item_id, item_name, unit_price, quantity, created_at
  )
  select
    item.id, item.order_id, item.menu_item_id, item.item_name,
    coalesce(item.unit_price, 0), item.quantity, coalesce(item.created_at, now())
  from jsonb_to_recordset(coalesce(v_data -> 'order_items', '[]'::jsonb)) as item(
    id uuid, order_id uuid, menu_item_id uuid, item_name text,
    unit_price numeric, quantity integer, created_at timestamptz
  );

  return jsonb_build_object(
    'restored_at', now(),
    'orders', (select count(*) from public.orders),
    'order_items', (select count(*) from public.order_items),
    'menu_items', (select count(*) from public.menu_items),
    'daily_menu', (select count(*) from public.daily_menu),
    'customers_matched', v_matched,
    'customers_waiting_to_reconnect', v_waiting
  );
end;
$$;

revoke all on function public.restore_portable_backup(jsonb, text) from public;
grant execute on function public.restore_portable_backup(jsonb, text) to authenticated;

