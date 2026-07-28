import type { GameConfigBundle } from '@/src/lib/gameConfig/gameConfigTypes'

/** Compiled from the validated VS01 game and loadout rows. */
export const GENERATED_GAME_CONFIG: Readonly<GameConfigBundle> = {
  equipment: {
    weapon: { name: 'Weapon', icon: '⚔️', stat: 'atk', bonus: 1 },
    ring: { name: 'Ring', icon: '💍', stat: 'maxHp', bonus: 10 },
    armor: { name: 'Armor', icon: '🛡️', stat: 'def', bonus: 1 },
    shoes: { name: 'Shoes', icon: '👟', stat: 'spd', bonus: 1 },
  },
  basicAttack: {
    id: 'basic_attack',
    action: 'cast_skill',
    name: 'Basic Attack',
    icon: '👊',
    unlockLevel: 1,
    type: 'damage',
    multiplier: 1,
    desc: 'Deals ATK×1.0 damage',
    mpCost: 0,
    cooldownTicks: 0,
  },
  progression: { expPerLevel: 10, rewardExpPerEnemyLevel: 1, rewardGoldPerEnemyLevel: 2 },
  enemyFormula: {
    base: { hp: 120, atk: 6, def: 3, spd: 3 },
    growth: { hp: 36, atk: 6, def: 3, spd: 3 },
    hpMultiplier: 5,
  },
  battleFormulas: {
    armorK: 50,
    basicDamageMultiplier: 0.72,
    skillDamageMultiplier: 0.82,
    defendDamageReduction: 0.6,
    defendSkillReduction: 0.62,
  },
  roleLoadouts: {
    relay_warden: ['relay_bolt', 'cinder_mark', 'frost_lattice', 'shatter_lance', 'sunder_arc', 'mending_spark'],
    hero: ['relay_bolt', 'cinder_mark', 'frost_lattice', 'shatter_lance', 'sunder_arc', 'mending_spark'],
    tank: ['shield_wall', 'taunt', 'barrier', 'iron_bastion', 'shield_retaliation', 'warpull'],
    archer: ['focus_shot', 'volley', 'arcane_bolt', 'piercing_arrow', 'aimed_snipe', 'frost_trap'],
    mage: ['fireball', 'ice_nova', 'arcane_bolt', 'frost_lock', 'chilling_touch', 'arctic_storm'],
    healer: ['heal_wave', 'barrier', 'command_aura', 'radiance', 'blessing_might', 'weakening_hex'],
    assassin: ['shadow_step', 'backstab', 'arcane_bolt', 'shadow_cloak', 'afterimage', 'lacerate'],
  },
}
