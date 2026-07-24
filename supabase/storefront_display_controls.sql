-- Run once for existing projects before deploying the per-block storefront controls.
-- Each optional banner element can now be shown or hidden independently.
alter table public.storefront_settings
  add column if not exists show_banner_image boolean not null default true,
  add column if not exists show_customer_message boolean not null default true,
  add column if not exists show_announcement_title boolean not null default true,
  add column if not exists show_announcement_message boolean not null default true;
