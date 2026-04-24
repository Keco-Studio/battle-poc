-- Migration: Create player_saves table
-- Purpose: Persist player progress — one row per authenticated user
-- Replaces localStorage save in useGameState.ts

create table if not exists public.player_saves (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  character_name    text not null default 'Adventurer',
  job_class_id      text references public.job_classes (id) on delete set null,

  level             int not null default 1,
  exp               int not null default 0,
  gold              int not null default 0,

  -- current_hp: null means full HP (avoids storing a stale max-HP number)
  current_hp        int,

  -- Last known map position
  pos_x             numeric not null default 8,
  pos_y             numeric not null default 8,

  -- Equipped slots — {name: text, icon: text} or null
  equipped_weapon   jsonb,
  equipped_ring     jsonb,
  equipped_armor    jsonb,
  equipped_shoes    jsonb,

  -- Backpack items: [{type: text, name: text, icon: text}]
  inventory         jsonb not null default '[]'::jsonb,

  -- Up to 6 skill ids the player carries into battle
  carried_skill_ids text[] not null default '{}'::text[],

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One save per user
  constraint player_saves_user_unique unique (user_id),
  constraint player_saves_level_positive check (level >= 1),
  constraint player_saves_exp_non_negative check (exp >= 0),
  constraint player_saves_gold_non_negative check (gold >= 0),
  constraint player_saves_character_name_not_empty check (length(trim(character_name)) > 0)
);

create index if not exists idx_player_saves_user_id on public.player_saves (user_id);
create index if not exists idx_player_saves_job_class on public.player_saves (job_class_id);

create trigger trg_player_saves_updated_at
  before update on public.player_saves
  for each row execute function public.update_updated_at_column();

-- Auto-create a save row when a new user signs up
create or replace function public.handle_new_user_save()
returns trigger as $$
begin
  insert into public.player_saves (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_save on auth.users;
create trigger on_auth_user_created_save
  after insert on auth.users
  for each row execute function public.handle_new_user_save();

-- ─────────────────────────────────────────────
-- RLS — users can only access their own save
-- ─────────────────────────────────────────────
alter table public.player_saves enable row level security;

create policy player_saves_select_own on public.player_saves
  for select using (auth.uid() = user_id);

create policy player_saves_insert_own on public.player_saves
  for insert with check (auth.uid() = user_id);

create policy player_saves_update_own on public.player_saves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy player_saves_delete_own on public.player_saves
  for delete using (auth.uid() = user_id);
