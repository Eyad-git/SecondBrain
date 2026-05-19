-- Secure node integrations storage for SecondBrain
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.node_api_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  name text not null,
  base_url text,
  auth_type text not null default 'unknown' check (auth_type in ('api_key', 'oauth', 'unknown')),
  notes text,
  secret_ciphertext text,
  secret_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists node_api_integrations_user_node_idx
  on public.node_api_integrations(user_id, node_id);

create or replace function public.set_node_api_integrations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_node_api_integrations_updated_at on public.node_api_integrations;
create trigger trg_node_api_integrations_updated_at
before update on public.node_api_integrations
for each row
execute function public.set_node_api_integrations_updated_at();

alter table public.node_api_integrations enable row level security;

drop policy if exists "node_api_integrations_select_own" on public.node_api_integrations;
create policy "node_api_integrations_select_own"
on public.node_api_integrations
for select
using (auth.uid() = user_id);

drop policy if exists "node_api_integrations_insert_own" on public.node_api_integrations;
create policy "node_api_integrations_insert_own"
on public.node_api_integrations
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.nodes n
    where n.id = node_id
      and n.user_id = auth.uid()
  )
);

drop policy if exists "node_api_integrations_update_own" on public.node_api_integrations;
create policy "node_api_integrations_update_own"
on public.node_api_integrations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "node_api_integrations_delete_own" on public.node_api_integrations;
create policy "node_api_integrations_delete_own"
on public.node_api_integrations
for delete
using (auth.uid() = user_id);

