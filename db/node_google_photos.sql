-- Persistent Google Photos items attached to nodes (per user)
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.node_google_photos_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  item_type text not null check (item_type in ('album', 'photo')),
  google_item_id text not null,
  title text,
  media_url text,
  thumbnail_url text,
  product_url text,
  mime_type text,
  created_time timestamptz,
  camera_make text,
  camera_model text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists node_google_photos_items_user_node_idx
  on public.node_google_photos_items(user_id, node_id, created_at desc);

create unique index if not exists node_google_photos_items_unique_per_node
  on public.node_google_photos_items(user_id, node_id, item_type, google_item_id);

create or replace function public.set_node_google_photos_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_node_google_photos_items_updated_at on public.node_google_photos_items;
create trigger trg_node_google_photos_items_updated_at
before update on public.node_google_photos_items
for each row
execute function public.set_node_google_photos_items_updated_at();

alter table public.node_google_photos_items enable row level security;

drop policy if exists "node_google_photos_items_select_own" on public.node_google_photos_items;
create policy "node_google_photos_items_select_own"
on public.node_google_photos_items
for select
using (auth.uid() = user_id);

drop policy if exists "node_google_photos_items_insert_own" on public.node_google_photos_items;
create policy "node_google_photos_items_insert_own"
on public.node_google_photos_items
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.nodes n
    where n.id = node_id
      and n.user_id = auth.uid()
  )
);

drop policy if exists "node_google_photos_items_update_own" on public.node_google_photos_items;
create policy "node_google_photos_items_update_own"
on public.node_google_photos_items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "node_google_photos_items_delete_own" on public.node_google_photos_items;
create policy "node_google_photos_items_delete_own"
on public.node_google_photos_items
for delete
using (auth.uid() = user_id);
