-- Seed: Job class definitions and skill loadouts
-- Source: role-inference.ts, basic-skill-catalog.ts (ROLE_SKILL_LOADOUTS / ROLE_SKILL_SIGNATURES)

-- ─────────────────────────────────────────────
-- Job class definitions
-- Stat growth replaces global BASE_STATS / LEVEL_UP / HP_MULTIPLIER constants
-- ─────────────────────────────────────────────
insert into public.job_classes (id, name, description, preferred_range, strategy_hint,
  base_hp, base_atk, base_def, base_spd,
  growth_hp, growth_atk, growth_def, growth_spd,
  hp_multiplier, base_stamina, base_max_shield, base_mp_ratio)
values
  ('hero',
   'Hero',
   'Balanced frontline. Balances damage and control, maintains pressure rhythm.',
   'melee',
   'Balanced frontline, balances damage and control, maintains pressure rhythm',
   120, 6, 4, 4,
   35,  5, 3, 3,
   5,   80, 40, 0.5),

  ('tank',
   'Tank',
   'Heavy armor frontline. Absorbs damage to protect allies, uses taunt and control to disrupt enemy rhythm.',
   'melee',
   'Heavy armor frontline, absorbs damage to protect allies, uses taunt and control to disrupt enemy rhythm',
   150, 4, 7, 2,
   45,  3, 5, 1,
   5,   100, 60, 0.4),

  ('archer',
   'Archer',
   'Ranged physical DPS. Maintains safe distance for sustained pressure, uses kiting and slows.',
   'ranged',
   'Ranged physical DPS, maintains safe distance for sustained pressure, uses kiting and slows to keep distance',
   90,  7, 2, 6,
   25,  6, 2, 4,
   5,   80, 30, 0.5),

  ('mage',
   'Mage',
   'Ranged magic DPS. Uses control skills to open combo windows for burst, follows up freeze with shatter damage.',
   'ranged',
   'Ranged magic DPS, uses control skills to open combo windows for burst, follows up freeze with shatter damage',
   80,  9, 1, 4,
   20,  7, 1, 3,
   5,   60, 20, 0.6),

  ('healer',
   'Healer',
   'Team support. Prioritizes keeping allies alive, uses debuffs and cleanse to disrupt enemies.',
   'mid',
   'Team support, prioritizes keeping allies alive, uses debuffs and cleanse to disrupt enemies',
   100, 4, 4, 5,
   28,  3, 3, 3,
   5,   70, 30, 0.55),

  ('assassin',
   'Assassin',
   'Melee assassin. Uses displacement skills to flank and dive, executes low-HP targets.',
   'melee',
   'Melee assassin, uses displacement skills to flank and dive, executes low-HP targets',
   85,  10, 2, 8,
   22,  8,  2, 5,
   5,   100, 25, 0.45)

on conflict (id) do update set
  name              = excluded.name,
  description       = excluded.description,
  preferred_range   = excluded.preferred_range,
  strategy_hint     = excluded.strategy_hint,
  base_hp           = excluded.base_hp,
  base_atk          = excluded.base_atk,
  base_def          = excluded.base_def,
  base_spd          = excluded.base_spd,
  growth_hp         = excluded.growth_hp,
  growth_atk        = excluded.growth_atk,
  growth_def        = excluded.growth_def,
  growth_spd        = excluded.growth_spd,
  hp_multiplier     = excluded.hp_multiplier,
  base_stamina      = excluded.base_stamina,
  base_max_shield   = excluded.base_max_shield,
  base_mp_ratio     = excluded.base_mp_ratio;

-- ─────────────────────────────────────────────
-- Job class skills
-- is_signature = true  →  used by AI role inference (ROLE_SKILL_SIGNATURES)
-- is_default   = true  →  equipped when a new character is created (first 6)
-- ─────────────────────────────────────────────

-- Hero
insert into public.job_class_skills (job_class_id, skill_id, is_signature, is_default) values
  ('hero', 'rally_call',    true,  true),
  ('hero', 'command_aura',  true,  true),
  ('hero', 'shield_wall',   true,  true)
on conflict do nothing;

-- Tank
insert into public.job_class_skills (job_class_id, skill_id, is_signature, is_default) values
  ('tank', 'shield_wall',        true,  true),
  ('tank', 'taunt',              true,  true),
  ('tank', 'barrier',            false, true),
  ('tank', 'iron_bastion',       true,  false),
  ('tank', 'shield_retaliation', true,  false),
  ('tank', 'warpull',            true,  false),
  ('tank', 'aegis_blessing',     true,  false),
  ('tank', 'unstoppable_charge', true,  false)
on conflict do nothing;

-- Archer
insert into public.job_class_skills (job_class_id, skill_id, is_signature, is_default) values
  ('archer', 'focus_shot',     true,  true),
  ('archer', 'volley',         true,  true),
  ('archer', 'arcane_bolt',    false, true),
  ('archer', 'piercing_arrow', true,  false),
  ('archer', 'aimed_snipe',    true,  false),
  ('archer', 'frost_trap',     true,  false),
  ('archer', 'rain_of_arrows', true,  false),
  ('archer', 'keen_eye',       true,  false)
on conflict do nothing;

-- Mage
insert into public.job_class_skills (job_class_id, skill_id, is_signature, is_default) values
  ('mage', 'fireball',          true,  true),
  ('mage', 'arcane_bolt',       true,  true),
  ('mage', 'frost_lock',        true,  true),
  ('mage', 'ice_nova',          false, false),
  ('mage', 'chilling_touch',    false, false),
  ('mage', 'arctic_storm',      true,  false),
  ('mage', 'frostslow_field',   false, false),
  ('mage', 'void_chain',        false, false),
  ('mage', 'glacial_pierce',    true,  false),
  ('mage', 'burning_ground',    false, false),
  ('mage', 'infernal_orb',      true,  false),
  ('mage', 'scorching_aura',    false, false),
  ('mage', 'icefire_collision', false, false),
  ('mage', 'frost_lock_wave',   false, false),
  ('mage', 'ice_shard_beam',    false, false),
  ('mage', 'arcane_prison_wave',false, false),
  ('mage', 'mana_pulse_beam',   false, false)
on conflict do nothing;

-- Healer
insert into public.job_class_skills (job_class_id, skill_id, is_signature, is_default) values
  ('healer', 'heal_wave',       true,  true),
  ('healer', 'barrier',         false, true),
  ('healer', 'command_aura',    false, true),
  ('healer', 'radiance',        true,  false),
  ('healer', 'blessing_might',  true,  false),
  ('healer', 'weakening_hex',   true,  false),
  ('healer', 'purification',    true,  false),
  ('healer', 'guardian_angel',  true,  false)
on conflict do nothing;

-- Assassin
insert into public.job_class_skills (job_class_id, skill_id, is_signature, is_default) values
  ('assassin', 'shadow_step',   true,  true),
  ('assassin', 'backstab',      true,  true),
  ('assassin', 'arcane_bolt',   false, true),
  ('assassin', 'shadow_cloak',  true,  false),
  ('assassin', 'afterimage',    true,  false),
  ('assassin', 'lacerate',      true,  false),
  ('assassin', 'phantom_edge',  true,  false),
  ('assassin', 'nox_strike',    true,  false)
on conflict do nothing;
