-- Owner tools: WhatsApp day summary, public price list (QR menu), per-cashier report,
-- loyalty points (Pro), subscription reminders tracking.

-- 1. Café settings for the new features.
alter table public.businesses
  add column if not exists owner_whatsapp text not null default '',
  add column if not exists menu_public boolean not null default true,
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_per integer not null default 100 check (loyalty_per > 0),     -- F spent for 1 point
  add column if not exists loyalty_value integer not null default 5 check (loyalty_value >= 0),  -- F off per point
  add column if not exists last_reminded_at timestamptz;

create or replace function public.update_my_features(owner_whatsapp text, menu_public boolean, loyalty_enabled boolean, loyalty_per integer, loyalty_value integer)
returns public.businesses language plpgsql security definer set search_path = public as $$
declare b public.businesses;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.role = 'admin') then raise exception 'admin_only'; end if;
  if coalesce(update_my_features.loyalty_per, 1) <= 0 or coalesce(update_my_features.loyalty_value, 0) < 0 then raise exception 'bad_amount'; end if;
  update businesses x set
    owner_whatsapp = coalesce(trim(update_my_features.owner_whatsapp), x.owner_whatsapp),
    menu_public = coalesce(update_my_features.menu_public, x.menu_public),
    loyalty_enabled = coalesce(update_my_features.loyalty_enabled, x.loyalty_enabled),
    loyalty_per = coalesce(update_my_features.loyalty_per, x.loyalty_per),
    loyalty_value = coalesce(update_my_features.loyalty_value, x.loyalty_value)
  where x.id = my_business() returning * into b;
  return b;
end $$;

-- 2. Public price list, readable without signing in. Only shows priced, active services of an active café.
create or replace function public.public_menu(cafe uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', b.name, 'logo_url', b.logo_url, 'address', b.address, 'city', b.city, 'phone', b.phone,
    'currency', b.currency_label,
    'services', coalesce((select jsonb_agg(jsonb_build_object('name_fr', s.name_fr, 'name_en', s.name_en, 'unit_fr', s.unit_fr, 'unit_en', s.unit_en,
                                                             'category', s.category, 'price', s.price) order by s.sort_order, s.name_fr)
                          from services s where s.business_id = b.id and s.active and s.price > 0), '[]'::jsonb),
    'wifi', coalesce((select jsonb_agg(jsonb_build_object('name_fr', v.name_fr, 'name_en', v.name_en, 'price', v.price) order by v.sort_order)
                      from voucher_plans v where v.business_id = b.id and v.active and v.price > 0), '[]'::jsonb))
  from businesses b where b.id = public_menu.cafe and b.menu_public and business_ok(b.id)
$$;

