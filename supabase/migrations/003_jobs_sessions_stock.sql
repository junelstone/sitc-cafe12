-- Step 3: typing/design jobs, computer sessions, restocking.

-- Shared helper: write a one-line sale (used for job deposits/balances and computer sessions).
create or replace function public._simple_sale(lbl text, amount integer, pay text, ref text, received integer, cust text, phone text)
returns public.sales language plpgsql security definer set search_path = public as $$
declare s public.sales;
begin
  if amount <= 0 then raise exception 'bad_amount'; end if;
  if pay not in ('cash','mobile_money') then raise exception 'bad_payment'; end if;
  if pay = 'mobile_money' and coalesce(trim(ref),'') = '' then raise exception 'momo_ref_required'; end if;
  insert into sales (staff_id, customer_name, customer_phone, subtotal, discount, total, payment_method, momo_ref, amount_received)
  values (auth.uid(), coalesce(cust,''), coalesce(phone,''), amount, 0, amount, pay, coalesce(ref,''),
          case when pay = 'cash' then greatest(coalesce(received,0), amount) else amount end)
  returning * into s;
  insert into sale_items (sale_id, label, quantity, unit_price, line_total) values (s.id, lbl, 1, amount, amount);
  return s;
end $$;
revoke all on function public._simple_sale(text,integer,text,text,integer,text,text) from public, anon, authenticated;

-- ---------- Jobs ----------
create sequence public.job_seq start 1;
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_no bigint not null unique default nextval('public.job_seq'),
  customer_name text not null,
  customer_phone text not null default '',
  kind text not null default 'typing' check (kind in ('typing','design','printing','other')),
  description text not null default '',
  pages integer not null default 0,
  price integer not null default 0 check (price >= 0),
  paid integer not null default 0 check (paid >= 0),
  status text not null default 'received' check (status in ('received','in_progress','ready','collected','cancelled')),
  due_at timestamptz,
  assigned_to uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  collected_at timestamptz
);
create index jobs_status_idx on public.jobs (status);

create table public.job_payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sale_id uuid not null references public.sales(id),
  amount integer not null,
  created_at timestamptz not null default now()
);
create index job_payments_job_idx on public.job_payments (job_id);

alter table public.jobs enable row level security;
alter table public.job_payments enable row level security;
create policy jobs_read on public.jobs for select using (public.is_staff());
create policy jobs_insert on public.jobs for insert with check (public.is_staff() and created_by = auth.uid() and paid = 0);
create policy jobs_update on public.jobs for update using (public.is_staff()) with check (public.is_staff());
create policy job_payments_read on public.job_payments for select using (public.is_staff());

-- 'paid' may only change through pay_job.
create or replace function public._jobs_guard() returns trigger language plpgsql as $$
begin
  if new.paid <> old.paid and current_setting('sitc.paying', true) is distinct from 'on' then
    raise exception 'paid_locked';
  end if;
  if new.price < new.paid then raise exception 'price_below_paid'; end if;
  new.updated_at := now();
  if new.status = 'collected' and old.status <> 'collected' then new.collected_at := now(); end if;
  return new;
end $$;
create trigger jobs_guard before update on public.jobs for each row execute function public._jobs_guard();

create or replace function public.pay_job(job uuid, amount integer, payment_method text, momo_ref text default '', amount_received integer default 0)
returns public.sales language plpgsql security definer set search_path = public as $$
declare j public.jobs; s public.sales;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into j from jobs where id = pay_job.job for update;
  if not found then raise exception 'not_found'; end if;
  if amount <= 0 or j.paid + amount > j.price then raise exception 'bad_amount'; end if;
  s := _simple_sale(
    'Travail N°' || j.job_no || case when j.paid + amount >= j.price then ' (solde)' else ' (acompte)' end
      || ' / Job No.' || j.job_no || case when j.paid + amount >= j.price then ' (balance)' else ' (deposit)' end,
    amount, pay_job.payment_method, pay_job.momo_ref, pay_job.amount_received, j.customer_name, j.customer_phone);
  perform set_config('sitc.paying', 'on', true);
  update jobs set paid = paid + amount where id = j.id;
  perform set_config('sitc.paying', 'off', true);
  insert into job_payments (job_id, sale_id, amount) values (j.id, s.id, amount);
  return s;
