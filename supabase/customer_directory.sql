-- Family client directory.
-- Run after guest_customer_checkout.sql. It is safe to re-run.
--
-- A valid mobile number remains the stable client identity. The directory
-- includes people who have ordered and people the family adds in advance.

create or replace function public.admin_customer_directory()
returns table (
  customer_key text,
  customer_name text,
  customer_phone text,
  flat_number text,
  first_order_at timestamptz,
  last_order_at timestamptz,
  order_count bigint,
  total_spend numeric,
  paid_total numeric,
  pending_total numeric,
  delivered_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Family administrator access required.';
  end if;

  return query
  with normalized as (
    select
      o.id,
      o.customer_id,
      o.customer_name,
      o.flat_number,
      o.created_at,
      coalesce(o.amount, 0)::numeric as amount,
      coalesce(o.is_paid, false) as is_paid,
      coalesce(o.payment_status, 'pending') as payment_status,
      coalesce(o.stage, 'new') as stage,
      nullif(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), '') as phone,
      case
        when nullif(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), '') ~ '^[6-9][0-9]{9}$'
          then regexp_replace(o.customer_phone, '\D', '', 'g')
        else lower(trim(o.customer_name)) || '|' || lower(trim(o.flat_number))
      end as directory_key
    from public.orders o
  ),
  totals as (
    select
      n.directory_key,
      min(n.created_at) as first_order_at,
      max(n.created_at) as last_order_at,
      count(*)::bigint as order_count,
      sum(n.amount)::numeric as total_spend,
      sum(case when n.is_paid or n.payment_status = 'verified' then n.amount else 0 end)::numeric as paid_total,
      sum(case when not n.is_paid and n.payment_status <> 'verified' then n.amount else 0 end)::numeric as pending_total,
      count(*) filter (where n.stage = 'delivered')::bigint as delivered_count
    from normalized n
    group by n.directory_key
  ),
  latest as (
    select distinct on (n.directory_key)
      n.directory_key,
      n.customer_id,
      n.customer_name,
      n.flat_number,
      n.phone
    from normalized n
    order by n.directory_key, n.created_at desc, n.id desc
  ),
  ordered_clients as (
    select
      latest.directory_key::text as customer_key,
      coalesce(nullif(contact.full_name, ''), nullif(profile.full_name, ''), latest.customer_name)::text as customer_name,
      coalesce(latest.phone, '')::text as customer_phone,
      coalesce(nullif(contact.flat_number, ''), nullif(profile.flat_number, ''), latest.flat_number)::text as flat_number,
      totals.first_order_at,
      totals.last_order_at,
      totals.order_count,
      totals.total_spend,
      totals.paid_total,
      totals.pending_total,
      totals.delivered_count
    from totals
    join latest on latest.directory_key = totals.directory_key
    left join public.guest_customer_contacts contact on contact.phone = latest.phone
    left join public.customer_profiles profile on profile.id = latest.customer_id
  ),
  added_clients as (
    select
      contact.phone::text as customer_key,
      contact.full_name::text as customer_name,
      contact.phone::text as customer_phone,
      contact.flat_number::text as flat_number,
      null::timestamptz as first_order_at,
      null::timestamptz as last_order_at,
      0::bigint as order_count,
      0::numeric as total_spend,
      0::numeric as paid_total,
      0::numeric as pending_total,
      0::bigint as delivered_count
    from public.guest_customer_contacts contact
    where not exists (
      select 1 from totals where totals.directory_key = contact.phone
    )
  )
  select * from ordered_clients
  union all
  select * from added_clients;
end;
$$;

revoke all on function public.admin_customer_directory() from public;
grant execute on function public.admin_customer_directory() to authenticated;

drop function if exists public.admin_update_customer_directory_entry(text, text, text, text, text);

create or replace function public.admin_update_customer_directory_entry(
  p_customer_phone text,
  p_prior_name text,
  p_prior_flat_number text,
  p_customer_name text,
  p_flat_number text,
  p_new_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '');
  v_phone text := nullif(regexp_replace(coalesce(p_new_phone, ''), '\D', '', 'g'), '');
  v_prior_name text := trim(coalesce(p_prior_name, ''));
  v_prior_flat text := upper(trim(coalesce(p_prior_flat_number, '')));
  v_name text := trim(coalesce(p_customer_name, ''));
  v_flat text := upper(trim(coalesce(p_flat_number, '')));
begin
  if not public.is_admin() then
    raise exception 'Family administrator access required.';
  end if;
  if length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Enter a client name between 2 and 100 characters.';
  end if;
  if v_flat !~ '^[A-D]-[0-9]{1,5}$' then
    raise exception 'Choose a tower and enter a valid flat number.';
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number.';
  end if;
  if exists (select 1 from public.guest_customer_contacts where phone = v_phone)
     and (v_previous_phone !~ '^[6-9][0-9]{9}$' or v_previous_phone <> v_phone) then
    raise exception 'This mobile number already belongs to another client. Open that client instead of merging records.';
  end if;

  if v_previous_phone ~ '^[6-9][0-9]{9}$' then
    insert into public.guest_customer_contacts (phone, full_name, flat_number)
    values (v_phone, v_name, v_flat)
    on conflict (phone) do update
      set full_name = excluded.full_name,
          flat_number = excluded.flat_number;

    update public.orders
    set customer_name = v_name,
        flat_number = v_flat,
        customer_phone = v_phone
    where regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g') = v_previous_phone;

    update public.customer_profiles
    set full_name = v_name,
        flat_number = v_flat,
        phone = v_phone
    where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_previous_phone;

  else
    insert into public.guest_customer_contacts (phone, full_name, flat_number)
    values (v_phone, v_name, v_flat)
    on conflict (phone) do update
      set full_name = excluded.full_name,
          flat_number = excluded.flat_number;

    update public.orders
    set customer_name = v_name,
        flat_number = v_flat,
        customer_phone = v_phone
    where lower(trim(customer_name)) = lower(v_prior_name)
      and upper(trim(flat_number)) = v_prior_flat
      and nullif(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g'), '') is null;

    update public.customer_profiles
    set full_name = v_name,
        flat_number = v_flat,
        phone = v_phone
    where lower(trim(full_name)) = lower(v_prior_name)
      and upper(trim(flat_number)) = v_prior_flat
      and nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') is null;
  end if;

  insert into public.customer_admin_notes (customer_name, flat_number, remarks)
  select v_name, v_flat, remarks
  from public.customer_admin_notes
  where lower(trim(customer_name)) = lower(v_prior_name)
    and upper(trim(flat_number)) = v_prior_flat
  on conflict (customer_name, flat_number) do update
    set remarks = excluded.remarks,
        updated_at = now();

end;
$$;

revoke all on function public.admin_update_customer_directory_entry(text, text, text, text, text, text) from public;
grant execute on function public.admin_update_customer_directory_entry(text, text, text, text, text, text) to authenticated;
