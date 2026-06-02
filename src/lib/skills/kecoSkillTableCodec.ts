import type { Element, ElementStrength, ReactionType, Skill, SkillType } from '@keco/battle-engine'
import { ELEMENT_STRENGTH_CONFIG } from '@keco/battle-engine'
import {
  parseElementKey,
  parseReactionKey,
  parseSpecialEffectType,
  parseStrengthKey,
} from './elementLabelCodec'
import type { PocSkillFlatRow } from './pocSkillFieldMapping'

function parseNum(s: string, fallback: number): number {
  const n = Number(String(s).trim())
  return Number.isFinite(n) ? n : fallback
}

function parseIntNonNeg(s: string, fallback: number): number {
  const n = Math.floor(Number(String(s).trim()))
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function isStrength(s: string): s is ElementStrength {
  return s === 'weak' || s === 'medium' || s === 'strong'
}

function isSkillType(s: string): s is SkillType {
  return s === 'attack' || s === 'heal'
}

function parseReactionTriggersJson(raw: string): { element: Element; reaction: ReactionType }[] {
  const t = raw.trim()
  if (!t) return []
  try {
    const parsed = JSON.parse(t) as unknown
    if (!Array.isArray(parsed)) return []
    const triggers: { element: Element; reaction: ReactionType }[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const el = parseElementKey(String((item as { element?: unknown }).element ?? ''))
      const re = parseReactionKey(String((item as { reaction?: unknown }).reaction ?? ''))
      if (!el || el === 'random' || !re) continue
      triggers.push({ element: el, reaction: re })
    }
    return triggers
  } catch {
    return []
  }
}

/** Convert Studio/CSV flat row → Keco Skill (same rules as keco-simulation skillTableCodec). */
export function flatRowToKecoSkillFromRow(row: PocSkillFlatRow): Skill | null {
  const id = row.id.trim()
  const name = row.name.trim()
  if (!id || !name) return null

  const typeRaw = row.skillType.trim().toLowerCase()
  const type: SkillType = isSkillType(typeRaw) ? typeRaw : 'attack'
  const power = Math.max(0, parseNum(row.power, 1))
  const mpCost = parseIntNonNeg(row.mpCost, 0)
  const maxCooldown = parseIntNonNeg(row.maxCooldown, 0)

  const skill: Skill = {
    id,
    name,
    type,
    power: power < 0 ? 0 : power,
    mpCost,
    cooldown: 0,
    maxCooldown,
    description: row.description.trim() || '—',
  }

  const attachParsed = parseElementKey(row.attachElement)
  if (attachParsed) {
    const strengthRaw = row.attachStrength.trim()
    const strength: ElementStrength =
      parseStrengthKey(strengthRaw) ?? (isStrength(strengthRaw) ? strengthRaw : 'weak')
    const defaultDur = ELEMENT_STRENGTH_CONFIG[strength].duration
    const duration = row.attachTurns.trim()
      ? parseIntNonNeg(row.attachTurns, defaultDur)
      : defaultDur
    skill.attachElement = {
      element: attachParsed,
      strength,
      duration: duration > 0 ? duration : defaultDur,
    }
  }

  const dotD = row.dotDamage.trim()
  const dotT = row.dotTurns.trim()
  if (dotD || dotT) {
    const damage = parseNum(dotD, 0)
    const duration = parseIntNonNeg(dotT, 0)
    if (duration > 0 && damage >= 0) {
      skill.dot = { damage, duration }
    }
  }

  const freeze = parseIntNonNeg(row.freezeTurns, 0)
  if (freeze > 0) {
    skill.crowdControl = { type: 'freeze', duration: freeze }
  }

  const specialType = parseSpecialEffectType(row.specialEffect)
  if (specialType) {
    const value = parseNum(row.specialEffectValue, 0)
    const duration = parseIntNonNeg(row.specialEffectDuration, specialType === 'heal' ? 0 : 2)
    skill.specialEffect = {
      type: specialType,
      value: value < 0 ? 0 : value,
      duration,
    }
  }

  const triggers = parseReactionTriggersJson(row.reactionTriggersJson)
  if (triggers.length > 0) {
    skill.reactionTrigger = triggers
  }

  return skill
}
