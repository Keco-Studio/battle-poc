-- Seed: All skill definitions
-- Source: src/battle-core/content/skills/basic-skill-catalog.ts
-- Note: cooldown_ticks stores RAW values; application layer applies ×10 multiplier

insert into public.skills (id, name, description, category, ratio, mp_cost, range, cooldown_ticks, apply_freeze_ticks, shatter_bonus_ratio, consume_freeze_on_hit, params) values

-- ── Shared cross-class skills ────────────────────────────────────────────────
('arcane_bolt',       'Arcane Bolt',       'Single target arcane burst, strong after control.',        'burst',    1.35, 4,  6.5, 2, null, 0.45, true,  null),
('frost_lock',        'Frost Lock',        'Applies freeze and opens combo windows.',                  'control',  1.1,  6,  7.2, 3, 2,    null, null,  null),
('fireball',          'Fireball',          'Reliable mid-range burst projectile.',                     'burst',    1.5,  6,  6.2, 3, null, null, null,  null),
('ice_nova',          'Ice Nova',          'Short freeze setup spell for control mages.',              'control',  1.0,  5,  6.8, 4, 1,    null, null,  null),
('frost_lock_wave',   'Frost Lock Wave',   'Imported frost control wave; freeze-oriented setup.',      'control',  1.92, 14, 8,   2, 2,    null, null,  null),
('ice_shard_beam',    'Ice Shard Beam',    'Imported shard beam; sustained frost pressure.',           'burst',    1.48, 9,  7,   1, null, 0.25, null,  null),
('arcane_prison_wave','Arcane Prison Wave','Imported arcane control spell; prison-like lock.',         'control',  1.84, 13, 9,   2, 1,    null, null,  null),
('mana_pulse_beam',   'Mana Pulse Beam',   'Imported arcane pulse beam; medium burst.',                'burst',    1.52, 10, 8,   1, null, null, null,  null),
('command_aura',      'Command Aura',      'Hero pressure pulse that keeps tempo.',                    'utility',  1.18, 3,  4.8, 2, null, null, null,  null),
('rally_call',        'Rally Call',        'Hero burst call to quickly re-engage.',                    'burst',    1.4,  5,  4.6, 4, null, null, null,  null),
('shield_wall',       'Shield Wall',       'Tank shove with stable frontline damage.',                 'utility',  1.05, 3,  2.4, 2, null, null, null,  null),
('taunt',             'Taunt',             'Tank control poke that briefly hinders target.',           'control',  0.95, 4,  2.6, 3, null, null, null,  null),
('focus_shot',        'Focus Shot',        'High precision archer poke.',                              'burst',    1.3,  4,  7,   2, null, null, null,  null),
('volley',            'Volley',            'Archer sustained ranged pressure.',                        'sustain',  1.12, 4,  6.6, 3, null, null, null,  null),
('shadow_step',       'Shadow Step',       'Assassin gap-close burst.',                               'mobility', 1.55, 5,  3.1, 3, null, null, null,  null),
('backstab',          'Backstab',          'Assassin close-range spike damage.',                      'execute',  1.78, 6,  2.3, 4, null, null, null,  null),
('heal_wave',         'Heal Wave',         'Support pulse; modeled as low damage utility for now.',   'sustain',  0.9,  4,  5.2, 2, null, null, null,  null),
('barrier',           'Barrier',           'Support control layer that can freeze shortly.',           'utility',  0.95, 5,  5.6, 3, null, null, null,  null),

-- ── Frost Mage ───────────────────────────────────────────────────────────────
('chilling_touch',    'Chilling Touch',    'DOT freeze skill; extends control window on frozen targets.', 'control', 1.1,  6,  7.5, 3, null, null, null, '{"dotDamage":0.25,"dotTicks":3,"freezeExtension":2}'),
('arctic_storm',      'Arctic Storm',      'Large AOE freeze; strong team fight control.',              'control',  1.6,  10, 7,   3, 2,    null, null,  null),
('frostslow_field',   'Frostslow Field',   'Massive slow zone; no freeze but heavy kite utility.',     'control',  0.85, 7,  6,   2, null, null, null,  '{"slowAmount":0.7}'),
('void_chain',        'Void Chain',        'Silences target; pairs with freeze for double lock.',      'control',  1.05, 8,  7.5, 3, null, null, null,  '{"silenceTicks":2}'),
('glacial_pierce',    'Glacial Pierce',    'Piercing shard; hits multiple enemies in a line.',         'burst',    1.3,  7,  8.5, 2, null, 0.3,  null,  null),

-- ── Fire Mage ────────────────────────────────────────────────────────────────
('burning_ground',    'Burning Ground',    'Undispellable burn DOT; anti-heal pressure.',              'sustain',  1.15, 6,  6.5, 3, null, null, null,  '{"dotDamage":0.35,"dotTicks":4}'),
('infernal_orb',      'Infernal Orb',      'High damage AOE fireball; team fight core burst.',         'burst',    1.7,  10, 7,   3, null, null, null,  null),
('scorching_aura',    'Scorching Aura',    'Reduces enemy healing; anti-sustain pressure.',            'control',  0.9,  5,  5,   2, null, null, null,  '{"healReductionRatio":0.45}'),
('icefire_collision', 'Icefire Collision', 'Shatters frozen enemies; massive bonus vs frozen.',        'execute',  1.55, 8,  7,   2, null, 0.6,  null,  null),

