-- Device registrations and exactly-once claiming for delivery reminder pushes.
-- Only family administrators can register or remove their own device.

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_push_subscriptions_user_idx
  on public.admin_push_subscriptions(user_id);

alter table public.admin_push_subscriptions enable row level security;

drop policy if exists "Admins manage their own push subscriptions" on public.admin_push_subscriptions;
create policy "Admins manage their own push subscriptions" on public.admin_push_subscriptions
  for all to authenticated
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());

drop trigger if exists admin_push_subscriptions_set_updated_at on public.admin_push_subscriptions;
create trigger admin_push_subscriptions_set_updated_at
before update on public.admin_push_subscriptions
for each row execute function public.set_updated_at();

create table if not exists public.delivery_reminder_push_runs (
  order_id uuid not null references public.orders(id) on delete cascade,
  reminder_time time not null,
  claimed_at timestamptz not null default now(),
  primary key (order_id, reminder_time)
);

alter table public.delivery_reminder_push_runs enable row level security;

create or replace function public.claim_due_delivery_reminders(p_now timestamptz default now())
returns table (order_id uuid, customer_name text, flat_number text, delivery_time time, reminder_time time)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select o.id as order_id, o.customer_name, o.flat_number, o.delivery_time, o.reminder_time
    from public.orders o
    where o.stage <> 'delivered'
      and o.reminder_time is not null
      and ((o.order_date + o.reminder_time) at time zone 'Asia/Kolkata') <= p_now
      and ((o.order_date + o.reminder_time) at time zone 'Asia/Kolkata') > p_now - interval '5 minutes'
  ), claimed as (
    insert into public.delivery_reminder_push_runs (order_id, reminder_time)
    select order_id, reminder_time from due
    on conflict do nothing
    returning order_id, reminder_time
  )
  select due.order_id, due.customer_name, due.flat_number, due.delivery_time, due.reminder_time
  from due
  join claimed using (order_id, reminder_time);
$$;

revoke all on function public.claim_due_delivery_reminders(timestamptz) from public;
grant execute on function public.claim_due_delivery_reminders(timestamptz) to service_role;
