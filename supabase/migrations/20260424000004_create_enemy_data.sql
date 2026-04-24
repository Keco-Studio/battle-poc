-- Migration: Create enemy data tables
-- Purpose: Monster templates (blueprints) and per-map spawn placements
-- Replaces hardcoded initialEnemies in constants.ts and entityDefs in map JSON files

-- ─────────────────────────────────────────────
-- enemy_templates — monster blueprints
-- ─────────────────────────────────────────────
create table if not exists public.enemy_templates (
  id                 text primary key,
  name               text not null,
  type               text not null default 'monster' check (type in ('monster', 'boss', 'npc')),

  -- Visual
  visual_id          text,           -- 'warriorBlue' | 'archerGreen' | 'pixellab:xxx'
  sprite_tile_index  int,            -- fallback tile index when visual_id is absent

  -- Stats: level drives formula, stat_profile can override individual values
  -- max_hp = (ENEMY_BASE_HP + (level-1) * ENEMY_GROWTH_HP) * HP_MULTIPLIER, then merge stat_profile
  level              int not null default 1,
  stat_profile       jsonb,          -- {maxHp?, atk?, def?, spd?} partial overrides

  -- Skills this enemy can use (references skills.id)
  skill_ids          text[] not null default '{}'::text[],

  -- Reward on defeat
  drop_exp           int not null default 0,
  drop_gold_min      int not null default 0,
  drop_gold_max      int not null default 0,

  description        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint enemy_templates_name_not_empty check (length(trim(name)) > 0)
);

create trigger trg_enemy_templates_updated_at
  before update on public.enemy_templates
  for each row execute function public.update_updated_at_column();

-- ─────────────────────────────────────────────
-- map_enemies — spawn placements per map
-- ─────────────────────────────────────────────
create table if not exists public.map_enemies (
  id           uuid primary key default gen_random_uuid(),
  map_id       text not null,
  instance_id  text not null,   -- unique identifier within a map, e.g. 'guard-1'
  template_id  text references public.enemy_templates (id) on delete set null,
  spawn_x      numeric not null,
  spawn_y      numeric not null,
  created_at   timestamptz not null default now(),
  constraint map_enemies_instance_unique unique (map_id, instance_id)
);

create index if not exists idx_map_enemies_map_id on public.map_enemies (map_id);

-- ─────────────────────────────────────────────
-- RLS — public read, no player writes
-- ─────────────────────────────────────────────
alter table public.enemy_templates enable row level security;
alter table public.map_enemies     enable row level security;

create policy enemy_templates_select_public on public.enemy_templates for select using (true);
create policy map_enemies_select_public     on public.map_enemies     for select using (true);
