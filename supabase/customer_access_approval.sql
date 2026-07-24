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
