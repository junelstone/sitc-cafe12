-- SITC Cafe: base schema (step 1). Amounts are whole F CFA (integer).

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Stone''s IT Consulting',
  address text not null default '133 Rue Louingui, Ouenzé, Brazzaville, Congo',
  phone text not null default '+242 06 453 02 55',
  email text not null default 'contactus@sitc.fun',
  receipt_footer text not null default 'Merci de votre visite ! / Thank you for your visit!',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'pcs',
  quantity numeric not null default 0,
  low_threshold numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name_fr text not null,
  name_en text not null,
  category text not null default 'documents'
    check (category in ('documents','printing','design','paper','internet','it','other')),
  price integer not null default 0 check (price >= 0),
  unit_fr text not null default 'unité',
  unit_en text not null default 'unit',
  stock_item_id uuid references public.stock_items(id) on delete set null,
  stock_per_unit numeric not null default 0,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- helpers
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'admin')
$$;

-- new auth user -> profile. The very first user becomes admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when exists (select 1 from profiles) then 'staff' else 'admin' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.stock_items enable row level security;
alter table public.services enable row level security;

create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());

create policy settings_read on public.settings for select using (public.is_staff());
create policy settings_admin on public.settings for update using (public.is_admin());

create policy stock_read on public.stock_items for select using (public.is_staff());
create policy stock_admin on public.stock_items for all using (public.is_admin()) with check (public.is_admin());

create policy services_read on public.services for select using (public.is_staff());
create policy services_admin on public.services for all using (public.is_admin()) with check (public.is_admin());

-- starter catalogue (prices 0: the owner sets real prices in Settings)
insert into public.stock_items (name, unit, quantity, low_threshold) values
  ('Papier A4 / A4 paper', 'feuilles', 0, 500),
  ('Encre noire / Black ink', 'cartouche', 0, 1),
  ('Encre couleur / Colour ink', 'cartouche', 0, 1);

insert into public.services (name_fr, name_en, category, price, unit_fr, unit_en, sort_order) values
  ('Photocopie N&B', 'B&W photocopy', 'documents', 0, 'page', 'page', 10),
  ('Photocopie couleur', 'Colour photocopy', 'documents', 0, 'page', 'page', 20),
  ('Impression N&B', 'B&W print', 'printing', 0, 'page', 'page', 30),
  ('Impression couleur', 'Colour print', 'printing', 0, 'page', 'page', 40),
  ('Numérisation', 'Scanning', 'documents', 0, 'page', 'page', 50),
  ('Saisie de document', 'Typing', 'documents', 0, 'page', 'page', 60),
  ('Photo d''identité', 'ID photo', 'printing', 0, 'lot', 'set', 70),
  ('Rame de papier A4', 'Ream of A4 paper', 'paper', 0, 'rame', 'ream', 80),
  ('Feuille A4', 'A4 sheet', 'paper', 0, 'feuille', 'sheet', 90),
  ('Internet / ordinateur', 'Internet / computer', 'internet', 0, 'heure', 'hour', 100),
  ('Conception de CV', 'CV design', 'design', 0, 'unité', 'unit', 110),
  ('Carte de visite', 'Business cards', 'design', 0, 'lot', 'set', 120);

-- link paper/ink usage to the starter services
update public.services set stock_item_id = (select id from public.stock_items where name like 'Papier A4%'), stock_per_unit = 1
  where name_en in ('B&W photocopy','Colour photocopy','B&W print','Colour print','A4 sheet');
update public.services set stock_item_id = (select id from public.stock_items where name like 'Papier A4%'), stock_per_unit = 500
  where name_en = 'Ream of A4 paper';
