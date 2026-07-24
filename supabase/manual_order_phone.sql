-- Allows manual/admin orders to retain a customer phone number for calling and WhatsApp.
alter table public.orders
  add column if not exists customer_phone text not null default '';
