-- Community catalogue integrity (SEC-10).
-- Before this migration ANY signed-in user could overwrite ANY products row
-- (vandalism / accidental clobber of the shared barcode -> ingredients map).
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- After it:
--   * rows can only be UPDATEd by their original contributor;
--   * everyone else "votes" instead: confirm_product() bumps `confirmations`
--     when their scan matches the stored list (the client calls it on match);
--   * every update keeps the previous version in products_history;
--   * length CHECKs stop oversized junk at the database.

-- 1. Length sanity checks (match the Worker's /api/obf limits).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_ingredients_len') then
    alter table public.products
      add constraint products_ingredients_len check (char_length(ingredients_text) <= 6000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_name_len') then
    alter table public.products
      add constraint products_name_len check (char_length(product_name) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_brand_len') then
    alter table public.products
      add constraint products_brand_len check (char_length(brand) <= 200);
  end if;
end $$;

-- 2. Version history: the previous row is archived on every update.
create table if not exists public.products_history (
  id bigint generated always as identity primary key,
  barcode text not null,
  product_name text,
  brand text,
  ingredients_text text,
  source text,
  contributed_by uuid,
  confirmations int,
  replaced_at timestamptz default now(),
  replaced_by uuid
);
create index if not exists products_history_barcode_idx
  on public.products_history(barcode);

alter table public.products_history enable row level security;
-- No public policies: history is service-role/back-office only.

create or replace function public.archive_product_version()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only archive real content changes; confirmation bumps are not versions.
  if old.ingredients_text is distinct from new.ingredients_text
     or old.product_name is distinct from new.product_name
     or old.brand is distinct from new.brand then
    insert into public.products_history
      (barcode, product_name, brand, ingredients_text, source,
       contributed_by, confirmations, replaced_by)
    values
      (old.barcode, old.product_name, old.brand, old.ingredients_text, old.source,
       old.contributed_by, old.confirmations, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists products_archive_version on public.products;
create trigger products_archive_version
  before update on public.products
  for each row execute function public.archive_product_version();

-- 3. Updates restricted to the original contributor (or orphaned rows).
drop policy if exists "update products" on public.products;
create policy "update products" on public.products
  for update
  using (auth.uid() = contributed_by or contributed_by is null)
  with check (auth.uid() is not null);

-- 4. Confirmations: any signed-in user whose scan matches the stored list
--    votes for it instead of rewriting it. SECURITY DEFINER because the
--    update policy above would otherwise block non-contributors.
create or replace function public.confirm_product(p_barcode text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  update public.products
     set confirmations = coalesce(confirmations, 1) + 1,
         updated_at = now()
   where barcode = p_barcode;
end;
$$;

revoke all on function public.confirm_product(text) from public;
grant execute on function public.confirm_product(text) to authenticated;
