-- Staff presence: who is online now, and when each person logged in and out.
-- The app sends a heartbeat every minute while open; a gap of more than 5 minutes starts a new visit.

create table if not exists public.staff_presence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) default public.my_business(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,             -- set when the person presses Sign out
  page text not null default ''
);
create index if not exists staff_presence_biz_idx on public.staff_presence (business_id, started_at desc);
create index if not exists staff_presence_staff_idx on public.staff_presence (staff_id, last_seen_at desc);
alter table public.staff_presence enable row level security;
drop policy if exists presence_read on public.staff_presence;
create policy presence_read on public.staff_presence for select to authenticated
  using (business_id = public.my_business() and (staff_id = auth.uid() or public.is_admin()));

create or replace function public.presence_ping(page text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.staff_presence;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.active) then return; end if;
  select * into r from staff_presence where staff_id = auth.uid() and ended_at is null
    and last_seen_at > now() - interval '5 minutes' order by last_seen_at desc limit 1 for update;
  if found then
    update staff_presence set last_seen_at = now(), page = left(coalesce(presence_ping.page, ''), 60) where id = r.id;
  else
    insert into staff_presence (business_id, staff_id, page) values (my_business(), auth.uid(), left(coalesce(presence_ping.page, ''), 60));
  end if;
end $$;

create or replace function public.presence_end() returns void
language plpgsql security definer set search_path = public as $$
begin
  update staff_presence set ended_at = now(), last_seen_at = now()
  where staff_id = auth.uid() and ended_at is null and last_seen_at > now() - interval '5 minutes';
end $$;

revoke all on function public.presence_ping(text) from public, anon;
revoke all on function public.presence_end() from public, anon;
grant execute on function public.presence_ping(text) to authenticated;
grant execute on function public.presence_end() to authenticated;
grant select on public.staff_presence to authenticated;
