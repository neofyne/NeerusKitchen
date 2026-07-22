-- Run this once in the Supabase SQL editor before publishing announcements.
alter table public.storefront_settings
  add column if not exists announcement_enabled boolean not null default false,
  add column if not exists announcement_title text not null default '',
  add column if not exists announcement_message text not null default '',
  add column if not exists announcement_image_path text not null default '';
