-- Multi-café (multi-tenant): every row belongs to a business. Stone's IT Consulting becomes business no. 1.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text not null default '',
  address text not null default '',
  city text not null default '',
  phone text not null default '',
  email text not null default '',
  receipt_footer text not null default 'Merci de votre visite ! / Thank you for your visit!',
  logo_url text not null default '',
  currency_label text not null default 'F CFA',
  plan text not null default 'pro' check (plan in ('starter','pro')),
  status text not null default 'trial' check (status in ('trial','active','suspended')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  paid_until timestamptz,
  receipt_counter bigint not null default 0,
  job_counter bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);

create table public.plan_prices (
  plan text primary key check (plan in ('starter','pro')),
  monthly integer not null,
  yearly integer not null,
  max_staff integer,      -- null = unlimited
  max_stations integer
);
insert into public.plan_prices values ('starter', 7500, 75000, 2, 4), ('pro', 15000, 150000, null, null);

-- Stone's IT Consulting = business no. 1 (owner's own café, never expires).
insert into public.businesses (name, address, city, phone, email, receipt_footer, logo_url, plan, status, trial_ends_at, paid_until, receipt_counter, job_counter)
select s.business_name, s.address, 'Brazzaville', s.phone, s.email, s.receipt_footer, '/logo.png', 'pro', 'active', now(), '2099-12-31',
       coalesce((select max(receipt_no) from public.sales), 0), coalesce((select max(job_no) from public.jobs), 0)
from public.settings s where s.id = 1;

alter table public.profiles add column business_id uuid references public.businesses(id);
update public.profiles set business_id = (select id from public.businesses order by created_at limit 1);
insert into public.platform_admins (user_id) select id from public.profiles where role = 'admin';

create or replace function public.my_business() returns uuid
language sql stable security definer set search_path = public as $$
  select business_id from profiles where id = auth.uid()
$$;
create or replace function public.business_ok(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses x where x.id = b and x.status <> 'suspended'
                 and greatest(x.trial_ends_at, coalesce(x.paid_until, x.trial_ends_at)) >= now())
$$;
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;
-- Staff/admin now also require the café's subscription (or trial) to be valid.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.active and business_ok(p.business_id))
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.role = 'admin' and business_ok(p.business_id))
$$;

alter table public.services add column business_id uuid references public.businesses(id) default public.my_business();
update public.services set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.services alter column business_id set not null;
create index services_business_idx on public.services (business_id);
create policy services_tenant on public.services as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.stock_items add column business_id uuid references public.businesses(id) default public.my_business();
update public.stock_items set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.stock_items alter column business_id set not null;
create index stock_items_business_idx on public.stock_items (business_id);
create policy stock_items_tenant on public.stock_items as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.sales add column business_id uuid references public.businesses(id) default public.my_business();
update public.sales set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.sales alter column business_id set not null;
create index sales_business_idx on public.sales (business_id);
create policy sales_tenant on public.sales as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.sale_items add column business_id uuid references public.businesses(id) default public.my_business();
update public.sale_items set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.sale_items alter column business_id set not null;
create index sale_items_business_idx on public.sale_items (business_id);
create policy sale_items_tenant on public.sale_items as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.stock_movements add column business_id uuid references public.businesses(id) default public.my_business();
update public.stock_movements set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.stock_movements alter column business_id set not null;
create index stock_movements_business_idx on public.stock_movements (business_id);
create policy stock_movements_tenant on public.stock_movements as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.jobs add column business_id uuid references public.businesses(id) default public.my_business();
update public.jobs set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.jobs alter column business_id set not null;
create index jobs_business_idx on public.jobs (business_id);
create policy jobs_tenant on public.jobs as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.job_payments add column business_id uuid references public.businesses(id) default public.my_business();
update public.job_payments set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.job_payments alter column business_id set not null;
create index job_payments_business_idx on public.job_payments (business_id);
create policy job_payments_tenant on public.job_payments as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.stations add column business_id uuid references public.businesses(id) default public.my_business();
update public.stations set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.stations alter column business_id set not null;
create index stations_business_idx on public.stations (business_id);
create policy stations_tenant on public.stations as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.computer_sessions add column business_id uuid references public.businesses(id) default public.my_business();
update public.computer_sessions set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.computer_sessions alter column business_id set not null;
create index computer_sessions_business_idx on public.computer_sessions (business_id);
create policy computer_sessions_tenant on public.computer_sessions as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.expenses add column business_id uuid references public.businesses(id) default public.my_business();
update public.expenses set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.expenses alter column business_id set not null;
create index expenses_business_idx on public.expenses (business_id);
create policy expenses_tenant on public.expenses as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.cash_closes add column business_id uuid references public.businesses(id) default public.my_business();
update public.cash_closes set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.cash_closes alter column business_id set not null;
create index cash_closes_business_idx on public.cash_closes (business_id);
create policy cash_closes_tenant on public.cash_closes as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.voucher_plans add column business_id uuid references public.businesses(id) default public.my_business();
update public.voucher_plans set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.voucher_plans alter column business_id set not null;
create index voucher_plans_business_idx on public.voucher_plans (business_id);
create policy voucher_plans_tenant on public.voucher_plans as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.vouchers add column business_id uuid references public.businesses(id) default public.my_business();
update public.vouchers set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.vouchers alter column business_id set not null;
create index vouchers_business_idx on public.vouchers (business_id);
create policy vouchers_tenant on public.vouchers as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.customers add column business_id uuid references public.businesses(id) default public.my_business();
update public.customers set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.customers alter column business_id set not null;
create index customers_business_idx on public.customers (business_id);
create policy customers_tenant on public.customers as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.account_entries add column business_id uuid references public.businesses(id) default public.my_business();
update public.account_entries set business_id = (select id from public.businesses order by created_at limit 1);
alter table public.account_entries alter column business_id set not null;
create index account_entries_business_idx on public.account_entries (business_id);
create policy account_entries_tenant on public.account_entries as restrictive for all to authenticated
  using (business_id = public.my_business()) with check (business_id = public.my_business());

