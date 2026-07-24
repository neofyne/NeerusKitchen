-- Neeru's Home Kitchen intentionally uses a two-state workflow. Historical
-- intermediate values remain in the enum for compatibility, but are no longer
-- valid order states.
update public.orders
set stage = 'new'
where stage not in ('new', 'delivered');

alter table public.orders
  drop constraint if exists orders_two_state_stage;

alter table public.orders
  add constraint orders_two_state_stage
  check (stage in ('new', 'delivered'));
