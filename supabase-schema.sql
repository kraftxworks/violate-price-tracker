-- Run this in Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Project: Violate Price Tracker

create extension if not exists "pgcrypto";

-- Wishlist table linked to Supabase Auth users
create table if not exists public.wishlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  query       text not null,
  notes       text,
  ai          jsonb,
  created_at  timestamptz default now()
);

create index if not exists wishlist_user_id_idx on public.wishlist (user_id, created_at desc);

-- Row level security: users can only access their own rows
alter table public.wishlist enable row level security;

drop policy if exists "users_select_own" on public.wishlist;
create policy "users_select_own"
  on public.wishlist for select
  using (auth.uid() = user_id);

drop policy if exists "users_insert_own" on public.wishlist;
create policy "users_insert_own"
  on public.wishlist for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_update_own" on public.wishlist;
create policy "users_update_own"
  on public.wishlist for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_delete_own" on public.wishlist;
create policy "users_delete_own"
  on public.wishlist for delete
  using (auth.uid() = user_id);
