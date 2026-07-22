-- Admin action-centre alerts depend on Postgres Changes being published for
-- both new customer access requests and new customer orders.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_profiles'
  ) then
    alter publication supabase_realtime add table public.customer_profiles;
  end if;
end;
$$;
