-- Step 2: sales, receipts, daily cash.

create sequence public.receipt_seq start 1;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_no bigint not null unique default nextval('public.receipt_seq'),
  staff_id uuid not null references public.profiles(id),
  customer_name text not null default '',
  customer_phone text not null default '',
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  total integer not null check (total >= 0),
  payment_method text not null check (payment_method in ('cash','mobile_money')),
  momo_ref text not null default '',
  amount_received integer not null default 0,
  voided boolean not null default false,
  void_reason text not null default '',
  created_at timestamptz not null default now()
);
create index sales_created_idx on public.sales (created_at);
create index sales_staff_idx on public.sales (staff_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  label text not null,
  quantity numeric not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  line_total integer not null check (line_total >= 0)
);
create index sale_items_sale_idx on public.sale_items (sale_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  change numeric not null,
  reason text not null check (reason in ('sale','void','restock','adjust')),
  sale_id uuid references public.sales(id) on delete set null,
  staff_id uuid references public.profiles(id),
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;

-- Staff see their own sales; admins see all. Writes only through the functions below.
create policy sales_read on public.sales for select using (staff_id = auth.uid() or public.is_admin());
create policy sale_items_read on public.sale_items for select using (
  exists (select 1 from public.sales s where s.id = sale_id and (s.staff_id = auth.uid() or public.is_admin())));
create policy movements_read on public.stock_movements for select using (public.is_admin());

-- Record a sale atomically. Prices come from the services table, not the browser.
-- items: [{ "service_id": uuid, "quantity": number }]
create or replace function public.record_sale(
  items jsonb, payment_method text, momo_ref text default '', amount_received integer default 0,
  discount integer default 0, customer_name text default '', customer_phone text default ''
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  s public.sales; it jsonb; svc public.services; qty numeric; sub integer := 0;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if jsonb_array_length(coalesce(items,'[]'::jsonb)) = 0 then raise exception 'empty_sale'; end if;
  if payment_method = 'mobile_money' and coalesce(trim(momo_ref),'') = '' then raise exception 'momo_ref_required'; end if;

  for it in select * from jsonb_array_elements(items) loop
    select * into svc from services where id = (it->>'service_id')::uuid and active;
    if not found then raise exception 'unknown_service'; end if;
    qty := (it->>'quantity')::numeric;
    if qty is null or qty <= 0 then raise exception 'bad_quantity'; end if;
    sub := sub + round(svc.price * qty);
  end loop;
  if discount < 0 or discount > sub then raise exception 'bad_discount'; end if;
  if discount > 0 and not is_admin() and discount > sub / 10 then raise exception 'discount_limit'; end if;

  insert into sales (staff_id, customer_name, customer_phone, subtotal, discount, total, payment_method, momo_ref, amount_received)
  values (auth.uid(), coalesce(customer_name,''), coalesce(customer_phone,''), sub, discount, sub - discount,
          payment_method, coalesce(momo_ref,''), coalesce(amount_received,0))
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
  return s;
end $$;

-- Admin only: cancel a sale and put its stock back.
create or replace function public.void_sale(sale uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  update sales s set voided = true, void_reason = coalesce(void_sale.reason,'') where s.id = void_sale.sale and not s.voided;
  if not found then raise exception 'not_found_or_voided'; end if;
  for m in select sm.stock_item_id, sm.change from stock_movements sm where sm.sale_id = void_sale.sale and sm.reason = 'sale' loop
    update stock_items set quantity = quantity - m.change where id = m.stock_item_id;
    insert into stock_movements (stock_item_id, change, reason, sale_id, staff_id)
    values (m.stock_item_id, -m.change, 'void', void_sale.sale, auth.uid());
  end loop;
end $$;

revoke all on function public.record_sale(jsonb,text,text,integer,integer,text,text) from public, anon;
grant execute on function public.record_sale(jsonb,text,text,integer,integer,text,text) to authenticated;
revoke all on function public.void_sale(uuid,text) from public, anon;
grant execute on function public.void_sale(uuid,text) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
