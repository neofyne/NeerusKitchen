\set ON_ERROR_STOP on

create role anon;
create role authenticated;
create role service_role;
create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;

create or replace function auth.role()
returns text language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated'); $$;

create publication supabase_realtime;

insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000001', 'neofyne@gmail.com', '{"full_name":"Kitchen admin"}');

\i /work/public/supabase-new-project-setup.sql

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

insert into auth.users (id, email, phone, raw_user_meta_data)
values (
  '20000000-0000-0000-0000-000000000002',
  'resident@example.com',
  '919999999999',
  '{"full_name":"Resident One","flat_number":"A-402","phone":"919999999999"}'
);

update public.customer_profiles
set spice_preference = 'medium', standing_instructions = 'No onion'
where id = '20000000-0000-0000-0000-000000000002';

insert into public.orders (
  id, order_date, customer_id, customer_name, flat_number, order_details,
  delivery_time, amount, delivered_by, is_paid, stage, remarks, source,
  payment_status, payment_method
) values (
  '30000000-0000-0000-0000-000000000003', current_date,
  '20000000-0000-0000-0000-000000000002', 'Resident One', 'A-402',
  'Curd rice × 1', '19:30', 130, 'nanny', false, 'new', 'No onion',
  'customer', 'pending', 'upi'
);

insert into public.order_items (id, order_id, menu_item_id, item_name, unit_price, quantity)
select
  '40000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000003',
  id, name, price, 1
from public.menu_items where name = 'Curd rice';

create temp table portable_test_backup as
select public.create_portable_backup() as payload;

delete from auth.users where id = '20000000-0000-0000-0000-000000000002';
update public.storefront_settings set merchant_name = 'Changed after backup' where id = 1;
delete from public.orders;

select public.restore_portable_backup(payload, 'replace')
from portable_test_backup;

do $$
begin
  if (select count(*) from public.orders where id = '30000000-0000-0000-0000-000000000003') <> 1 then
    raise exception 'Order was not restored';
  end if;
  if (select customer_id from public.orders where id = '30000000-0000-0000-0000-000000000003') is not null then
    raise exception 'Missing account should not have been linked';
  end if;
  if (select legacy_customer_id from public.orders where id = '30000000-0000-0000-0000-000000000003') <> '20000000-0000-0000-0000-000000000002' then
    raise exception 'Portable customer identity was not retained';
  end if;
  if (select merchant_name from public.storefront_settings where id = 1) <> 'Neeru''s Home Kitchen' then
    raise exception 'Storefront settings were not restored';
  end if;
  if (select count(*) from public.order_items where order_id = '30000000-0000-0000-0000-000000000003') <> 1 then
    raise exception 'Order items were not restored';
  end if;
end;
$$;

insert into auth.users (id, email, phone, raw_user_meta_data)
values (
  '50000000-0000-0000-0000-000000000005',
  'resident@example.com',
  '919999999999',
  '{"full_name":"Resident One","flat_number":"A-402","phone":"919999999999"}'
);

do $$
begin
  if (select customer_id from public.orders where id = '30000000-0000-0000-0000-000000000003') <> '50000000-0000-0000-0000-000000000005' then
    raise exception 'Returning customer did not reclaim restored order history';
  end if;
  if (select standing_instructions from public.customer_profiles where id = '50000000-0000-0000-0000-000000000005') <> 'No onion' then
    raise exception 'Returning customer profile was not restored';
  end if;
end;
$$;

select 'portable backup and restore smoke test passed' as result;
