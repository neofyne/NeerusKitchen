-- Run this once in the Supabase SQL editor before publishing multi-category dishes.
create table if not exists public.menu_item_categories (
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  category_id uuid not null references public.dish_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (menu_item_id, category_id)
);

insert into public.menu_item_categories (menu_item_id, category_id)
select id, category_id from public.menu_items where category_id is not null
on conflict do nothing;

create index if not exists menu_item_categories_category_idx on public.menu_item_categories(category_id);

alter table public.menu_item_categories enable row level security;
grant select on public.menu_item_categories to anon, authenticated;
grant insert, update, delete on public.menu_item_categories to authenticated;

drop policy if exists "Anyone reads dish category links" on public.menu_item_categories;
create policy "Anyone reads dish category links" on public.menu_item_categories
  for select to anon, authenticated using (true);

drop policy if exists "Admins manage dish category links" on public.menu_item_categories;
create policy "Admins manage dish category links" on public.menu_item_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
