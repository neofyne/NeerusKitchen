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
