-- Customer checkout payment choice: UPI or cash on delivery.
-- Run this once in the Supabase SQL editor before publishing the storefront.

drop function if exists public.place_customer_order(time, text, jsonb);

create function public.place_customer_order(
  p_delivery_time time,
  p_instructions text,
  p_items jsonb,
  p_payment_method text default 'upi'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.kitchen_today();
  v_local_time time := (timezone('Asia/Kolkata', now()))::time;
  v_settings public.storefront_settings%rowtype;
  v_profile public.customer_profiles%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_daily public.daily_menu%rowtype;
  v_quantity integer;
  v_price numeric(10,2);
  v_total numeric(10,2) := 0;
  v_details text := '';
  v_line_count integer := 0;
begin
  if v_user is null then raise exception 'Please sign in before ordering.'; end if;
  if p_payment_method not in ('upi', 'cash') then raise exception 'Choose UPI or cash on delivery.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty.'; end if;

  select * into v_settings from public.storefront_settings where id = 1;
  if not found or not v_settings.ordering_open then raise exception 'The kitchen is not taking orders right now.'; end if;
  if v_settings.order_cutoff is not null and v_local_time > v_settings.order_cutoff then raise exception 'Today''s order cutoff has passed.'; end if;

  select * into v_profile from public.customer_profiles where id = v_user;
  if not found or trim(v_profile.full_name) = '' or trim(v_profile.flat_number) = '' then
    raise exception 'Complete your name and flat number before ordering.';
  end if;

  insert into public.orders (
    order_date, customer_id, customer_name, flat_number, order_details,
    delivery_time, amount, delivered_by, is_paid, stage, remarks,
    source, payment_status, payment_method
  ) values (
    v_today, v_user, v_profile.full_name, v_profile.flat_number, 'Preparing order…',
    p_delivery_time, 0, 'nanny', false, 'new',
    trim(concat_ws(' · ', nullif(v_profile.standing_instructions, ''), nullif(p_instructions, ''))),
    'customer', 'pending', p_payment_method
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 20 then raise exception 'Invalid item quantity.'; end if;

    select * into v_menu from public.menu_items where id = (v_item ->> 'menu_item_id')::uuid and is_active = true;
    if not found then raise exception 'A selected dish is no longer available.'; end if;

    select * into v_daily from public.daily_menu where menu_item_id = v_menu.id and menu_date = v_today;
    if found and not v_daily.is_available then raise exception '% is sold out.', v_menu.name; end if;
    if found and v_daily.portions_available is not null then
      update public.daily_menu set portions_available = portions_available - v_quantity, updated_at = now()
      where id = v_daily.id and portions_available >= v_quantity;
      if not found then raise exception 'Not enough portions of % remain.', v_menu.name; end if;
    end if;

    v_price := coalesce(v_daily.special_price, v_menu.price);
    insert into public.order_items (order_id, menu_item_id, item_name, unit_price, quantity, unit_label)
    values (v_order_id, v_menu.id, v_menu.name, v_price, v_quantity, v_menu.unit_label);
    v_total := v_total + (v_price * v_quantity);
    v_details := concat_ws(', ', nullif(v_details, ''), format('%s × %s portion%s%s', v_menu.name, v_quantity, case when v_quantity <> 1 then 's' else '' end, case when v_menu.unit_label <> 'portion' then format(' (%s per portion)', v_menu.unit_label) else '' end));
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then raise exception 'Your cart is empty.'; end if;
  update public.orders set amount = v_total, order_details = v_details where id = v_order_id;
  return v_order_id;
end;
$$;

revoke all on function public.place_customer_order(time, text, jsonb, text) from public;
grant execute on function public.place_customer_order(time, text, jsonb, text) to authenticated;
