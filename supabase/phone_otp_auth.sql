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
