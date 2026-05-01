-- Run in Supabase SQL Editor → New query
-- Drops old tables and creates the goals table with full schema

drop table if exists public.wishlist cascade;
drop table if exists public.goals cascade;

create table public.goals (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  goal_id       text,                            -- "V-001" from Excel import
  query         text        not null,            -- original user input / goal title
  notes         text,
  _v            integer     default 2,
  type          text        default 'Do',        -- Buy|Do|Learn|Meet|Build|Achieve|Visit|Routine|Earn|Review
  vertical      text        default 'Experiences', -- Creator|Possessions|Experiences|Skills|People|Businesses|Properties|Memberships|Health|Education|Career|Financial|Daily OS|Edge
  subcategory   text,
  status        text        default 'Idea',      -- Idea|Planning|InProgress|Done|Dropped
  horizon       text        default 'Soon',      -- Now|Soon|Mid|Long|Vision
  cost_estimate text,
  ai_help_note  text,
  ai            jsonb,                           -- vendor data (Buy type)
  sources       jsonb,                           -- operators/coaches (Do/Learn/Visit)
  steps         jsonb,                           -- checklist array (Build/Achieve)
  created_at    timestamptz default now()
);

create index goals_user_id_idx on public.goals (user_id, created_at desc);
create index goals_type_idx    on public.goals (user_id, type);
create index goals_vertical_idx on public.goals (user_id, vertical);

alter table public.goals enable row level security;

create policy "users_select_own" on public.goals for select using (auth.uid() = user_id);
create policy "users_insert_own" on public.goals for insert with check (auth.uid() = user_id);
create policy "users_update_own" on public.goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_delete_own" on public.goals for delete using (auth.uid() = user_id);
