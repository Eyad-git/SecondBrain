-- Persistent scraped pages attached to nodes (per user)
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.node_scraped_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  url text not null,
  fetched_url text not null,
  title text,
  content_excerpt text not null,
  content_type text,
  bytes_read integer not null default 0 check (bytes_read >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists node_scraped_sites_user_node_idx
  on public.node_scraped_sites(user_id, node_id, created_at desc);

create or replace function public.set_node_scraped_sites_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_node_scraped_sites_updated_at on public.node_scraped_sites;
create trigger trg_node_scraped_sites_updated_at
before update on public.node_scraped_sites
for each row
execute function public.set_node_scraped_sites_updated_at();

alter table public.node_scraped_sites enable row level security;

drop policy if exists "node_scraped_sites_select_own" on public.node_scraped_sites;
create policy "node_scraped_sites_select_own"
on public.node_scraped_sites
for select
using (auth.uid() = user_id);

drop policy if exists "node_scraped_sites_insert_own" on public.node_scraped_sites;
create policy "node_scraped_sites_insert_own"
on public.node_scraped_sites
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.nodes n
    where n.id = node_id
      and n.user_id = auth.uid()
  )
);

drop policy if exists "node_scraped_sites_update_own" on public.node_scraped_sites;
create policy "node_scraped_sites_update_own"
on public.node_scraped_sites
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "node_scraped_sites_delete_own" on public.node_scraped_sites;
create policy "node_scraped_sites_delete_own"
on public.node_scraped_sites
for delete
using (auth.uid() = user_id);
