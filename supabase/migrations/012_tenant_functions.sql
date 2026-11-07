-- Multi-café: every money function now only touches the caller's own café.

create or replace function public.record_sale2(
  items jsonb, payment_method text, momo_ref text default '', amount_received integer default 0,
  discount integer default 0, customer_name text default '', customer_phone text default '',
  customer uuid default null, client_ref text default null
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  s public.sales; it jsonb; svc public.services; qty numeric; sub integer := 0; c public.customers;
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

  for it in select * from jsonb_array_elements(items) loop
    select * into svc from services where id = (it->>'service_id')::uuid and active and business_id = my_business();
    if not found then raise exception 'unknown_service'; end if;
    qty := (it->>'quantity')::numeric;
    if qty is null or qty <= 0 then raise exception 'bad_quantity'; end if;
    sub := sub + round(svc.price * qty);
  end loop;
  if discount < 0 or discount > sub then raise exception 'bad_discount'; end if;
  if discount > 0 and not is_admin() and discount > sub / 10 then raise exception 'discount_limit'; end if;
  if record_sale2.payment_method = 'account' and c.balance - (sub - discount) < -c.credit_limit then raise exception 'credit_limit'; end if;

  insert into sales (staff_id, customer_name, customer_phone, subtotal, discount, total, payment_method, momo_ref, amount_received, customer_id, client_ref)
  values (auth.uid(), coalesce(nullif(record_sale2.customer_name,''), c.name, ''), coalesce(nullif(record_sale2.customer_phone,''), c.phone, ''),
          sub, discount, sub - discount, record_sale2.payment_method, coalesce(record_sale2.momo_ref,''),
          case when record_sale2.payment_method = 'cash' then greatest(coalesce(record_sale2.amount_received,0), sub - discount) else sub - discount end,
          record_sale2.customer, record_sale2.client_ref)
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
    perform _account_move(c.id, -(sub - discount), 'purchase', s.id);
  end if;
  return s;
end $$;

create or replace function public.topup_account(customer uuid, amount integer, payment_method text, momo_ref text default '', amount_received integer default 0)
returns public.sales language plpgsql security definer set search_path = public as $$
declare c public.customers; s public.sales;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into c from customers where id = topup_account.customer and active and business_id = my_business() for update;
  if not found then raise exception 'unknown_customer'; end if;
  s := _simple_sale('Recharge compte ' || c.name || ' / Account top-up ' || c.name, amount,
                    topup_account.payment_method, topup_account.momo_ref, topup_account.amount_received, c.name, c.phone);
  update sales set kind = 'topup', customer_id = c.id where id = s.id returning * into s;
  perform _account_move(c.id, amount, 'topup', s.id);
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
end $$;

create or replace function public.pay_job(job uuid, amount integer, payment_method text, momo_ref text default '', amount_received integer default 0)
returns public.sales language plpgsql security definer set search_path = public as $$
declare j public.jobs; s public.sales;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into j from jobs where id = pay_job.job and business_id = my_business() for update;
  if not found then raise exception 'not_found'; end if;
  if amount <= 0 or j.paid + amount > j.price then raise exception 'bad_amount'; end if;
  s := _simple_sale(
    'Travail N°' || j.number || case when j.paid + amount >= j.price then ' (solde)' else ' (acompte)' end
      || ' / Job No.' || j.number || case when j.paid + amount >= j.price then ' (balance)' else ' (deposit)' end,
    amount, pay_job.payment_method, pay_job.momo_ref, pay_job.amount_received, j.customer_name, j.customer_phone);
  perform set_config('sitc.paying', 'on', true);
  update jobs set paid = paid + amount where id = j.id;
  perform set_config('sitc.paying', 'off', true);
  insert into job_payments (job_id, sale_id, amount) values (j.id, s.id, amount);
  return s;
end $$;

create or replace function public.start_session(station uuid, service uuid, customer_name text default '')
returns public.computer_sessions language plpgsql security definer set search_path = public as $$
declare svc public.services; cs public.computer_sessions;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if not exists (select 1 from stations where id = start_session.station and business_id = my_business()) then raise exception 'not_found'; end if;
  select * into svc from services where id = start_session.service and active and category = 'internet' and business_id = my_business();
  if not found then raise exception 'unknown_service'; end if;
  if svc.price <= 0 then raise exception 'price_not_set'; end if;
  insert into computer_sessions (station_id, service_id, rate_per_hour, customer_name, started_by)
  values (start_session.station, svc.id, svc.price, coalesce(start_session.customer_name,''), auth.uid())
  returning * into cs;
  return cs;
exception when unique_violation then raise exception 'station_busy';
end $$;

create or replace function public.end_session(session uuid, payment_method text, momo_ref text default '', amount_received integer default 0)
returns public.sales language plpgsql security definer set search_path = public as $$
declare cs public.computer_sessions; st public.stations; m integer; amt integer; s public.sales;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into cs from computer_sessions where id = end_session.session and ended_at is null and business_id = my_business() for update;
  if not found then raise exception 'not_found'; end if;
  select * into st from stations where id = cs.station_id;
  m := ceil(extract(epoch from (now() - cs.started_at)) / 60.0)::integer;
  amt := session_price(cs.rate_per_hour, m);
  s := _simple_sale('Internet ' || st.name || ' (' || m || ' min) / Internet ' || st.name || ' (' || m || ' min)',
                    amt, end_session.payment_method, end_session.momo_ref, end_session.amount_received, cs.customer_name, '');
  update computer_sessions set ended_at = now(), minutes = m, amount = amt, sale_id = s.id, ended_by = auth.uid() where id = cs.id;
  return s;
end $$;

create or replace function public.cancel_session(session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  update computer_sessions set ended_at = now(), minutes = 0, amount = 0, ended_by = auth.uid()
  where id = cancel_session.session and ended_at is null and business_id = my_business();
end $$;

create or replace function public.restock(item uuid, change numeric, reason text default 'restock', note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if restock.reason not in ('restock','adjust') then raise exception 'bad_reason'; end if;
  if restock.reason = 'restock' and change <= 0 then raise exception 'bad_quantity'; end if;
  if restock.reason = 'adjust' and not is_admin() then raise exception 'admin_only'; end if;
  update stock_items set quantity = quantity + change where id = restock.item and business_id = my_business();
  if not found then raise exception 'not_found'; end if;
  insert into stock_movements (stock_item_id, change, reason, staff_id, note)
  values (restock.item, change, restock.reason, auth.uid(), coalesce(restock.note,''));
end $$;

create or replace function public.import_vouchers(plan uuid, codes text[], batch text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  if not exists (select 1 from voucher_plans where id = import_vouchers.plan and business_id = my_business()) then raise exception 'unknown_plan'; end if;
  insert into vouchers (plan_id, code, batch)
  select import_vouchers.plan, c, coalesce(import_vouchers.batch,'')
  from (select distinct trim(x) c from unnest(codes) x) q where c <> ''
  on conflict (code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.sell_voucher(plan uuid, payment_method text, momo_ref text default '', amount_received integer default 0, customer_name text default '')
returns public.sales language plpgsql security definer set search_path = public as $$
declare p public.voucher_plans; v public.vouchers; s public.sales;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into p from voucher_plans where id = sell_voucher.plan and active and business_id = my_business();
  if not found then raise exception 'unknown_plan'; end if;
  select * into v from vouchers where plan_id = p.id and status = 'available' order by created_at, code limit 1 for update skip locked;
  if not found then raise exception 'no_vouchers_left'; end if;
  s := _simple_sale('Wi-Fi ' || p.name_fr || ' · Code : ' || v.code || ' / Wi-Fi ' || p.name_en || ' · Code: ' || v.code,
                    p.price, sell_voucher.payment_method, sell_voucher.momo_ref, sell_voucher.amount_received, sell_voucher.customer_name, '');
  update vouchers set status = 'sold', sale_id = s.id, sold_by = auth.uid(), sold_at = now() where id = v.id;
  return s;
end $$;

create or replace function public.voucher_counts()
returns table (plan_id uuid, available bigint, sold bigint)
language sql stable security definer set search_path = public as $$
  select p.id,
    (select count(*) from vouchers v where v.plan_id = p.id and v.status = 'available'),
    (select count(*) from vouchers v where v.plan_id = p.id and v.status = 'sold')
  from voucher_plans p where is_staff() and p.business_id = my_business()
$$;
