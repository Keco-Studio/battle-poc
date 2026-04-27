import { describe, it, expect } from 'vitest'
import {
  calcPlayerStats,
  calcEnemyStats,
  attackIntervalMsFromSpd,
  mitigatedPhysicalDamage,
  BATTLE_ARMOR_K,
  rollEnemyBattleLevel,
  expForLevel,
  getBattleRewards,
  createEnemyEncounter,
  allSkills,
  equipmentTypes,
} from '../app/constants'

describe('calcPlayerStats', () => {
  it('should calculate level 1 stats correctly', () => {
    const stats = calcPlayerStats(1)
    expect(stats.maxHp).toBe(500)  // (100 + 0*30) * 5
    expect(stats.atk).toBe(5)      // 5 + 0*5
    expect(stats.def).toBe(3)      // 3 + 0*3
    expect(stats.spd).toBe(3)      // 3 + 0*3
  })

  it('should calculate level 2 stats correctly', () => {
    const stats = calcPlayerStats(2)
    expect(stats.maxHp).toBe(650)  // (100 + 1*30) * 5
    expect(stats.atk).toBe(10)     // 5 + 1*5
    expect(stats.def).toBe(6)      // 3 + 1*3
    expect(stats.spd).toBe(6)      // 3 + 1*3
  })

  it('should calculate level 5 stats correctly', () => {
    const stats = calcPlayerStats(5)
    expect(stats.maxHp).toBe(1100) // (100 + 4*30) * 5
    expect(stats.atk).toBe(25)     // 5 + 4*5
    expect(stats.def).toBe(15)     // 3 + 4*3
    expect(stats.spd).toBe(15)     // 3 + 4*3
  })

  it('should calculate level 10 stats correctly', () => {
    const stats = calcPlayerStats(10)
    expect(stats.maxHp).toBe(1850) // (100 + 9*30) * 5
    expect(stats.atk).toBe(50)     // 5 + 9*5
    expect(stats.def).toBe(30)     // 3 + 9*3
    expect(stats.spd).toBe(30)     // 3 + 9*3
  })
})

describe('calcEnemyStats', () => {
  it('level 1: uses enemy independent base values', () => {
    const e = calcEnemyStats(1)
    expect(e.maxHp).toBe(600)
    expect(e.atk).toBe(6)
    expect(e.def).toBe(3)
    expect(e.spd).toBe(3)
  })

  it('level 5: uses enemy independent growth values', () => {
    const e = calcEnemyStats(5)
    expect(e.maxHp).toBe(1320)
    expect(e.atk).toBe(30)
    expect(e.def).toBe(15)
    expect(e.spd).toBe(15)
  })
})

describe('attackIntervalMsFromSpd', () => {
  it('matches player attack speed formula: higher spd means shorter interval', () => {
    const slow = attackIntervalMsFromSpd(3)
    const fast = attackIntervalMsFromSpd(30)
    expect(fast).toBeLessThan(slow)
    expect(slow).toBeGreaterThanOrEqual(380)
    expect(slow).toBeLessThanOrEqual(2200)
  })
})

describe('rollEnemyBattleLevel', () => {
  it('1-2 levels lower than player but not lower than 1', () => {
    for (let p = 1; p <= 15; p++) {
      for (let i = 0; i < 40; i++) {
        const e = rollEnemyBattleLevel(p)
        expect(e).toBeGreaterThanOrEqual(1)
        expect(e).toBeLessThanOrEqual(p)
        expect(e).toBeGreaterThanOrEqual(Math.max(1, p - 2))
        expect(e).toBeLessThanOrEqual(Math.max(1, p - 1))
      }
    }
  })
})