end $$;
revoke all on function public.pay_job(uuid,integer,text,text,integer) from public, anon;
grant execute on function public.pay_job(uuid,integer,text,text,integer) to authenticated;

-- ---------- Computer sessions ----------
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0
);
insert into public.stations (name, sort_order) values ('PC 1',1),('PC 2',2),('PC 3',3),('PC 4',4);

create table public.computer_sessions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id),
  service_id uuid not null references public.services(id),
  rate_per_hour integer not null,
  customer_name text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes integer,
  amount integer,
  sale_id uuid references public.sales(id),
  started_by uuid not null references public.profiles(id),
  ended_by uuid references public.profiles(id)
);
create unique index one_open_session_per_station on public.computer_sessions (station_id) where ended_at is null;

alter table public.stations enable row level security;
alter table public.computer_sessions enable row level security;
create policy stations_read on public.stations for select using (public.is_staff());
create policy stations_admin on public.stations for all using (public.is_admin()) with check (public.is_admin());
create policy sessions_read on public.computer_sessions for select using (public.is_staff());

-- Billing rule: per minute at the hourly rate, minimum 15 minutes, rounded up to the next 25 F CFA.
create or replace function public.session_price(rate integer, mins integer) returns integer
language sql immutable as $$
  select (ceil(greatest(mins, 15) * rate / 60.0 / 25.0) * 25)::integer
$$;

create or replace function public.start_session(station uuid, service uuid, customer_name text default '')
returns public.computer_sessions language plpgsql security definer set search_path = public as $$
declare svc public.services; cs public.computer_sessions;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select * into svc from services where id = start_session.service and active and category = 'internet';
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
  select * into cs from computer_sessions where id = end_session.session and ended_at is null for update;
  if not found then raise exception 'not_found'; end if;
  select * into st from stations where id = cs.station_id;
  m := ceil(extract(epoch from (now() - cs.started_at)) / 60.0)::integer;
  amt := session_price(cs.rate_per_hour, m);
  s := _simple_sale('Internet ' || st.name || ' (' || m || ' min) / Internet ' || st.name || ' (' || m || ' min)',
                    amt, end_session.payment_method, end_session.momo_ref, end_session.amount_received, cs.customer_name, '');
  update computer_sessions set ended_at = now(), minutes = m, amount = amt, sale_id = s.id, ended_by = auth.uid() where id = cs.id;
  return s;
end $$;

-- Admin: close a session without charging (e.g. started by mistake).
create or replace function public.cancel_session(session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_only'; end if;
  update computer_sessions set ended_at = now(), minutes = 0, amount = 0, ended_by = auth.uid()
  where id = cancel_session.session and ended_at is null;
end $$;

revoke all on function public.start_session(uuid,uuid,text) from public, anon;
revoke all on function public.end_session(uuid,text,text,integer) from public, anon;
revoke all on function public.cancel_session(uuid) from public, anon;
grant execute on function public.start_session(uuid,uuid,text) to authenticated;
grant execute on function public.end_session(uuid,text,text,integer) to authenticated;
grant execute on function public.cancel_session(uuid) to authenticated;

-- ---------- Stock ----------
create or replace function public.restock(item uuid, change numeric, reason text default 'restock', note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if restock.reason not in ('restock','adjust') then raise exception 'bad_reason'; end if;
  if restock.reason = 'restock' and change <= 0 then raise exception 'bad_quantity'; end if;
  if restock.reason = 'adjust' and not is_admin() then raise exception 'admin_only'; end if;
  update stock_items set quantity = quantity + change where id = restock.item;
  if not found then raise exception 'not_found'; end if;
  insert into stock_movements (stock_item_id, change, reason, staff_id, note)
  values (restock.item, change, restock.reason, auth.uid(), coalesce(restock.note,''));
end $$;
revoke all on function public.restock(uuid,numeric,text,text) from public, anon;
grant execute on function public.restock(uuid,numeric,text,text) to authenticated;

-- Staff can see stock movements too (for the stock page history).
create policy movements_read_staff on public.stock_movements for select using (public.is_staff());
