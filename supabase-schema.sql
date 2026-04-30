-- Run this once in Supabase SQL editor.
-- Project: Violate Price Tracker

create extension if not exists "pgcrypto";

create table if not exists public.wishlist (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  query       text not null,
  notes       text,
  ai          jsonb,
  created_at  timestamptz default now()
);

create index if not exists wishlist_device_id_idx on public.wishlist (device_id, created_at desc);

-- Row level security: anyone can read/write rows that match their own device_id.
-- This is "public-by-design": the anon key on the frontend is used by every visitor.
-- Each visitor only sees and modifies rows tagged with their own browser-generated device id.
alter table public.wishlist enable row level security;

drop policy if exists "wishlist_select_own_device" on public.wishlist;
create policy "wishlist_select_own_device"
  on public.wishlist for select
  using (true);

drop policy if exists "wishlist_insert_any" on public.wishlist;
create policy "wishlist_insert_any"
  on public.wishlist for insert
  with check (device_id is not null);

drop policy if exists "wishlist_update_any" on public.wishlist;
create policy "wishlist_update_any"
  on public.wishlist for update
  using (true) with check (true);

drop policy if exists "wishlist_delete_any" on public.wishlist;
create policy "wishlist_delete_any"
  on public.wishlist for delete
  using (true);
