-- Migration: Create game static data tables
-- Purpose: Skills dictionary, job class definitions and class-skill mappings
-- These tables are read-only for players (game content managed by admins)

-- ─────────────────────────────────────────────
-- skills
-- ─────────────────────────────────────────────
create table if not exists public.skills (
  id                    text primary key,
  name                  text not null,
  description           text,
  category              text check (category in ('burst', 'control', 'sustain', 'mobility', 'utility', 'execute')),
  ratio                 numeric not null default 1,
  mp_cost               int not null default 0,
  range                 numeric not null default 1,
  -- Raw value, application layer multiplies by SKILL_COOLDOWN_MULTIPLIER (10)
  cooldown_ticks        int not null default 0,
  apply_freeze_ticks    int,
  shatter_bonus_ratio   numeric,
  consume_freeze_on_hit boolean,
  params                jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint skills_name_not_empty check (length(trim(name)) > 0)
);

create index if not exists idx_skills_category on public.skills (category);

-- ─────────────────────────────────────────────
-- job_classes
-- ─────────────────────────────────────────────
create table if not exists public.job_classes (
  id               text primary key,
  name             text not null,
  description      text,
  preferred_range  text not null check (preferred_range in ('melee', 'mid', 'ranged')),
  strategy_hint    text,

  -- Base stats at level 1
  base_hp          int not null default 100,
  base_atk         int not null default 5,
  base_def         int not null default 3,
  base_spd         int not null default 3,

  -- Per-level growth
  growth_hp        int not null default 30,
  growth_atk       int not null default 5,
  growth_def       int not null default 3,
  growth_spd       int not null default 3,

  -- max_hp = (base_hp + (level-1) * growth_hp) * hp_multiplier
  hp_multiplier    numeric not null default 5,

  -- Battle-start resource values (stamina/shield reset each battle)
  base_stamina     int not null default 80,
  base_max_shield  int not null default 40,
  -- max_mp = max_hp * base_mp_ratio
  base_mp_ratio    numeric not null default 0.5,

  created_at       timestamptz not null default now(),
  constraint job_classes_name_not_empty check (length(trim(name)) > 0)
);

-- ─────────────────────────────────────────────
-- job_class_skills
-- ─────────────────────────────────────────────
create table if not exists public.job_class_skills (
  job_class_id  text not null references public.job_classes (id) on delete cascade,
  skill_id      text not null references public.skills (id) on delete cascade,
  -- Used by AI role inference (replaces ROLE_SKILL_SIGNATURES)
  is_signature  boolean not null default false,
  -- Equipped by default when a new character is created with this class
  is_default    boolean not null default false,
  primary key (job_class_id, skill_id)
);

create index if not exists idx_job_class_skills_skill on public.job_class_skills (skill_id);

-- ─────────────────────────────────────────────
-- updated_at trigger (shared function)
-- ─────────────────────────────────────────────
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_skills_updated_at
  before update on public.skills
  for each row execute function public.update_updated_at_column();

-- ─────────────────────────────────────────────
-- RLS — static game data: public read, no player writes
-- ─────────────────────────────────────────────
alter table public.skills         enable row level security;
alter table public.job_classes    enable row level security;
alter table public.job_class_skills enable row level security;

create policy skills_select_public         on public.skills           for select using (true);
create policy job_classes_select_public    on public.job_classes      for select using (true);
create policy job_class_skills_select_public on public.job_class_skills for select using (true);
