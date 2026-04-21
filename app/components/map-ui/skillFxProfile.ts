export type ProjectileKind =
  | 'arrow'
  | 'fireball'
  | 'arcane_bolt'
  | 'frost'
  | 'slash'
  | 'support'
  | 'generic'

export function resolveSkillFxProfile(input: {
  action: string
  actorRole: 'player' | 'enemy'
  skillId?: string
}): { projectileKind: ProjectileKind | null; durationMs: number } {
  const action = String(input.action || '')
  const skillId = String(input.skillId || '').toLowerCase()
  if (action === 'basic_attack') {
    return {
      projectileKind: input.actorRole === 'player' ? 'arrow' : null,
      durationMs: 280,
    }
  }
  if (action !== 'cast_skill') {
    return { projectileKind: null, durationMs: 320 }
  }

  if (skillId === 'fireball') return { projectileKind: 'fireball', durationMs: 360 }
  if (skillId.includes('arcane') || skillId.includes('mana')) {
    return { projectileKind: 'arcane_bolt', durationMs: 340 }
  }
  if (skillId.includes('frost') || skillId.includes('ice')) {
    return { projectileKind: 'frost', durationMs: 350 }
  }
  if (skillId.includes('heal') || skillId.includes('barrier') || skillId.includes('aura')) {
    return { projectileKind: 'support', durationMs: 300 }
  }
  if (
    skillId.includes('shadow') ||
    skillId.includes('backstab') ||
    skillId.includes('taunt') ||
    skillId.includes('shield') ||
    skillId.includes('rally')
  ) {
    return { projectileKind: 'slash', durationMs: 250 }
  }
  return { projectileKind: 'generic', durationMs: 320 }
}
