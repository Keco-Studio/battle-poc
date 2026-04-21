import { describe, expect, it } from 'vitest'
import { resolveSkillFxProfile } from '../app/components/map-ui/skillFxProfile'

describe('resolveSkillFxProfile', () => {
  it('映射火焰与奥术技能到对应弹道', () => {
    expect(resolveSkillFxProfile({ action: 'cast_skill', skillId: 'fireball', actorRole: 'player' }).projectileKind).toBe(
      'fireball'
    )
    expect(
      resolveSkillFxProfile({ action: 'cast_skill', skillId: 'arcane_bolt', actorRole: 'enemy' }).projectileKind
    ).toBe('arcane_bolt')
  })

  it('映射冰系、支援与近战技能到通用分组', () => {
    expect(
      resolveSkillFxProfile({ action: 'cast_skill', skillId: 'frost_lock', actorRole: 'player' }).projectileKind
    ).toBe('frost')
    expect(resolveSkillFxProfile({ action: 'cast_skill', skillId: 'heal_wave', actorRole: 'player' }).projectileKind).toBe(
      'support'
    )
    expect(resolveSkillFxProfile({ action: 'cast_skill', skillId: 'backstab', actorRole: 'player' }).projectileKind).toBe(
      'slash'
    )
  })

  it('普通攻击保持现有箭矢逻辑，未知技能回退generic', () => {
    expect(resolveSkillFxProfile({ action: 'basic_attack', actorRole: 'player' }).projectileKind).toBe('arrow')
    expect(resolveSkillFxProfile({ action: 'basic_attack', actorRole: 'enemy' }).projectileKind).toBeNull()
    expect(resolveSkillFxProfile({ action: 'cast_skill', skillId: 'unknown_skill', actorRole: 'player' }).projectileKind).toBe(
      'generic'
    )
  })
})
