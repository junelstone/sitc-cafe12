-- Cash drawer close + expenses.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  category text not null default 'other'
    check (category in ('rent','electricity','internet','paper','ink','salary','maintenance','transport','other')),
  description text not null default '',
  amount integer not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash','mobile_money','bank')),
  staff_id uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_spent_idx on public.expenses (spent_on);
alter table public.expenses enable row level security;
create policy expenses_read on public.expenses for select using (staff_id = auth.uid() or public.is_admin());
create policy expenses_insert on public.expenses for insert with check (public.is_staff() and staff_id = auth.uid());
create policy expenses_admin_update on public.expenses for update using (public.is_admin()) with check (public.is_admin());
create policy expenses_admin_delete on public.expenses for delete using (public.is_admin());

create table public.cash_closes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id),
  period_start timestamptz not null,
  period_end timestamptz not null default now(),
  opening_float integer not null default 0,
  cash_sales integer not null,
  cash_expenses integer not null,
  momo_sales integer not null,
  expected_cash integer not null,
  counted_cash integer not null,
  difference integer generated always as (counted_cash - expected_cash) stored,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index cash_closes_staff_idx on public.cash_closes (staff_id, period_end);
alter table public.cash_closes enable row level security;
create policy closes_read on public.cash_closes for select using (staff_id = auth.uid() or public.is_admin());

-- What the drawer should hold for the current user since their last close.
create or replace function public.drawer_status(opening_float integer default 0)
returns table (period_start timestamptz, cash_sales integer, cash_expenses integer, momo_sales integer, expected_cash integer)
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz; cs integer; ce integer; ms integer;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  select coalesce(max(c.period_end), (date_trunc('day', now() at time zone 'Africa/Brazzaville') at time zone 'Africa/Brazzaville')) into since from cash_closes c where c.staff_id = auth.uid();
  select coalesce(sum(s.total),0)::integer into cs from sales s where s.staff_id = auth.uid() and not s.voided and s.payment_method = 'cash' and s.created_at > since;
  select coalesce(sum(e.amount),0)::integer into ce from expenses e where e.staff_id = auth.uid() and e.payment_method = 'cash' and e.created_at > since;
  select coalesce(sum(s.total),0)::integer into ms from sales s where s.staff_id = auth.uid() and not s.voided and s.payment_method = 'mobile_money' and s.created_at > since;
  return query select since, cs, ce, ms, (coalesce(drawer_status.opening_float,0) + cs - ce)::integer;
end $$;

create or replace function public.close_drawer(counted integer, opening_float integer default 0, note text default '')
returns public.cash_closes language plpgsql security definer set search_path = public as $$
declare d record; c public.cash_closes;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if counted is null or counted < 0 then raise exception 'bad_amount'; end if;
  select * into d from drawer_status(close_drawer.opening_float);
  insert into cash_closes (staff_id, period_start, opening_float, cash_sales, cash_expenses, momo_sales, expected_cash, counted_cash, note)
  values (auth.uid(), d.period_start, coalesce(close_drawer.opening_float,0), d.cash_sales, d.cash_expenses, d.momo_sales,
          coalesce(close_drawer.opening_float,0) + d.cash_sales - d.cash_expenses, counted, coalesce(close_drawer.note,''))
  returning * into c;
  return c;
end $$;

revoke all on function public.drawer_status(integer) from public, anon;
revoke all on function public.close_drawer(integer,integer,text) from public, anon;
grant execute on function public.drawer_status(integer) to authenticated;
grant execute on function public.close_drawer(integer,integer,text) to authenticated;
