-- Customer accounts (prepaid balance or credit up to a limit) + offline-safe sale recording.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  kind text not null default 'individual' check (kind in ('individual','business')),
  balance integer not null default 0,
  credit_limit integer not null default 0 check (credit_limit >= 0),
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index customers_name_idx on public.customers (lower(name));

create table public.account_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  change integer not null,
  kind text not null check (kind in ('purchase','topup','void')),
  sale_id uuid references public.sales(id),
  staff_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index account_entries_customer_idx on public.account_entries (customer_id, created_at);

alter table public.sales add column customer_id uuid references public.customers(id);
alter table public.sales add column client_ref text unique;

alter table public.customers enable row level security;
alter table public.account_entries enable row level security;
create policy customers_read on public.customers for select using (public.is_staff());
create policy customers_insert on public.customers for insert with check (public.is_staff() and balance = 0 and (credit_limit = 0 or public.is_admin()));
create policy customers_admin_update on public.customers for update using (public.is_admin()) with check (public.is_admin());
create policy entries_read on public.account_entries for select using (public.is_staff());

-- Balance only moves through the functions below.
create or replace function public._customers_guard() returns trigger language plpgsql as $$
begin
  if new.balance <> old.balance and current_setting('sitc.account', true) is distinct from 'on' then
    raise exception 'balance_locked';
  end if;
  return new;
end $$;
create trigger customers_guard before update on public.customers for each row execute function public._customers_guard();

create or replace function public._account_move(cust uuid, amount integer, entry_kind text, sale uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('sitc.account', 'on', true);
  update customers set balance = balance + amount where id = cust;
  perform set_config('sitc.account', 'off', true);
  insert into account_entries (customer_id, change, kind, sale_id, staff_id) values (cust, amount, entry_kind, sale, auth.uid());
end $$;
revoke all on function public._account_move(uuid,integer,text,uuid) from public, anon, authenticated;

-- Like record_sale, plus: optional customer, payment 'account', and client_ref so a sale
-- queued offline is never recorded twice.
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
    select * into s from sales where sales.client_ref = record_sale2.client_ref;
    if found then return s; end if;
  end if;
  if jsonb_array_length(coalesce(items,'[]'::jsonb)) = 0 then raise exception 'empty_sale'; end if;
  if record_sale2.payment_method not in ('cash','mobile_money','account') then raise exception 'bad_payment'; end if;
  if record_sale2.payment_method = 'mobile_money' and coalesce(trim(record_sale2.momo_ref),'') = '' then raise exception 'momo_ref_required'; end if;
  if record_sale2.customer is not null then
    select * into c from customers where id = record_sale2.customer and active for update;
    if not found then raise exception 'unknown_customer'; end if;
  elsif record_sale2.payment_method = 'account' then raise exception 'customer_required';
  end if;

  for it in select * from jsonb_array_elements(items) loop
    select * into svc from services where id = (it->>'service_id')::uuid and active;
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
revoke all on function public.record_sale2(jsonb,text,text,integer,integer,text,text,uuid,text) from public, anon;
grant execute on function public.record_sale2(jsonb,text,text,integer,integer,text,text,uuid,text) to authenticated;

-- Add money to an account (prepay, or pay off what is owed). Counts as cash in, not revenue.
create or replace function public.topup_account(customer uuid, amount integer, payment_method text, momo_ref text default '', amount_received integer default 0)
returns public.sales language plpgsql security definer set search_path = public as $$
declare c public.customers; s public.sales;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into c from customers where id = topup_account.customer and active for update;
  if not found then raise exception 'unknown_customer'; end if;
  s := _simple_sale('Recharge compte ' || c.name || ' / Account top-up ' || c.name, amount,
                    topup_account.payment_method, topup_account.momo_ref, topup_account.amount_received, c.name, c.phone);
  update sales set kind = 'topup', customer_id = c.id where id = s.id returning * into s;
  perform _account_move(c.id, amount, 'topup', s.id);
  return s;
end $$;
revoke all on function public.topup_account(uuid,integer,text,text,integer) from public, anon;
grant execute on function public.topup_account(uuid,integer,text,text,integer) to authenticated;

-- Voiding now also gives back account money (for account purchases) or takes back a top-up.
create or replace function public.void_sale(sale uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m record; v public.sales;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  update sales s set voided = true, void_reason = coalesce(void_sale.reason,'') where s.id = void_sale.sale and not s.voided returning * into v;
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
