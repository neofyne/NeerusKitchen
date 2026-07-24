-- A delivered order must never retain a reference to a temporary order photo.
-- Apply after cleaning any legacy delivered-order photos through Admin Settings.

alter table public.orders
  drop constraint if exists orders_delivered_without_photo;

alter table public.orders
  add constraint orders_delivered_without_photo
  check (stage <> 'delivered' or photo_path is null);
