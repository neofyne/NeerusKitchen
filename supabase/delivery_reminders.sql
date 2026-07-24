-- Saved delivery reminders for the kitchen order desk.
-- A reminder is optional and stores the exact local reminder time alongside
-- the selected preset offset when one was used.

alter table public.orders
  add column if not exists reminder_time time,
  add column if not exists reminder_offset_minutes integer
    check (reminder_offset_minutes is null or reminder_offset_minutes between 1 and 720);

create index if not exists orders_reminder_time_idx
  on public.orders (order_date, reminder_time)
  where reminder_time is not null;