alter table public.profiles alter column business_id set not null;
create index profiles_business_idx on public.profiles (business_id);
create policy profiles_tenant on public.profiles as restrictive for all to authenticated
  using (business_id = public.my_business() or id = auth.uid()) with check (business_id = public.my_business());

-- Per-café receipt and job numbers.
alter table public.sales add column number bigint;
update public.sales set number = receipt_no;
alter table public.jobs add column number bigint;
update public.jobs set number = job_no;
create or replace function public._number_sale() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    update businesses set receipt_counter = receipt_counter + 1 where id = new.business_id returning receipt_counter into new.number;
  end if;
  return new;
end $$;
create trigger sales_number before insert on public.sales for each row execute function public._number_sale();
create or replace function public._number_job() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    update businesses set job_counter = job_counter + 1 where id = new.business_id returning job_counter into new.number;
  end if;
  return new;
end $$;
create trigger jobs_number before insert on public.jobs for each row execute function public._number_job();
create unique index sales_business_number on public.sales (business_id, number);
create unique index jobs_business_number on public.jobs (business_id, number);

-- Businesses: a café reads its own row (even when expired, so it can see how to pay); the platform owner reads all.
alter table public.businesses enable row level security;
alter table public.platform_admins enable row level security;
alter table public.plan_prices enable row level security;
create policy businesses_read on public.businesses for select to authenticated using (id = public.my_business() or public.is_platform_admin());
create policy businesses_platform on public.businesses for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy platform_admins_read on public.platform_admins for select to authenticated using (user_id = auth.uid());
create policy plan_prices_read on public.plan_prices for select using (true);
create policy plan_prices_platform on public.plan_prices for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Café admin edits its own name, address, logo… (not plan, status or dates).
create or replace function public.update_my_business(name text, owner_name text, address text, city text, phone text, email text, receipt_footer text, logo_url text, currency_label text)
returns public.businesses language plpgsql security definer set search_path = public as $$
declare b public.businesses;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.role = 'admin') then raise exception 'admin_only'; end if;
  update businesses x set name = coalesce(nullif(trim(update_my_business.name),''), x.name), owner_name = coalesce(update_my_business.owner_name, x.owner_name),
    address = coalesce(update_my_business.address, x.address), city = coalesce(update_my_business.city, x.city), phone = coalesce(update_my_business.phone, x.phone),
    email = coalesce(update_my_business.email, x.email), receipt_footer = coalesce(update_my_business.receipt_footer, x.receipt_footer),
    logo_url = coalesce(update_my_business.logo_url, x.logo_url), currency_label = coalesce(nullif(trim(update_my_business.currency_label),''), x.currency_label)
  where x.id = my_business() returning * into b;
  return b;