describe('createEnemyEncounter', () => {
  it('same encounter produces consistent level and stats, with profile override', () => {
    const encounter = createEnemyEncounter(5, { maxHp: 999, def: 20 }, () => 0)
    expect(encounter.level).toBe(4)
    expect(encounter.stats).toEqual({
      maxHp: 1140,
      atk: 24,
      def: 20,
      spd: 12,
    })
  })

  it('same encounter produces consistent level and stats, with profile override', () => {
    const encounter = createEnemyEncounter(13, { maxHp: 72, atk: 8, def: 3, spd: 3 }, () => 0)
    const base = calcEnemyStats(encounter.level)
    expect(encounter.stats.maxHp).toBeGreaterThanOrEqual(base.maxHp)
    expect(encounter.stats.maxHp).toBeGreaterThan(200)
  })
})

describe('mitigatedPhysicalDamage (smooth damage intake)', () => {
  const k = BATTLE_ARMOR_K

  it('no armor means close to full raw damage', () => {
    expect(mitigatedPhysicalDamage(25, 0, k)).toBe(25)
  })

  it('armor = K is roughly half', () => {
    expect(mitigatedPhysicalDamage(100, k, k)).toBe(50)
  })

  it('high armor still minimum 1 damage', () => {
    expect(mitigatedPhysicalDamage(5, 500, k)).toBe(1)
  })

  it('raw<=0 still minimum 1 damage', () => {
    expect(mitigatedPhysicalDamage(0, 0, k)).toBe(1)
  })
})

describe('expForLevel', () => {
  it('should return correct exp for level 1', () => {
    expect(expForLevel(1)).toBe(10)
  })

  it('should return correct exp for level 2', () => {
    expect(expForLevel(2)).toBe(20)
  })

  it('should return correct exp for level 5', () => {
    expect(expForLevel(5)).toBe(50)
  })

  it('should return correct exp for level 10', () => {
    expect(expForLevel(10)).toBe(100)
  })
})

describe('getBattleRewards', () => {
  it('exp based on enemy level', () => {
    expect(getBattleRewards(1)).toEqual({ exp: 1, gold: 2 })
    expect(getBattleRewards(3)).toEqual({ exp: 3, gold: 6 })
    expect(getBattleRewards(5)).toEqual({ exp: 5, gold: 10 })
  })
})

describe('allSkills', () => {
  it('should include domain catalog skills', () => {
    expect(allSkills.length).toBeGreaterThan(10)
  })

  it('should include defend action plus skill ids', () => {
    const ids = allSkills.map(s => s.id)
    expect(ids).toContain('defend')
    expect(ids).toContain('arcane_bolt')
    expect(ids).toContain('fireball')
    expect(ids).toContain('focus_shot')
  })

  it('should map cast skills to domain core skill ids', () => {
    const fireball = allSkills.find(s => s.id === 'fireball')
    expect(fireball?.action).toBe('cast_skill')
    expect(fireball?.coreSkillId).toBe('fireball')
    expect(typeof fireball?.cooldownTicks).toBe('number')

    const defend = allSkills.find(s => s.id === 'defend')
    expect(defend?.action).toBe('defend')
    expect(defend?.coreSkillId).toBeUndefined()
  })
})

describe('equipmentTypes', () => {
  it('should have all 4 equipment types', () => {
    const types = Object.keys(equipmentTypes)
    expect(types).toContain('weapon')
    expect(types).toContain('ring')
    expect(types).toContain('armor')
    expect(types).toContain('shoes')
  })

  it('should have correct stat bonuses', () => {
    expect(equipmentTypes.weapon.stat).toBe('atk')
    expect(equipmentTypes.weapon.bonus).toBe(1)
    expect(equipmentTypes.ring.stat).toBe('maxHp')
    expect(equipmentTypes.ring.bonus).toBe(10)
    expect(equipmentTypes.armor.stat).toBe('def')
    expect(equipmentTypes.armor.bonus).toBe(1)
    expect(equipmentTypes.shoes.stat).toBe('spd')
    expect(equipmentTypes.shoes.bonus).toBe(1)
  })
})