-- ── Heavy Tank ───────────────────────────────────────────────────────────────
('iron_bastion',      'Iron Bastion',      'Shield absorbs burst; tanks frontline.',                   'utility',  0.9,  6,  4,   3, null, null, null,  '{"shieldRatio":0.25}'),
('shield_retaliation','Shield Retaliation','Reflects blocked magic damage back to attacker.',          'control',  1.05, 7,  3.5, 3, null, null, null,  '{"reflectRatio":0.4}'),
('warpull',           'Warpull',           'Pulls enemy to self; disruption + combo setup.',           'control',  0.95, 8,  5,   3, null, null, null,  '{"pullDistance":3.5}'),
('aegis_blessing',    'Aegis Blessing',    'Team-wide damage reduction aura; team survival core.',     'utility',  0.8,  7,  4.5, 4, null, null, null,  '{"teamDamageReduction":0.2}'),
('unstoppable_charge','Unstoppable Charge','Immunity dash; team fight initiation breakthrough skill.', 'mobility', 1.25, 8,  2.5, 3, null, null, null,  '{"immunityTicks":2}'),

-- ── Ranged Archer ─────────────────────────────────────────────────────────────
('piercing_arrow',    'Piercing Arrow',    'Pierces multiple enemies in a straight line.',             'burst',    1.35, 5,  7.5, 2, null, null, null,  '{"pierceCount":3}'),
('aimed_snipe',       'Aimed Snipe',       'Charged long-range execute; high risk reward.',            'execute',  1.95, 9,  8.5, 4, null, null, null,  '{"slowAmount":0.4}'),
('frost_trap',        'Frost Trap',        'Slow zone; remote kite and chase tool.',                   'control',  1.05, 4,  6,   2, null, null, null,  '{"slowAmount":0.55}'),
('rain_of_arrows',    'Rain of Arrows',    'AOE sustained pressure; group poke.',                      'sustain',  1.2,  7,  7,   3, null, null, null,  null),
('keen_eye',          'Keen Eye',          'Mark target; team crit buff + damage amp.',                'utility',  0.9,  4,  6,   3, null, null, null,  '{"critBonus":0.3,"damageAmp":0.2}'),

-- ── Shadow Assassin ───────────────────────────────────────────────────────────
('shadow_cloak',      'Shadow Cloak',      'Invisibility on use; ambush / reposition tool.',           'mobility', 0.85, 5,  4,   3, null, null, null,  '{"invisibilityTicks":3}'),
('afterimage',        'Afterimage',        'Second dash; deals damage while leaving decoy.',           'mobility', 1.75, 6,  4,   2, null, null, null,  '{"dashDistance":4}'),
('lacerate',          'Lacerate',          'Bleed DOT; execute bonus at low HP.',                      'execute',  1.3,  5,  3,   3, null, null, null,  '{"dotDamage":0.3,"dotTicks":4,"executeBonus":0.45}'),
('phantom_edge',      'Phantom Edge',      'Gap-close dash; second instance for flexible engage.',     'mobility', 1.5,  6,  4.5, 2, null, null, null,  '{"dashDistance":5}'),
('nox_strike',        'Nox Strike',        'Instant no-animation strike; no warning for target.',      'burst',    1.7,  6,  3,   3, null, null, null,  null),

-- ── Team Support ──────────────────────────────────────────────────────────────
('radiance',          'Radiance',          'Team HOT plus shield; sustainable sustain.',               'sustain',  1.35, 8,  5.5, 3, null, null, null,  '{"hotTickHeal":0.2,"hotTicks":3,"shieldRatio":0.1}'),
('blessing_might',    'Blessing of Might', 'Ally ATK buff; damage amp for allies.',                    'utility',  0.9,  5,  4.5, 3, null, null, null,  '{"atkBonus":0.35,"buffTicks":4}'),
('weakening_hex',     'Weakening Hex',     'Enemy ATK/DEF debuff; weakens overall enemy capability.', 'control',  0.95, 6,  4,   3, null, null, null,  '{"atkDebuff":0.3,"defDebuff":0.25,"debuffTicks":3}'),
('purification',      'Purification',      'Cleanses 2 debuffs from ally plus shield absorb.',        'utility',  0.8,  7,  5,   4, null, null, null,  '{"cleanseCount":2,"shieldRatio":0.15}'),
('guardian_angel',    'Guardian Angel',    'Short invulnerability plus full debuff cleanse.',          'utility',  0.85, 10, 5.5, 5, null, null, null,  '{"invulTicks":2}')

on conflict (id) do update set
  name                  = excluded.name,
  description           = excluded.description,
  category              = excluded.category,
  ratio                 = excluded.ratio,
  mp_cost               = excluded.mp_cost,
  range                 = excluded.range,
  cooldown_ticks        = excluded.cooldown_ticks,
  apply_freeze_ticks    = excluded.apply_freeze_ticks,
  shatter_bonus_ratio   = excluded.shatter_bonus_ratio,
  consume_freeze_on_hit = excluded.consume_freeze_on_hit,
  params                = excluded.params,
  updated_at            = now();
