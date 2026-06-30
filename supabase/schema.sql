-- INCI Detective — Supabase schema.
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Design notes:
--  * Offline-first stays the source of truth on-device; these tables are the
--    sync mirror + the home of shareable analyses and the remote dataset.
--  * Row Level Security: a user only ever sees their own rows; shared scans are
--    publicly readable by anyone holding the share link.
--  * The Gemini API key is deliberately NOT stored in the cloud — it stays local.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text default '',
  skin_type text default '',
  concerns jsonb default '[]'::jsonb,
  dark_mode boolean default false,
  ai_enabled boolean default false,
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------------- scans
create table if not exists public.scans (
  id uuid primary key,                 -- same UUID the client generates locally
  user_id uuid not null references auth.users on delete cascade,
  barcode text,
  product_name text,
  brand text,
  image_url text,
  source text,                         -- barcode | ocr | manual
  overall text,                        -- safe | caution | alert
  summary jsonb,
  items jsonb,
  share_id text unique,                -- set when the user shares the analysis
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists scans_user_idx on public.scans(user_id);
create index if not exists scans_share_idx on public.scans(share_id);

-- --------------------------------------------------------------- watchlist
create table if not exists public.watchlist (
  user_id uuid not null references auth.users on delete cascade,
  norm text not null,
  display text,
  added_at timestamptz default now(),
  primary key (user_id, norm)
);

-- ----------------------------------------------- ingredients (remote dataset)
create table if not exists public.ingredients (
  id text primary key,
  inci text,
  norm text,
  common text,
  "function" text,
  annex text,
  annex_label text,
  safety text,
  concern jsonb,
  note text
);
create index if not exists ingredients_norm_idx on public.ingredients(norm);

create table if not exists public.dataset_meta (
  id int primary key default 1,
  cosing_version text,
  count int,
  generated_at text,
  annex_labels jsonb,
  updated_at timestamptz default now()
);

-- ----------------------------------------------- products (community catalogue)
-- Crowd-sourced barcode -> ingredient list. When a product isn't in Open Beauty
-- Facts, a signed-in user can contribute the list (typed or read via OCR) and it
-- becomes available to every other user scanning the same barcode. Publicly
-- readable; only authenticated users may write.
create table if not exists public.products (
  barcode text primary key,
  product_name text default '',
  brand text default '',
  ingredients_text text not null,
  source text default 'ocr',           -- ocr | manual
  contributed_by uuid references auth.users on delete set null,
  confirmations int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------- Row Level Security
alter table public.profiles      enable row level security;
alter table public.scans         enable row level security;
alter table public.watchlist     enable row level security;
alter table public.ingredients   enable row level security;
alter table public.dataset_meta  enable row level security;
alter table public.products      enable row level security;

-- profiles: owner only
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- scans: owner full access
drop policy if exists "own scans" on public.scans;
create policy "own scans" on public.scans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- scans: anyone can read a publicly shared one
drop policy if exists "public shared scans" on public.scans;
create policy "public shared scans" on public.scans
  for select using (is_public = true);

-- watchlist: owner only
drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- dataset: world-readable, writable only via service role (no write policy)
drop policy if exists "read ingredients" on public.ingredients;
create policy "read ingredients" on public.ingredients for select using (true);
drop policy if exists "read dataset_meta" on public.dataset_meta;
create policy "read dataset_meta" on public.dataset_meta for select using (true);

-- products: world-readable; only signed-in users may contribute/update.
drop policy if exists "read products" on public.products;
create policy "read products" on public.products for select using (true);
drop policy if exists "contribute products" on public.products;
create policy "contribute products" on public.products
  for insert with check (auth.uid() is not null);
drop policy if exists "update products" on public.products;
create policy "update products" on public.products
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

-- -------------------------------------------- auto-create a profile per new user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
