-- Customer WhatsApp contact shown on the public storefront.
-- Safe to run after supabase/customer_storefront.sql.

alter table public.storefront_settings
  add column if not exists whatsapp_number text not null default '';

update public.storefront_settings
set whatsapp_number = coalesce(whatsapp_number, '')
where id = 1;