-- 3. Per-cashier report (admin): what each staff member sold and how their till closes went.
create or replace function public.cashier_report(date_from date, date_to date)
returns table (staff_id uuid, full_name text, role text, sales_count bigint, total bigint, cash bigint, momo bigint, account bigint,
               discounts bigint, voided_count bigint, voided_total bigint, topups bigint, expenses_cash bigint,
               closes bigint, short_total bigint, over_total bigint, first_sale timestamptz, last_sale timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare a timestamptz; z timestamptz;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  a := date_from::timestamp at time zone 'Africa/Brazzaville';
  z := (date_to + 1)::timestamp at time zone 'Africa/Brazzaville';
  return query
  select p.id, p.full_name, p.role,
    count(s.id) filter (where not s.voided and s.kind = 'sale'),
    coalesce(sum(s.total) filter (where not s.voided and s.kind = 'sale'), 0)::bigint,
    coalesce(sum(s.total) filter (where not s.voided and s.payment_method = 'cash'), 0)::bigint,
    coalesce(sum(s.total) filter (where not s.voided and s.payment_method = 'mobile_money'), 0)::bigint,
    coalesce(sum(s.total) filter (where not s.voided and s.payment_method = 'account'), 0)::bigint,
    coalesce(sum(s.discount) filter (where not s.voided), 0)::bigint,
    count(s.id) filter (where s.voided),
    coalesce(sum(s.total) filter (where s.voided), 0)::bigint,
    coalesce(sum(s.total) filter (where not s.voided and s.kind = 'topup'), 0)::bigint,
    (select coalesce(sum(e.amount), 0) from expenses e where e.staff_id = p.id and e.payment_method = 'cash' and e.created_at >= a and e.created_at < z)::bigint,
    (select count(*) from cash_closes c where c.staff_id = p.id and c.period_end >= a and c.period_end < z),
    (select coalesce(-sum(c.difference) filter (where c.difference < 0), 0) from cash_closes c where c.staff_id = p.id and c.period_end >= a and c.period_end < z)::bigint,
    (select coalesce(sum(c.difference) filter (where c.difference > 0), 0) from cash_closes c where c.staff_id = p.id and c.period_end >= a and c.period_end < z)::bigint,
    min(s.created_at), max(s.created_at)
  from profiles p
  left join sales s on s.staff_id = p.id and s.created_at >= a and s.created_at < z
  where p.business_id = my_business()
  group by p.id, p.full_name, p.role
  order by 5 desc, p.full_name;
end $$;

-- 4. Loyalty points on customer accounts (Pro plan).
alter table public.customers add column if not exists points integer not null default 0 check (points >= 0);
alter table public.sales
  add column if not exists points_used integer not null default 0,
  add column if not exists points_earned integer not null default 0;

create or replace function public._customers_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.balance <> old.balance and current_setting('sitc.account', true) is distinct from 'on' then
    raise exception 'balance_locked';
  end if;
  if new.points <> old.points and current_setting('sitc.points', true) is distinct from 'on' then
    raise exception 'points_locked';
  end if;
  return new;
end $$;

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert
  with check (public.is_staff() and balance = 0 and points = 0 and (credit_limit = 0 or public.is_admin()));

drop function if exists public.record_sale2(jsonb, text, text, integer, integer, text, text, uuid, text);
create or replace function public.record_sale2(
  items jsonb, payment_method text, momo_ref text default '', amount_received integer default 0,
  discount integer default 0, customer_name text default '', customer_phone text default '',
  customer uuid default null, client_ref text default null, redeem_points integer default 0
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  s public.sales; it jsonb; svc public.services; qty numeric; sub integer := 0; c public.customers; b public.businesses;
  pts integer := greatest(coalesce(record_sale2.redeem_points, 0), 0); pts_off integer := 0; disc integer; earned integer := 0;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if record_sale2.client_ref is not null then
    select * into s from sales where sales.client_ref = record_sale2.client_ref and sales.business_id = my_business();
    if found then return s; end if;
  end if;
  if jsonb_array_length(coalesce(items,'[]'::jsonb)) = 0 then raise exception 'empty_sale'; end if;
  if record_sale2.payment_method not in ('cash','mobile_money','account') then raise exception 'bad_payment'; end if;
  if record_sale2.payment_method = 'mobile_money' and coalesce(trim(record_sale2.momo_ref),'') = '' then raise exception 'momo_ref_required'; end if;
  if record_sale2.customer is not null then
    select * into c from customers where id = record_sale2.customer and active and business_id = my_business() for update;
    if not found then raise exception 'unknown_customer'; end if;
  elsif record_sale2.payment_method = 'account' then raise exception 'customer_required';
  end if;
  select * into b from businesses where id = my_business();

  for it in select * from jsonb_array_elements(items) loop
    select * into svc from services where id = (it->>'service_id')::uuid and active and business_id = my_business();
    if not found then raise exception 'unknown_service'; end if;
    qty := (it->>'quantity')::numeric;
    if qty is null or qty <= 0 then raise exception 'bad_quantity'; end if;
    sub := sub + round(svc.price * qty);
  end loop;
  if discount < 0 or discount > sub then raise exception 'bad_discount'; end if;
  if discount > 0 and not is_admin() and discount > sub / 10 then raise exception 'discount_limit'; end if;

  -- Points: only with a customer, on the Pro plan, with loyalty switched on.
  if pts > 0 then
    if c.id is null or b.plan <> 'pro' or not b.loyalty_enabled or b.loyalty_value <= 0 then raise exception 'loyalty_off'; end if;
    if pts > c.points then raise exception 'not_enough_points'; end if;
    pts_off := pts * b.loyalty_value;
    if pts_off > sub - discount then raise exception 'too_many_points'; end if;
  end if;
  disc := discount + pts_off;
  if c.id is not null and b.plan = 'pro' and b.loyalty_enabled then earned := (sub - disc) / b.loyalty_per; end if;
  if record_sale2.payment_method = 'account' and c.balance - (sub - disc) < -c.credit_limit then raise exception 'credit_limit'; end if;

  insert into sales (staff_id, customer_name, customer_phone, subtotal, discount, total, payment_method, momo_ref, amount_received, customer_id, client_ref, points_used, points_earned)
  values (auth.uid(), coalesce(nullif(record_sale2.customer_name,''), c.name, ''), coalesce(nullif(record_sale2.customer_phone,''), c.phone, ''),
          sub, disc, sub - disc, record_sale2.payment_method, coalesce(record_sale2.momo_ref,''),
          case when record_sale2.payment_method = 'cash' then greatest(coalesce(record_sale2.amount_received,0), sub - disc) else sub - disc end,
          record_sale2.customer, record_sale2.client_ref, pts, earned)
  returning * into s;

  for it in select * from jsonb_array_elements(items) loop
    select * into svc from services where id = (it->>'service_id')::uuid;
    qty := (it->>'quantity')::numeric;
    insert into sale_items (sale_id, service_id, label, quantity, unit_price, line_total)
    values (s.id, svc.id, svc.name_fr || ' / ' || svc.name_en, qty, svc.price, round(svc.price * qty));
    if svc.stock_item_id is not null and svc.stock_per_unit > 0 then
      update stock_items set quantity = quantity - qty * svc.stock_per_unit where id = svc.stock_item_id;
      insert into stock_movements (stock_item_id, change, reason, sale_id, staff_id)
      values (svc.stock_item_id, -(qty * svc.stock_per_unit), 'sale', s.id, auth.uid());
    end if;
  end loop;

  if record_sale2.payment_method = 'account' then
    perform _account_move(c.id, -(sub - disc), 'purchase', s.id);
  end if;
  if pts > 0 or earned > 0 then
    perform set_config('sitc.points', 'on', true);
    update customers set points = points - pts + earned where id = c.id;
    perform set_config('sitc.points', 'off', true);
  end if;
  return s;
end $$;

create or replace function public.void_sale(sale uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m record; v public.sales;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  update sales s set voided = true, void_reason = coalesce(void_sale.reason,'') where s.id = void_sale.sale and not s.voided and s.business_id = my_business() returning * into v;
  if not found then raise exception 'not_found_or_voided'; end if;
  for m in select sm.stock_item_id, sm.change from stock_movements sm where sm.sale_id = void_sale.sale and sm.reason = 'sale' loop
    update stock_items set quantity = quantity - m.change where id = m.stock_item_id;
    insert into stock_movements (stock_item_id, change, reason, sale_id, staff_id)
    values (m.stock_item_id, -m.change, 'void', void_sale.sale, auth.uid());
  end loop;
  if v.customer_id is not null and (v.payment_method = 'account' or v.kind = 'topup') then
    perform _account_move(v.customer_id, case when v.kind = 'topup' then -v.total else v.total end, 'void', v.id);
  end if;
  if v.customer_id is not null and (v.points_used > 0 or v.points_earned > 0) then
    -- Give back the points used; take back the points earned (never below zero).
    perform set_config('sitc.points', 'on', true);
    update customers set points = greatest(points + v.points_used - v.points_earned, 0) where id = v.customer_id;
    perform set_config('sitc.points', 'off', true);
  end if;
end $$;

-- 5. Subscription reminders: the platform owner marks a café as reminded.
create or replace function public.platform_mark_reminded(business uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'admin_only'; end if;
  update businesses set last_reminded_at = now() where id = platform_mark_reminded.business;
end $$;

drop function if exists public.platform_overview();
create or replace function public.platform_overview()
returns table (id uuid, name text, city text, phone text, email text, owner_name text, plan text, status text, trial_ends_at timestamptz, paid_until timestamptz,
               created_at timestamptz, staff bigint, sales_30d bigint, revenue_30d bigint, last_sale timestamptz, pending_payments bigint,
               owner_whatsapp text, last_reminded_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.city, b.phone, b.email, b.owner_name, b.plan, b.status, b.trial_ends_at, b.paid_until, b.created_at,
    (select count(*) from profiles p where p.business_id = b.id and p.active),
    (select count(*) from sales s where s.business_id = b.id and not s.voided and s.created_at > now() - interval '30 days'),
    (select coalesce(sum(s.total),0) from sales s where s.business_id = b.id and not s.voided and s.kind = 'sale' and s.created_at > now() - interval '30 days'),
    (select max(s.created_at) from sales s where s.business_id = b.id),
    (select count(*) from subscription_payments sp where sp.business_id = b.id and sp.status = 'pending'),
    b.owner_whatsapp, b.last_reminded_at
  from businesses b where is_platform_admin() order by b.created_at
$$;

-- Grants.
revoke all on function public.update_my_features(text,boolean,boolean,integer,integer) from public, anon;
revoke all on function public.cashier_report(date,date) from public, anon;
revoke all on function public.record_sale2(jsonb,text,text,integer,integer,text,text,uuid,text,integer) from public, anon;
revoke all on function public.void_sale(uuid,text) from public, anon;
revoke all on function public.platform_mark_reminded(uuid) from public, anon;
revoke all on function public.platform_overview() from public, anon;
revoke all on function public._customers_guard() from public, anon, authenticated;
grant execute on function public.update_my_features(text,boolean,boolean,integer,integer) to authenticated;
grant execute on function public.cashier_report(date,date) to authenticated;
grant execute on function public.record_sale2(jsonb,text,text,integer,integer,text,text,uuid,text,integer) to authenticated;
grant execute on function public.void_sale(uuid,text) to authenticated;
grant execute on function public.platform_mark_reminded(uuid) to authenticated;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.public_menu(uuid) to anon, authenticated;
