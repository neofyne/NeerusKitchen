-- Guest checkout for the four-tower customer storefront.
-- Customers provide delivery/contact details with each order; no account or SMS is required.

alter table public.orders
  add column if not exists customer_phone text not null default '';

create table if not exists public.guest_customer_contacts (
  phone text primary key check (phone ~ '^[6-9][0-9]{9}$'),
  full_name text not null,
  flat_number text not null check (flat_number ~ '^[A-D]-[0-9]{1,5}$'),
  first_order_at timestamptz not null default now(),
  last_order_at timestamptz not null default now()
);

alter table public.guest_customer_contacts enable row level security;

-- Keep the first supplied name and flat for each phone, rather than creating
-- another customer when a later order spells the name a little differently.
insert into public.guest_customer_contacts (phone, full_name, flat_number, first_order_at, last_order_at)
select distinct on (customer_phone)
  customer_phone,
  customer_name,
  flat_number,
  created_at,
  created_at
from public.orders
where customer_phone ~ '^[6-9][0-9]{9}$'
  and flat_number ~ '^[A-D]-[0-9]{1,5}$'
order by customer_phone, created_at asc
on conflict (phone) do nothing;

create or replace function public.place_guest_customer_order(
  p_customer_name text,
  p_flat_number text,
  p_customer_phone text,
  p_delivery_time time,
  p_instructions text,
  p_items jsonb,
  p_payment_method text default 'upi'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := trim(coalesce(p_customer_name, ''));
  v_flat text := upper(trim(coalesce(p_flat_number, '')));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_today date := public.kitchen_today();
  v_local_time time := (timezone('Asia/Kolkata', now()))::time;
  v_settings public.storefront_settings%rowtype;
  v_contact public.guest_customer_contacts%rowtype;
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
  if length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Enter the customer name.';
  end if;
  if v_flat !~ '^[A-D]-[0-9]{1,5}$' then
    raise exception 'Choose a tower and enter a valid flat number.';
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number.';
  end if;
  if p_payment_method not in ('upi', 'cash') then
    raise exception 'Choose UPI or cash on delivery.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  insert into public.guest_customer_contacts (phone, full_name, flat_number)
  values (v_phone, v_name, v_flat)
  on conflict (phone) do update set last_order_at = now()
  returning * into v_contact;
  v_name := v_contact.full_name;
  v_flat := v_contact.flat_number;

  select * into v_settings from public.storefront_settings where id = 1;
  if not found or not v_settings.ordering_open then
    raise exception 'The kitchen is not taking orders right now.';
  end if;
  if v_settings.order_cutoff is not null and v_local_time > v_settings.order_cutoff then
    raise exception 'Today''s order cutoff has passed.';
  end if;

  insert into public.orders (
    order_date, customer_id, customer_name, customer_phone, flat_number, order_details,
    delivery_time, amount, delivered_by, is_paid, stage, remarks,
    source, payment_status, payment_method
  ) values (
    v_today, null, v_name, v_phone, v_flat, 'Preparing order…',
    p_delivery_time, 0, 'nanny', false, 'new', trim(coalesce(p_instructions, '')),
    'customer', 'pending', p_payment_method
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 20 then raise exception 'Invalid item quantity.'; end if;

    select * into v_menu from public.menu_items where id = (v_item ->> 'menu_item_id')::uuid and is_active = true;
    if not found then raise exception 'A selected dish is no longer available.'; end if;

    select * into v_daily from public.daily_menu where menu_item_id = v_menu.id and menu_date = v_today;
    if found and not v_daily.is_available then raise exception '% is sold out.', v_menu.name; end if;
    if found and v_daily.portions_available is not null then
      update public.daily_menu set portions_available = portions_available - v_quantity, updated_at = now()
      where id = v_daily.id and portions_available >= v_quantity;
      if not found then raise exception 'Not enough portions of % remain.', v_menu.name; end if;
    end if;

    v_price := coalesce(v_daily.special_price, v_menu.price);
    insert into public.order_items (order_id, menu_item_id, item_name, unit_price, quantity, unit_label)
    values (v_order_id, v_menu.id, v_menu.name, v_price, v_quantity, v_menu.unit_label);
    v_total := v_total + (v_price * v_quantity);
    v_details := concat_ws(', ', nullif(v_details, ''), format('%s × %s portion%s%s', v_menu.name, v_quantity, case when v_quantity <> 1 then 's' else '' end, case when v_menu.unit_label <> 'portion' then format(' (%s per portion)', v_menu.unit_label) else '' end));
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then raise exception 'Your cart is empty.'; end if;
  update public.orders set amount = v_total, order_details = v_details where id = v_order_id;
  return v_order_id;
end;
$$;

revoke all on function public.place_guest_customer_order(text, text, text, time, text, jsonb, text) from public;
grant execute on function public.place_guest_customer_order(text, text, text, time, text, jsonb, text) to anon, authenticated;

-- A guest customer can tell the kitchen that they have paid without needing to
-- create a login. The matching mobile number is required, and the order UUID is
-- only shown on that customer's payment page.
create or replace function public.submit_guest_payment_reference(
  p_order_id uuid,
  p_customer_phone text,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_reference text := trim(coalesce(p_reference, ''));
begin
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter the mobile number used for this order.';
  end if;
  if length(v_reference) < 6 or length(v_reference) > 80 then
    raise exception 'Enter a valid UPI transaction reference.';
  end if;

  update public.orders
  set payment_reference = v_reference,
      payment_status = 'submitted',
      updated_at = now()
  where id = p_order_id
    and source = 'customer'
    and customer_phone = v_phone
    and payment_method = 'upi'
    and payment_status in ('pending', 'submitted');

  if not found then
    raise exception 'This order could not be found, or its payment is already verified.';
  end if;
end;
$$;

revoke all on function public.submit_guest_payment_reference(uuid, text, text) from public;
grant execute on function public.submit_guest_payment_reference(uuid, text, text) to anon, authenticated;

-- A payment note is an intentionally shareable, short-lived-looking record for
-- one customer's selected unpaid online orders. It is not a tax invoice and it
-- never sends a message by itself. The opaque code is the only public access.
create table if not exists public.payment_note_requests (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique,
  order_ids uuid[] not null check (cardinality(order_ids) > 0),
  customer_name text not null,
  total numeric(10,2) not null check (total > 0),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'verified')),
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_note_requests enable row level security;
drop policy if exists "Admins manage payment notes" on public.payment_note_requests;
create policy "Admins manage payment notes" on public.payment_note_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.create_payment_note_request(p_order_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_keys integer;
  v_valid boolean;
  v_name text;
  v_total numeric(10,2);
  v_code text;
begin
  if not public.is_admin() then raise exception 'Only an administrator can prepare a payment note.'; end if;
  if coalesce(cardinality(p_order_ids), 0) = 0 then raise exception 'Choose at least one order.'; end if;
  if cardinality(p_order_ids) <> cardinality(array(select distinct unnest(p_order_ids))) then raise exception 'Each order can only be included once.'; end if;

  select count(*),
         count(distinct coalesce(nullif(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g'), ''), lower(trim(customer_name)) || '|' || lower(trim(flat_number)))),
         bool_and(not is_paid and coalesce(payment_status, 'pending') not in ('verified', 'submitted') and coalesce(payment_method, 'upi') <> 'cash'),
         min(customer_name),
         sum(amount)
    into v_count, v_keys, v_valid, v_name, v_total
  from public.orders
  where id = any(p_order_ids);

  if v_count <> cardinality(p_order_ids) or v_keys <> 1 or not coalesce(v_valid, false) then
    raise exception 'Choose unpaid online-payment orders for one customer only.';
  end if;

  loop
    v_code := lower(substring(replace(gen_random_uuid()::text, '-', '') for 10));
    begin
      insert into public.payment_note_requests (share_code, order_ids, customer_name, total)
      values (v_code, p_order_ids, v_name, v_total);
      exit;
    exception when unique_violation then
      -- An opaque random code collision is retried safely.
    end;
  end loop;
  return jsonb_build_object('share_code', v_code, 'total', v_total, 'customer_name', v_name);
end;
$$;

create or replace function public.get_payment_note_request(p_share_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.payment_note_requests;
  v_orders jsonb;
begin
  select * into v_note from public.payment_note_requests
  where share_code = lower(trim(p_share_code)) and status in ('pending', 'submitted');
  if not found then raise exception 'This payment link is no longer available.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'order_date', o.order_date,
    'order_details', o.order_details,
    'amount', o.amount,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'item_name', oi.item_name, 'unit_price', oi.unit_price, 'quantity', oi.quantity, 'unit_label', oi.unit_label
    ) order by oi.created_at) from public.order_items oi where oi.order_id = o.id), '[]'::jsonb)
  ) order by o.order_date, o.created_at), '[]'::jsonb) into v_orders
  from public.orders o where o.id = any(v_note.order_ids);

  return jsonb_build_object('customer_name', v_note.customer_name, 'total', v_note.total, 'status', v_note.status, 'orders', v_orders);
end;
$$;

create or replace function public.submit_payment_note_reference(p_share_code text, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.payment_note_requests;
  v_reference text := trim(coalesce(p_reference, ''));
begin
  if length(v_reference) < 6 or length(v_reference) > 80 then raise exception 'Enter a valid UPI transaction reference.'; end if;
  select * into v_note from public.payment_note_requests where share_code = lower(trim(p_share_code)) and status = 'pending';
  if not found then raise exception 'This payment link is no longer available.'; end if;
  update public.orders set payment_reference = v_reference, payment_status = 'submitted', updated_at = now()
  where id = any(v_note.order_ids) and not is_paid and coalesce(payment_status, 'pending') = 'pending';
  update public.payment_note_requests set status = 'submitted', payment_reference = v_reference, updated_at = now() where id = v_note.id;
end;
$$;

revoke all on function public.create_payment_note_request(uuid[]) from public;
revoke all on function public.get_payment_note_request(text) from public;
revoke all on function public.submit_payment_note_reference(text, text) from public;
grant execute on function public.create_payment_note_request(uuid[]) to authenticated;
grant execute on function public.get_payment_note_request(text) to anon, authenticated;
grant execute on function public.submit_payment_note_reference(text, text) to anon, authenticated;
