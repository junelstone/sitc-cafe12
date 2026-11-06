-- Sale kind: normal sale vs customer account top-up (top-ups are cash in, not revenue).
alter table public.sales add column kind text not null default 'sale' check (kind in ('sale','topup'));
