import { describe, it, expect } from 'vitest'
import {
  calcPlayerStats,
  calcEnemyStats,
  attackIntervalMsFromSpd,
  mitigatedPhysicalDamage,
  BATTLE_ARMOR_K,
  rollEnemyBattleLevel,
  MONSTER_VS_PLAYER_STAT_MULT,
  expForLevel,
  allSkills,
  equipmentTypes,
} from '../app/constants'

describe('calcPlayerStats', () => {
  it('should calculate level 1 stats correctly', () => {
    const stats = calcPlayerStats(1)
    expect(stats.maxHp).toBe(30)  // 30 + 0*10
    expect(stats.atk).toBe(5)      // 5 + 0*5
    expect(stats.def).toBe(3)      // 3 + 0*3
    expect(stats.spd).toBe(3)      // 3 + 0*3
  })

  it('should calculate level 2 stats correctly', () => {
    const stats = calcPlayerStats(2)
    expect(stats.maxHp).toBe(40)  // 30 + 1*10
    expect(stats.atk).toBe(10)     // 5 + 1*5
    expect(stats.def).toBe(6)      // 3 + 1*3
    expect(stats.spd).toBe(6)      // 3 + 1*3
  })

  it('should calculate level 5 stats correctly', () => {
    const stats = calcPlayerStats(5)
    expect(stats.maxHp).toBe(70)   // 30 + 4*10
    expect(stats.atk).toBe(25)     // 5 + 4*5
    expect(stats.def).toBe(15)     // 3 + 4*3
    expect(stats.spd).toBe(15)     // 3 + 4*3
  })

  it('should calculate level 10 stats correctly', () => {
    const stats = calcPlayerStats(10)
    expect(stats.maxHp).toBe(120)  // 30 + 9*10
    expect(stats.atk).toBe(50)     // 5 + 9*5
    expect(stats.def).toBe(30)     // 3 + 9*3
    expect(stats.spd).toBe(30)     // 3 + 9*3
  })
})

describe('calcEnemyStats (较同等级角色基础 +20%)', () => {
  it('level 1: 四维为玩家 × 系数', () => {
    const p = calcPlayerStats(1)
    const e = calcEnemyStats(1)
    expect(MONSTER_VS_PLAYER_STAT_MULT).toBe(1.2)
    expect(e.maxHp).toBe(Math.round(p.maxHp * 1.2))
    expect(e.atk).toBe(Math.round(p.atk * 1.2))
    expect(e.def).toBe(Math.round(p.def * 1.2))
    expect(e.spd).toBe(Math.round(p.spd * 1.2))
  })

  it('level 5: 与 calcPlayerStats(5) 成比例', () => {
    const p = calcPlayerStats(5)
    const e = calcEnemyStats(5)
    expect(e.maxHp).toBe(Math.round(p.maxHp * 1.2))
    expect(e.atk).toBe(Math.round(p.atk * 1.2))
  })
})

describe('attackIntervalMsFromSpd', () => {
  it('与玩家攻速公式一致：spd 越高间隔越短', () => {
    const slow = attackIntervalMsFromSpd(3)
    const fast = attackIntervalMsFromSpd(30)
    expect(fast).toBeLessThan(slow)
    expect(slow).toBeGreaterThanOrEqual(380)
    expect(slow).toBeLessThanOrEqual(2200)
  })
})

describe('rollEnemyBattleLevel', () => {
  it('比玩家低 1～2 级且不低于 1', () => {
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

describe('mitigatedPhysicalDamage（平滑承伤）', () => {
  const k = BATTLE_ARMOR_K

  it('无护甲时接近全额 raw', () => {
    expect(mitigatedPhysicalDamage(25, 0, k)).toBe(25)
  })

  it('护甲 = K 时约为一半', () => {
    expect(mitigatedPhysicalDamage(100, k, k)).toBe(50)
  })

  it('高护甲仍至少 1 点', () => {
    expect(mitigatedPhysicalDamage(5, 500, k)).toBe(1)
  })

  it('raw<=0 时保底 1', () => {
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

describe('allSkills', () => {
  it('should have 6 skills', () => {
    expect(allSkills).toHaveLength(6)
  })

  it('should have correct skill IDs', () => {
    const ids = allSkills.map(s => s.id)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('should have skills unlocked at correct levels', () => {
    const heavyStrike = allSkills.find(s => s.id === 1)
    expect(heavyStrike?.unlockLevel).toBe(1)
    expect(heavyStrike?.type).toBe('damage')

    const doubleStrike = allSkills.find(s => s.id === 3)
    expect(doubleStrike?.unlockLevel).toBe(2)
    expect(doubleStrike?.type).toBe('damage')
    expect(doubleStrike?.hits).toBe(2)

    const heal = allSkills.find(s => s.id === 4)
    expect(heal?.unlockLevel).toBe(3)
    expect(heal?.type).toBe('heal')

    const powerStrike = allSkills.find(s => s.id === 5)
    expect(powerStrike?.unlockLevel).toBe(5)

    const counter = allSkills.find(s => s.id === 6)
    expect(counter?.unlockLevel).toBe(7)
    expect(counter?.type).toBe('counter')
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
