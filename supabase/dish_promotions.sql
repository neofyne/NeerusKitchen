-- Optional WhatsApp promotion copy and expiry for each day's menu item.

alter table public.daily_menu
  add column if not exists promotion_message text not null default '',
  add column if not exists promotion_until time;
