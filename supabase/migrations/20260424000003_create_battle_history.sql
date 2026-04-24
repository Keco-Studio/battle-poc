-- Migration: Create battle_history table
-- Purpose: Record completed battles for the battle log panel
-- Replaces in-memory battleLogs state in useGameState.ts

create table if not exists public.battle_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  result        text not null check (result in ('win', 'lose')),
  battle_type   text not null check (battle_type in ('pve', 'pvp')),
  opponent_name text,
  enemy_level   int,
  rounds        int,
  exp_gained    int not null default 0,
  gold_gained   int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_battle_history_user_id  on public.battle_history (user_id);
create index if not exists idx_battle_history_created  on public.battle_history (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- RLS — users can only see/write their own records
-- ─────────────────────────────────────────────
alter table public.battle_history enable row level security;

create policy battle_history_select_own on public.battle_history
  for select using (auth.uid() = user_id);

create policy battle_history_insert_own on public.battle_history
  for insert with check (auth.uid() = user_id);
