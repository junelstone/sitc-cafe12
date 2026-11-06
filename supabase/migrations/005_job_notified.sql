-- Track when the customer was told their job is ready.
alter table public.jobs add column notified_at timestamptz;
