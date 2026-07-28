import type { EquipmentType, Skill } from '@/app/constants'
import type { GameConfigBundle } from './gameConfigTypes'
import { GENERATED_GAME_CONFIG } from '@/src/content/generated/game-config'
import { resolveGeneratedContent } from '@/src/content/generated/resolveGeneratedContent'

const DEFAULT_BASIC_ATTACK: Skill = {
  id: 'basic_attack',
  action: 'cast_skill',
  name: 'Basic Attack',
  icon: '👊',
  unlockLevel: 1,
  type: 'damage',
  multiplier: 1.0,
  desc: 'Deals ATK×1.0 damage',
  mpCost: 0,
  cooldownTicks: 0,
}

const DEFAULT_EQUIPMENT: GameConfigBundle['equipment'] = {
  weapon: { name: 'Weapon', icon: '⚔️', stat: 'atk', bonus: 1 },
  ring: { name: 'Ring', icon: '💍', stat: 'maxHp', bonus: 10 },
  armor: { name: 'Armor', icon: '🛡️', stat: 'def', bonus: 1 },
  shoes: { name: 'Shoes', icon: '👟', stat: 'spd', bonus: 1 },
}

/** Mirrors basic-skill-catalog ROLE_SKILL_LOADOUTS (default carried skills, first 6 used). */
const DEFAULT_ROLE_LOADOUTS: Record<string, string[]> = {
  hero: ['rally_call', 'command_aura', 'shield_wall', 'arcane_bolt', 'frost_lock', 'focus_shot'],
  tank: [
    'shield_wall',
    'taunt',
    'barrier',
    'iron_bastion',
    'shield_retaliation',
    'warpull',
    'aegis_blessing',
    'unstoppable_charge',
  ],
  archer: [
    'focus_shot',
    'volley',
    'arcane_bolt',
    'piercing_arrow',
    'aimed_snipe',
    'frost_trap',
    'rain_of_arrows',
    'keen_eye',
  ],
  mage: [
    'fireball',
    'ice_nova',
    'arcane_bolt',
    'frost_lock',
    'chilling_touch',
    'arctic_storm',
    'frostslow_field',
    'void_chain',
    'glacial_pierce',
    'burning_ground',
    'infernal_orb',
    'scorching_aura',
    'icefire_collision',
  ],
  healer: [
    'heal_wave',
    'barrier',
    'command_aura',
    'radiance',
    'blessing_might',
    'weakening_hex',
    'purification',
    'guardian_angel',
  ],
  assassin: [
    'shadow_step',
    'backstab',
    'arcane_bolt',
    'shadow_cloak',
    'afterimage',
    'lacerate',
    'phantom_edge',
    'nox_strike',
  ],
}

function createBuiltInGameConfigBundle(): GameConfigBundle {
  return {
    equipment: JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT)),
    basicAttack: { ...DEFAULT_BASIC_ATTACK },
    progression: {
      expPerLevel: 10,
      rewardExpPerEnemyLevel: 1,
      rewardGoldPerEnemyLevel: 2,
    },
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
    roleLoadouts: JSON.parse(JSON.stringify(DEFAULT_ROLE_LOADOUTS)),
  }
}

export function createDefaultGameConfigBundle(): GameConfigBundle {
  const bundle = resolveGeneratedContent(GENERATED_GAME_CONFIG, createBuiltInGameConfigBundle)
  return JSON.parse(JSON.stringify(bundle)) as GameConfigBundle
}

export function isEquipmentType(id: string): id is EquipmentType {
  return id === 'weapon' || id === 'ring' || id === 'armor' || id === 'shoes'
}

/** Known balance scalar keys (balance_scalar import rows). */
export const BALANCE_SCALAR_KEYS = [
  'exp_per_level',
  'reward_exp_per_enemy_level',
  'reward_gold_per_enemy_level',
  'enemy_base_hp',
  'enemy_base_atk',
  'enemy_base_def',
  'enemy_base_spd',
  'enemy_growth_hp',
  'enemy_growth_atk',
  'enemy_growth_def',
  'enemy_growth_spd',
  'hp_multiplier',
  'battle_armor_k',
  'basic_damage_multiplier',
  'skill_damage_multiplier',
  'defend_damage_reduction',
  'defend_skill_reduction',
] as const

export type BalanceScalarKey = (typeof BALANCE_SCALAR_KEYS)[number]
