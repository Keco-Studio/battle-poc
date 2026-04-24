import { describe, expect, it } from 'vitest'
import { resolveSkillFxProfile } from '../app/components/map-ui/skillFxProfile'

describe('resolveSkillFxProfile', () => {
  it('maps fire and arcane skills to corresponding projectiles', () => {
    expect(resolveSkillFxProfile({ action: 'cast_skill', skillId: 'fireball', actorRole: 'player' }).projectileKind).toBe(
      'fireball'
    )
    expect(
      resolveSkillFxProfile({ action: 'cast_skill', skillId: 'arcane_bolt', actorRole: 'enemy' }).projectileKind
    ).toBe('arcane_bolt')
  })

  it('maps ice, support and melee skills to generic groups', () => {
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

  it('basic attacks keep existing arrow logic, unknown skills fallback to generic', () => {
    expect(resolveSkillFxProfile({ action: 'basic_attack', actorRole: 'player' }).projectileKind).toBe('arrow')
    expect(resolveSkillFxProfile({ action: 'basic_attack', actorRole: 'enemy' }).projectileKind).toBeNull()
    expect(resolveSkillFxProfile({ action: 'cast_skill', skillId: 'unknown_skill', actorRole: 'player' }).projectileKind).toBe(
      'generic'
    )
  })
})
