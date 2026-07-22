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
