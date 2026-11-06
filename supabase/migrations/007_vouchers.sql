-- Wi-Fi vouchers (codes generated in HotspotGate, imported here, sold at the counter).

create table public.voucher_plans (
  id uuid primary key default gen_random_uuid(),
  name_fr text not null,
  name_en text not null,
  minutes integer not null check (minutes > 0),
  price integer not null check (price >= 0),
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.voucher_plans(id),
  code text not null unique,
  status text not null default 'available' check (status in ('available','sold','void')),
  batch text not null default '',
  sale_id uuid references public.sales(id),
  sold_by uuid references public.profiles(id),
  sold_at timestamptz,
  created_at timestamptz not null default now()
);
create index vouchers_plan_status_idx on public.vouchers (plan_id, status, created_at);

alter table public.voucher_plans enable row level security;
alter table public.vouchers enable row level security;
create policy vplans_read on public.voucher_plans for select using (public.is_staff());
create policy vplans_admin on public.voucher_plans for all using (public.is_admin()) with check (public.is_admin());
-- Cashiers never see unsold codes; they only see codes they sold.
create policy vouchers_read on public.vouchers for select using (public.is_admin() or sold_by = auth.uid());
create policy vouchers_admin_update on public.vouchers for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.voucher_counts()
returns table (plan_id uuid, available bigint, sold bigint)
language sql stable security definer set search_path = public as $$
  select p.id,
    (select count(*) from vouchers v where v.plan_id = p.id and v.status = 'available'),
    (select count(*) from vouchers v where v.plan_id = p.id and v.status = 'sold')
  from voucher_plans p where is_staff()
$$;

create or replace function public.import_vouchers(plan uuid, codes text[], batch text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_admin() then raise exception 'admin_only'; end if;
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
  select * into p from voucher_plans where id = sell_voucher.plan and active;
  if not found then raise exception 'unknown_plan'; end if;
  select * into v from vouchers where plan_id = p.id and status = 'available' order by created_at, code limit 1 for update skip locked;
  if not found then raise exception 'no_vouchers_left'; end if;
  s := _simple_sale('Wi-Fi ' || p.name_fr || ' · Code : ' || v.code || ' / Wi-Fi ' || p.name_en || ' · Code: ' || v.code,
                    p.price, sell_voucher.payment_method, sell_voucher.momo_ref, sell_voucher.amount_received, sell_voucher.customer_name, '');
  update vouchers set status = 'sold', sale_id = s.id, sold_by = auth.uid(), sold_at = now() where id = v.id;
  return s;
end $$;

revoke all on function public.voucher_counts() from public, anon;
revoke all on function public.import_vouchers(uuid,text[],text) from public, anon;
revoke all on function public.sell_voucher(uuid,text,text,integer,text) from public, anon;
grant execute on function public.voucher_counts() to authenticated;
grant execute on function public.import_vouchers(uuid,text[],text) to authenticated;
grant execute on function public.sell_voucher(uuid,text,text,integer,text) to authenticated;

insert into public.voucher_plans (name_fr, name_en, minutes, price, sort_order) values
  ('1 heure', '1 hour', 60, 0, 1), ('1 jour', '1 day', 1440, 0, 2), ('1 semaine', '1 week', 10080, 0, 3);