end $$;

-- New auth users get a profile in the café named in their metadata (set by the sign-up / create-staff functions).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare b uuid := nullif(new.raw_user_meta_data->>'business_id','')::uuid;
begin
  if b is null then raise exception 'business_required'; end if;
  insert into profiles (id, full_name, role, business_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when new.raw_user_meta_data->>'role' = 'admin' then 'admin' else 'staff' end, b);
  return new;
end $$;

-- Starter catalogue for a new café (called by the sign-up function with the service key).
create or replace function public.seed_business(b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare paper uuid;
begin
  insert into stock_items (business_id, name, unit, quantity, low_threshold) values
    (b, 'Papier A4 / A4 paper', 'feuilles', 0, 500), (b, 'Encre noire / Black ink', 'cartouche', 0, 1), (b, 'Encre couleur / Colour ink', 'cartouche', 0, 1);
  select id into paper from stock_items where business_id = b and name like 'Papier A4%';
  insert into services (business_id, name_fr, name_en, category, price, unit_fr, unit_en, sort_order, stock_item_id, stock_per_unit) values
    (b, 'Photocopie N&B', 'B&W photocopy', 'documents', 0, 'page', 'page', 10, paper, 1),
    (b, 'Photocopie couleur', 'Colour photocopy', 'documents', 0, 'page', 'page', 20, paper, 1),
    (b, 'Impression N&B', 'B&W print', 'printing', 0, 'page', 'page', 30, paper, 1),
    (b, 'Impression couleur', 'Colour print', 'printing', 0, 'page', 'page', 40, paper, 1),
    (b, 'Numérisation', 'Scanning', 'documents', 0, 'page', 'page', 50, null, 0),
    (b, 'Saisie de document', 'Typing', 'documents', 0, 'page', 'page', 60, null, 0),
    (b, 'Photo d''identité', 'ID photo', 'printing', 0, 'lot', 'set', 70, null, 0),
    (b, 'Rame de papier A4', 'Ream of A4 paper', 'paper', 0, 'rame', 'ream', 80, paper, 500),
    (b, 'Feuille A4', 'A4 sheet', 'paper', 0, 'feuille', 'sheet', 90, paper, 1),
    (b, 'Internet / ordinateur', 'Internet / computer', 'internet', 0, 'heure', 'hour', 100, null, 0),
    (b, 'Conception de CV', 'CV design', 'design', 0, 'unité', 'unit', 110, null, 0);
  insert into stations (business_id, name, sort_order) values (b,'PC 1',1),(b,'PC 2',2),(b,'PC 3',3),(b,'PC 4',4);
  insert into voucher_plans (business_id, name_fr, name_en, minutes, price, sort_order) values
    (b,'1 heure','1 hour',60,0,1),(b,'1 jour','1 day',1440,0,2),(b,'1 semaine','1 week',10080,0,3);
end $$;
revoke all on function public.seed_business(uuid) from public, anon, authenticated;

-- Plan limit on computers (starter: 4).
create or replace function public._stations_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer;
begin
  select pp.max_stations into lim from businesses b join plan_prices pp on pp.plan = b.plan where b.id = new.business_id;
  if lim is not null and (select count(*) from stations where business_id = new.business_id and active) >= lim then
    raise exception 'plan_limit';
  end if;
  return new;
end $$;
create trigger stations_limit before insert on public.stations for each row execute function public._stations_limit();

-- Subscription payments: the café declares a Mobile Money payment, the platform owner confirms it.
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) default public.my_business(),
  plan text not null check (plan in ('starter','pro')),
  months integer not null check (months in (1, 12)),
  amount integer not null,
  reference text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
alter table public.subscription_payments enable row level security;
create policy subpay_read on public.subscription_payments for select to authenticated using (business_id = public.my_business() or public.is_platform_admin());

