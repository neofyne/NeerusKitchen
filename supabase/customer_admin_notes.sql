-- Private notes for the family admin, keyed by customer name and flat number.
create table if not exists public.customer_admin_notes (
  customer_name text not null,
  flat_number text not null,
  remarks text not null default '',
  updated_at timestamptz not null default now(),
  primary key (customer_name, flat_number)
);

alter table public.customer_admin_notes enable row level security;
grant select, insert, update, delete on public.customer_admin_notes to authenticated;
drop policy if exists "Admins manage customer notes" on public.customer_admin_notes;
create policy "Admins manage customer notes" on public.customer_admin_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
