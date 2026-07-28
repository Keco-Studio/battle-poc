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
}): { projectileKind: ProjectileKind | null; durationMs: number; assetUrl: string | null } {
  const action = String(input.action || '')
  const skillId = String(input.skillId || '').toLowerCase()
  if (action === 'basic_attack') {
    return {
      projectileKind: input.actorRole === 'player' ? 'arrow' : null,
      durationMs: 280,
      assetUrl: null,
    }
  }
  if (action !== 'cast_skill') {
    return { projectileKind: null, durationMs: 320, assetUrl: null }
  }

  const assetUrl = getVs01SkillFxPath(skillId)
  if (assetUrl) {
    const projectileKind: ProjectileKind = skillId.includes('frost') || skillId.includes('shatter')
      ? 'frost'
      : skillId.includes('mending')
        ? 'support'
        : skillId.includes('sunder') || skillId.includes('phase')
          ? 'slash'
          : 'generic'
    return { projectileKind, durationMs: 360, assetUrl }
  }

  if (skillId === 'fireball') return { projectileKind: 'fireball', durationMs: 360, assetUrl: null }
  if (skillId.includes('arcane') || skillId.includes('mana')) {
    return { projectileKind: 'arcane_bolt', durationMs: 340, assetUrl: null }
  }
  if (skillId.includes('frost') || skillId.includes('ice')) {
    return { projectileKind: 'frost', durationMs: 350, assetUrl: null }
  }
  if (skillId.includes('heal') || skillId.includes('barrier') || skillId.includes('aura')) {
    return { projectileKind: 'support', durationMs: 300, assetUrl: null }
  }
  if (
    skillId.includes('shadow') ||
    skillId.includes('backstab') ||
    skillId.includes('taunt') ||
    skillId.includes('shield') ||
    skillId.includes('rally')
  ) {
    return { projectileKind: 'slash', durationMs: 250, assetUrl: null }
  }
  return { projectileKind: 'generic', durationMs: 320, assetUrl: null }
}
import { getVs01SkillFxPath } from '@/src/content/generated/vs01/assets'