create or replace function public.declare_payment(plan text, months integer, reference text) returns public.subscription_payments
language plpgsql security definer set search_path = public as $$
declare p public.subscription_payments; price public.plan_prices;
begin
  if not exists (select 1 from profiles x where x.id = auth.uid() and x.active and x.role = 'admin') then raise exception 'admin_only'; end if;
  if coalesce(trim(reference),'') = '' then raise exception 'momo_ref_required'; end if;
  select * into price from plan_prices pp where pp.plan = declare_payment.plan;
  if not found or months not in (1, 12) then raise exception 'bad_plan'; end if;
  insert into subscription_payments (business_id, plan, months, amount, reference)
  values (my_business(), declare_payment.plan, months, case when months = 12 then price.yearly else price.monthly end, trim(reference))
  returning * into p;
  return p;
end $$;

-- Platform owner: extend a café (from its current end date or today), change plan, suspend/reactivate.
create or replace function public.platform_extend(business uuid, months integer, plan text default null) returns public.businesses
language plpgsql security definer set search_path = public as $$
declare b public.businesses;
begin
  if not is_platform_admin() then raise exception 'admin_only'; end if;
  update businesses x set
    paid_until = greatest(now(), coalesce(x.paid_until, now()), x.trial_ends_at) + make_interval(months => platform_extend.months),
    status = 'active', plan = coalesce(platform_extend.plan, x.plan)
  where x.id = platform_extend.business returning * into b;
  return b;
end $$;
create or replace function public.platform_confirm_payment(payment uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p public.subscription_payments;
begin
  if not is_platform_admin() then raise exception 'admin_only'; end if;
  select * into p from subscription_payments where id = payment and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  update subscription_payments set status = case when approve then 'confirmed' else 'rejected' end, confirmed_at = now() where id = p.id;
  if approve then perform platform_extend(p.business_id, p.months, p.plan); end if;
end $$;
create or replace function public.platform_set_status(business uuid, status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'admin_only'; end if;
  if platform_set_status.status not in ('trial','active','suspended') then raise exception 'bad_status'; end if;
  update businesses x set status = platform_set_status.status where x.id = platform_set_status.business;
end $$;
create or replace function public.platform_overview()
returns table (id uuid, name text, city text, phone text, email text, owner_name text, plan text, status text, trial_ends_at timestamptz, paid_until timestamptz,
               created_at timestamptz, staff bigint, sales_30d bigint, revenue_30d bigint, last_sale timestamptz, pending_payments bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.city, b.phone, b.email, b.owner_name, b.plan, b.status, b.trial_ends_at, b.paid_until, b.created_at,
    (select count(*) from profiles p where p.business_id = b.id and p.active),
    (select count(*) from sales s where s.business_id = b.id and not s.voided and s.created_at > now() - interval '30 days'),
    (select coalesce(sum(s.total),0) from sales s where s.business_id = b.id and not s.voided and s.kind = 'sale' and s.created_at > now() - interval '30 days'),
    (select max(s.created_at) from sales s where s.business_id = b.id),
    (select count(*) from subscription_payments sp where sp.business_id = b.id and sp.status = 'pending')
  from businesses b where is_platform_admin() order by b.created_at
$$;

revoke all on function public.update_my_business(text,text,text,text,text,text,text,text,text) from public, anon;
revoke all on function public.declare_payment(text,integer,text) from public, anon;
revoke all on function public.platform_extend(uuid,integer,text) from public, anon;
revoke all on function public.platform_confirm_payment(uuid,boolean) from public, anon;
revoke all on function public.platform_set_status(uuid,text) from public, anon;
revoke all on function public.platform_overview() from public, anon;
revoke all on function public.my_business() from public, anon;
revoke all on function public.business_ok(uuid) from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.update_my_business(text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.declare_payment(text,integer,text) to authenticated;
grant execute on function public.platform_extend(uuid,integer,text) to authenticated;
grant execute on function public.platform_confirm_payment(uuid,boolean) to authenticated;
grant execute on function public.platform_set_status(uuid,text) to authenticated;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.my_business() to authenticated;
grant execute on function public.business_ok(uuid) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

-- Logos: public bucket, each café writes only inside its own folder.
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
create policy logos_read on storage.objects for select using (bucket_id = 'logos');
create policy logos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business()::text and public.is_admin());
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.my_business()::text and public.is_admin());
