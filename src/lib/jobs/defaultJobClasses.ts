/** Built-in job class definitions (default when no Studio module is active). */

export type JobClassId = 'relay_warden' | 'hero' | 'tank' | 'archer' | 'mage' | 'healer' | 'assassin'

export const JOB_CLASS_IDS: JobClassId[] = ['hero', 'tank', 'archer', 'mage', 'healer', 'assassin']

export const JOB_DISPLAY_NAMES: Record<JobClassId, string> = {
  relay_warden: 'Relay Warden',
  hero: 'Warrior',
  tank: 'Tank',
  archer: 'Archer',
  mage: 'Mage',
  healer: 'Healer',
  assassin: 'Assassin',
}

export const JOB_DESCRIPTIONS: Record<JobClassId, string> = {
  relay_warden: 'Mid-range signal duelist with pressure, control, shatter, and repair tools.',
  hero: 'Balanced frontline. Balances damage and control, maintains pressure rhythm.',
  tank: 'Heavy armor frontline. Absorbs damage to protect allies, disrupts enemy rhythm.',
  archer: 'Ranged physical DPS. Maintains safe distance for sustained pressure, kites enemies.',
  mage: 'Ranged magic DPS. Uses control to open combo windows, follows freeze with shatter.',
  healer: 'Team support. Prioritizes keeping allies alive, uses debuffs and cleanse.',
  assassin: 'Melee assassin. Uses displacement to flank and dive, executes low-HP targets.',
}

export const JOB_PREFERRED_RANGE: Record<JobClassId, 'melee' | 'mid' | 'ranged'> = {
  relay_warden: 'mid',
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
    hp: number
    atk: number
    def: number
    spd: number
    growthHp: number
    growthAtk: number
    growthDef: number
    growthSpd: number
    hpMult: number
  }
> = {
  relay_warden: {
    hp: 135,
    atk: 19,
    def: 7,
    spd: 6,
    growthHp: 32,
    growthAtk: 5.5,
    growthDef: 2.8,
    growthSpd: 2.4,
    hpMult: 5,
  },
  hero: {
    hp: 120,
    atk: 6,
    def: 4,
    spd: 4,
    growthHp: 35,
    growthAtk: 5,
    growthDef: 3,
    growthSpd: 3,
    hpMult: 5,
  },
  tank: {
    hp: 150,
    atk: 4,
    def: 7,
    spd: 2,
    growthHp: 45,
    growthAtk: 3,
    growthDef: 5,
    growthSpd: 1,
    hpMult: 5,
  },
  archer: {
    hp: 90,
    atk: 7,
    def: 2,
    spd: 6,
    growthHp: 25,
    growthAtk: 6,
    growthDef: 2,
    growthSpd: 4,
    hpMult: 5,
  },
  mage: {
    hp: 80,
    atk: 9,
    def: 1,
    spd: 4,
    growthHp: 20,
    growthAtk: 7,
    growthDef: 1,
    growthSpd: 3,
    hpMult: 5,
  },
  healer: {
    hp: 100,
    atk: 4,
    def: 4,
    spd: 5,
    growthHp: 28,
    growthAtk: 3,
    growthDef: 3,
    growthSpd: 3,
    hpMult: 5,
  },
  assassin: {
    hp: 85,
    atk: 10,
    def: 2,
    spd: 8,
    growthHp: 22,
    growthAtk: 8,
    growthDef: 2,
    growthSpd: 5,
    hpMult: 5,
  },
}
