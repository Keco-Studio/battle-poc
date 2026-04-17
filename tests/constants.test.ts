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
    expect(stats.maxHp).toBe(100)  // 100 + 0*30
    expect(stats.atk).toBe(5)      // 5 + 0*5
    expect(stats.def).toBe(3)      // 3 + 0*3
    expect(stats.spd).toBe(3)      // 3 + 0*3
  })

  it('should calculate level 2 stats correctly', () => {
    const stats = calcPlayerStats(2)
    expect(stats.maxHp).toBe(130)  // 100 + 1*30
    expect(stats.atk).toBe(10)     // 5 + 1*5
    expect(stats.def).toBe(6)      // 3 + 1*3
    expect(stats.spd).toBe(6)      // 3 + 1*3
  })

  it('should calculate level 5 stats correctly', () => {
    const stats = calcPlayerStats(5)
    expect(stats.maxHp).toBe(220)   // 100 + 4*30
    expect(stats.atk).toBe(25)     // 5 + 4*5
    expect(stats.def).toBe(15)     // 3 + 4*3
    expect(stats.spd).toBe(15)     // 3 + 4*3
  })

  it('should calculate level 10 stats correctly', () => {
    const stats = calcPlayerStats(10)
    expect(stats.maxHp).toBe(370)  // 100 + 9*30
    expect(stats.atk).toBe(50)     // 5 + 9*5
    expect(stats.def).toBe(30)     // 3 + 9*3
    expect(stats.spd).toBe(30)     // 3 + 9*3
  })
})

describe('calcEnemyStats', () => {
  it('level 1: 使用敌人独立基础值', () => {
    const e = calcEnemyStats(1)
    expect(e.maxHp).toBe(120)
    expect(e.atk).toBe(6)
    expect(e.def).toBe(3)
    expect(e.spd).toBe(3)
  })

  it('level 5: 使用敌人独立成长值', () => {
    const e = calcEnemyStats(5)
    expect(e.maxHp).toBe(264)
    expect(e.atk).toBe(30)
    expect(e.def).toBe(15)
    expect(e.spd).toBe(15)
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

describe('createEnemyEncounter', () => {
  it('同一次遭遇会产出统一的等级与属性，并应用 profile 覆盖', () => {
    const encounter = createEnemyEncounter(5, { maxHp: 999, def: 20 }, () => 0)
    expect(encounter.level).toBe(4)
    expect(encounter.stats).toEqual({
      maxHp: 999,
      atk: 24,
      def: 20,
      spd: 12,
    })
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

describe('getBattleRewards', () => {
  it('经验按敌人等级发放，金币保持双倍等级', () => {
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
