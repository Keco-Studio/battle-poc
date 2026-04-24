-- Seed: Enemy templates and map placements
-- Sources:
--   data/maps/demo-project.json   → entityDefs + map [demo-map] entities
--   data/maps/pixel-npc.json      → entityDefs + map [demo-map] entities (with overrides)
--   app/constants.ts              → initialEnemies (level-based, map_id = 'default')
--
-- Enemy skills: ENEMY_CORE_SKILLS = ['arcane_bolt', 'fireball'] (createMapBattleSession.ts)

-- ─────────────────────────────────────────────
-- Enemy templates
-- ─────────────────────────────────────────────
insert into public.enemy_templates
  (id, name, type, visual_id, level, stat_profile, skill_ids, drop_exp, drop_gold_min, drop_gold_max)
values
  -- Guard (archer visual) — base template used in pixel-npc map
  ('guard-entity',
   'Guard',
   'npc',
   'archerGreen',
   1,
   '{"maxHp": 68, "atk": 7, "def": 2, "spd": 3}'::jsonb,
   '{arcane_bolt,fireball}',
   1, 1, 2),

  -- Guard (warrior visual) — used in demo-project map and pixel-npc overrides
  ('guard-warrior',
   'Guard',
   'npc',
   'warriorBlue',
   1,
   '{"maxHp": 72, "atk": 8, "def": 3, "spd": 3}'::jsonb,
   '{arcane_bolt,fireball}',
   1, 1, 2),

  -- Archer — demo-project map
  ('archer-entity',
   'Archer',
   'npc',
   'archerGreen',
   1,
   '{"maxHp": 68, "atk": 7, "def": 2, "spd": 3}'::jsonb,
   '{arcane_bolt,focus_shot,volley}',
   1, 1, 2),

  -- Demon Guard — from initialEnemies (level-based, formula computes stats)
  ('demon-guard',
   'Demon Guard',
   'monster',
   'warriorBlue',
   3,
   null,
   '{arcane_bolt,fireball}',
   3, 4, 8),

  -- Shadow Assassin — from initialEnemies
  ('shadow-assassin',
   'Shadow Assassin',
   'monster',
   'warriorBlue',
   5,
   null,
   '{arcane_bolt,shadow_step,backstab}',
   5, 8, 14)

on conflict (id) do update set
  name          = excluded.name,
  type          = excluded.type,
  visual_id     = excluded.visual_id,
  level         = excluded.level,
  stat_profile  = excluded.stat_profile,
  skill_ids     = excluded.skill_ids,
  drop_exp      = excluded.drop_exp,
  drop_gold_min = excluded.drop_gold_min,
  drop_gold_max = excluded.drop_gold_max,
  updated_at    = now();

-- ─────────────────────────────────────────────
-- Map: demo-project → map [demo-map]
-- ─────────────────────────────────────────────
insert into public.map_enemies (map_id, instance_id, template_id, spawn_x, spawn_y, overrides) values
  ('demo-project', 'guard-1', 'guard-warrior', 5, 5, null),
  ('demo-project', 'guard-2', 'guard-warrior', 4, 8, null)
on conflict (map_id, instance_id) do update set
  template_id = excluded.template_id,
  spawn_x     = excluded.spawn_x,
  spawn_y     = excluded.spawn_y,
  overrides   = excluded.overrides;

-- ─────────────────────────────────────────────
-- Map: pixel-npc → map [demo-map]
-- Instances that have overrides store them in the overrides column
-- ─────────────────────────────────────────────
insert into public.map_enemies (map_id, instance_id, template_id, spawn_x, spawn_y, overrides) values
  -- Base instances (no overrides)
  ('pixel-npc', 'guard-1',
   'guard-entity', 5, 5, null),
  ('pixel-npc', 'instance-1773799228297-vlv3u8',
   'guard-entity', 4, 8, null),
  ('pixel-npc', 'instance-1773799230512-o0a5rz',
   'guard-entity', 7, 7, null),
  -- archerGreen overrides
  ('pixel-npc', 'instance-1773827908047-jl5i01',
   'guard-entity', 9, 8,
   '{"visualId": "archerGreen", "battleProfile": {"maxHp": 68, "atk": 7, "def": 2}}'::jsonb),
  ('pixel-npc', 'instance-1773827953992-rk3al4',
   'guard-entity', 11, 7,
   '{"visualId": "archerGreen", "battleProfile": {"maxHp": 68, "atk": 7, "def": 2}}'::jsonb),
  -- pixellab brave-knight overrides
  ('pixel-npc', 'instance-1776676380837-07bs7q',
   'guard-entity', 5, 2,
   '{"visualId": "pixellab:brave-knight-top-down-pixel-art-1776674813964", "battleProfile": {"maxHp": 72, "atk": 8, "def": 3}}'::jsonb),
  ('pixel-npc', 'instance-1776676382234-xutd0r',
   'guard-entity', 4, 13,
   '{"visualId": "pixellab:brave-knight-top-down-pixel-art-1776674813964", "battleProfile": {"maxHp": 72, "atk": 8, "def": 3}}'::jsonb),
  ('pixel-npc', 'instance-1776676383690-ckg3fc',
   'guard-entity', 11, 10,
   '{"visualId": "pixellab:brave-knight-top-down-pixel-art-1776674813964", "battleProfile": {"maxHp": 72, "atk": 8, "def": 3}}'::jsonb),
  ('pixel-npc', 'instance-1776676384778-v05hce',
   'guard-entity', 11, 4,
   '{"visualId": "pixellab:brave-knight-top-down-pixel-art-1776674813964", "battleProfile": {"maxHp": 72, "atk": 8, "def": 3}}'::jsonb)
on conflict (map_id, instance_id) do update set
  template_id = excluded.template_id,
  spawn_x     = excluded.spawn_x,
  spawn_y     = excluded.spawn_y,
  overrides   = excluded.overrides;

-- ─────────────────────────────────────────────
-- Default enemies (from initialEnemies in constants.ts)
-- Used as fallback when no specific map is loaded
-- ─────────────────────────────────────────────
insert into public.map_enemies (map_id, instance_id, template_id, spawn_x, spawn_y, overrides) values
  ('default', 'enemy-1', 'demon-guard',    5,  5, null),
  ('default', 'enemy-2', 'shadow-assassin',10, 6, null)
on conflict (map_id, instance_id) do update set
  template_id = excluded.template_id,
  spawn_x     = excluded.spawn_x,
  spawn_y     = excluded.spawn_y,
  overrides   = excluded.overrides;
