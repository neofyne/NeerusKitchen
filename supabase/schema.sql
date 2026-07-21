create type public.order_stage as enum ('new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered');
create type public.delivery_person as enum ('nanny', 'others');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_date date not null default current_date,
  customer_name text not null,
  flat_number text not null,
  order_details text not null,
  delivery_time time,
  amount numeric(10,2) not null default 0 check (amount >= 0),
  delivered_by public.delivery_person not null default 'nanny',
  is_paid boolean not null default false,
  stage public.order_stage not null default 'new',
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_date_idx on public.orders(order_date);
create index orders_customer_idx on public.orders(customer_name);
create index orders_flat_idx on public.orders(flat_number);

alter table public.orders enable row level security;
create policy "Family members manage orders" on public.orders
  for all to authenticated using (true) with check (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.orders;

-- Only an opaque Netlify Blob key is stored here. Image bytes do not live in
-- Supabase; the authenticated Netlify Function stores and serves them.
alter table public.orders add column if not exists photo_path text;

-- Menu catalogue: family-editable food names and optional dish photos.
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(10,2) not null default 0 check (price >= 0),
  photo_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.menu_items add column if not exists price numeric(10,2) not null default 0;
alter table public.menu_items enable row level security;
create policy "Family members manage menu" on public.menu_items
  for all to authenticated using (true) with check (true);
insert into public.menu_items (name, price) values
  ('Veg sandwich', 120), ('Paneer sandwich', 150), ('Masala khichdi', 140),
  ('Moong dal khichdi', 130), ('Dal rice', 140), ('Rajma rice', 160),
  ('Veg pulao', 150), ('Curd rice', 130), ('Aloo paratha', 90), ('Poha', 80)
on conflict (name) do nothing;
