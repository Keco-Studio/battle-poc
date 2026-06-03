/** Built-in job class definitions (default when no Studio module is active). */

export type JobClassId = 'hero' | 'tank' | 'archer' | 'mage' | 'healer' | 'assassin'

export const JOB_CLASS_IDS: JobClassId[] = ['hero', 'tank', 'archer', 'mage', 'healer', 'assassin']

export const JOB_DISPLAY_NAMES: Record<JobClassId, string> = {
  hero: 'Warrior',
  tank: 'Tank',
  archer: 'Archer',
  mage: 'Mage',
  healer: 'Healer',
  assassin: 'Assassin',
}

export const JOB_DESCRIPTIONS: Record<JobClassId, string> = {
  hero: 'Balanced frontline. Balances damage and control, maintains pressure rhythm.',
  tank: 'Heavy armor frontline. Absorbs damage to protect allies, disrupts enemy rhythm.',
  archer: 'Ranged physical DPS. Maintains safe distance for sustained pressure, kites enemies.',
  mage: 'Ranged magic DPS. Uses control to open combo windows, follows freeze with shatter.',
  healer: 'Team support. Prioritizes keeping allies alive, uses debuffs and cleanse.',
  assassin: 'Melee assassin. Uses displacement to flank and dive, executes low-HP targets.',
}

export const JOB_PREFERRED_RANGE: Record<JobClassId, 'melee' | 'mid' | 'ranged'> = {
  hero: 'melee',
  tank: 'melee',
  archer: 'ranged',
  mage: 'ranged',
  healer: 'mid',
  assassin: 'melee',
}

export const ROLE_STATS: Record<
  JobClassId,
  {
    baseHp: number
    baseAtk: number
    baseDef: number
    baseSpd: number
    growthHp: number
    growthAtk: number
    growthDef: number
    growthSpd: number
    hpMult: number
  }
> = {
  hero: {
    baseHp: 120,
    baseAtk: 6,
    baseDef: 4,
    baseSpd: 4,
    growthHp: 35,
    growthAtk: 5,
    growthDef: 3,
    growthSpd: 3,
    hpMult: 5,
  },
  tank: {
    baseHp: 150,
    baseAtk: 4,
    baseDef: 7,
    baseSpd: 2,
    growthHp: 45,
    growthAtk: 3,
    growthDef: 5,
    growthSpd: 1,
    hpMult: 5,
  },
  archer: {
    baseHp: 90,
    baseAtk: 7,
    baseDef: 2,
    baseSpd: 6,
    growthHp: 25,
    growthAtk: 6,
    growthDef: 2,
    growthSpd: 4,
    hpMult: 5,
  },
  mage: {
    baseHp: 80,
    baseAtk: 9,
    baseDef: 1,
    baseSpd: 4,
    growthHp: 20,
    growthAtk: 7,
    growthDef: 1,
    growthSpd: 3,
    hpMult: 5,
  },
  healer: {
    baseHp: 100,
    baseAtk: 4,
    baseDef: 4,
    baseSpd: 5,
    growthHp: 28,
    growthAtk: 3,
    growthDef: 3,
    growthSpd: 3,
    hpMult: 5,
  },
  assassin: {
    baseHp: 85,
    baseAtk: 10,
    baseDef: 2,
    baseSpd: 8,
    growthHp: 22,
    growthAtk: 8,
    growthDef: 2,
    growthSpd: 5,
    hpMult: 5,
  },
}
