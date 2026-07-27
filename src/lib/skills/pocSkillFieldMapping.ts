import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'
import { KECO_SKILL_CAST_RANGE } from '@/src/keco/kecoSkillBridge'

/** Normalize header / column key for case-insensitive alias lookup. */
export function normalizeHeaderToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/** Maps a Studio table column to a battle-poc skill field (simulation-aligned core + POC extras). */
export type PocSkillColumnMappingKey =
  | 'id'
  | 'name'
  | 'description'
  | 'category'
  | 'range'
  | 'power'
  | 'mpCost'
  | 'maxCooldown'

export type PocSkillMappingFieldDef = {
  key: PocSkillColumnMappingKey
  label: string
  required?: boolean
  group: 'core' | 'combat' | 'control'
  hint?: string
}

export const POC_SKILL_MAPPING_FIELDS: PocSkillMappingFieldDef[] = [
  { key: 'id', label: 'Skill id', required: true, group: 'core', hint: 'Code key: letters, digits, underscore' },
  { key: 'name', label: 'Display name', required: true, group: 'core' },
  { key: 'description', label: 'Description', group: 'core' },
  {
    key: 'category',
    label: 'Category (POC)',
    group: 'core',
    hint: 'burst | control | sustain | mobility | utility | execute',
  },
  { key: 'power', label: 'Power', group: 'combat', hint: 'Same as keco-simulation power / damage multiplier' },
  { key: 'mpCost', label: 'MP cost', group: 'combat' },
  { key: 'maxCooldown', label: 'Max cooldown', group: 'combat', hint: 'Keco maxCooldown (turns)' },
  { key: 'range', label: 'Cast range (POC)', group: 'combat', hint: 'Map battle tiles; default 3' },
]

/** Keco element columns — same semantics as keco-simulation skill sheet (snake_case in CSV). */
export type PocSkillKecoExtraFields = {
  skillType: string
  attachElement: string
  attachStrength: string
  attachTurns: string
  dotDamage: string
  dotTurns: string
  freezeTurns: string
  specialEffect: string
  specialEffectValue: string
  specialEffectDuration: string
  reactionTriggersJson: string
}

export type PocSkillFlatRow = Record<PocSkillColumnMappingKey, string> & PocSkillKecoExtraFields

export function emptyPocSkillFlatRow(): PocSkillFlatRow {
  return {
    id: '',
    name: '',
    description: '',
    category: 'burst',
    power: '1',
    mpCost: '0',
    maxCooldown: '0',
    range: String(KECO_SKILL_CAST_RANGE),
    skillType: 'attack',
    attachElement: '',
    attachStrength: 'weak',
    attachTurns: '',
    dotDamage: '',
    dotTurns: '',
    freezeTurns: '',
    specialEffect: '',
    specialEffectValue: '',
    specialEffectDuration: '',
    reactionTriggersJson: '',
  }
}

const SKILL_ID_PATTERN = /^[a-zA-Z0-9_]+$/

export function normalizeSkillId(raw: string): string {
  return raw
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
}

export function resolveSkillId(raw: string): { id: string } | { error: string } {
  const normalized = normalizeSkillId(raw)
  if (!normalized) return { error: 'Skill id cannot be empty' }
  if (!SKILL_ID_PATTERN.test(normalized)) {
    return { error: 'Skill id must be letters, digits, or underscore' }
  }
  return { id: normalized }
}

function parseNum(s: string, fallback: number): number {
  const n = Number(String(s).trim())
  return Number.isFinite(n) ? n : fallback
}

function parseIntNonNeg(s: string, fallback: number): number {
  const n = Math.floor(Number(String(s).trim()))
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function parseOptionalNumber(raw: string, field: string): number | undefined {
  const value = raw.trim()
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a finite number`)
  return parsed
}

function parseOptionalNonNegativeNumber(raw: string, field: string): number | undefined {
  const parsed = parseOptionalNumber(raw, field)
  if (parsed !== undefined && parsed < 0) throw new Error(`${field} must be non-negative`)
  return parsed
}

function parseRequiredNonNegativeInteger(raw: string, field: string): number {
  const value = raw.trim()
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
  return parsed
}

const VALID_CATEGORIES = new Set<NonNullable<BattleSkillDefinition['category']>>([
  'burst',
  'control',
  'sustain',
  'mobility',
  'utility',
  'execute',
])

function parseCategory(raw: string): BattleSkillDefinition['category'] {
  const v = raw.trim().toLowerCase()
  if (!v) return 'burst'
  if (VALID_CATEGORIES.has(v as NonNullable<BattleSkillDefinition['category']>)) {
    return v as NonNullable<BattleSkillDefinition['category']>
  }
  if (v === 'heal' || v === 'support') return 'sustain'
  if (v === 'attack' || v === 'damage') return 'burst'
  if (v === 'freeze' || v === 'cc') return 'control'
  throw new Error(`category "${raw.trim()}" is not supported`)
}

export function parseBattleSkillRow(row: PocSkillFlatRow): {
  definition: BattleSkillDefinition | null
  error?: string
} {
  const idResolved = resolveSkillId(row.id)
  if ('error' in idResolved) return { definition: null, error: idResolved.error }
  const name = row.name.trim() || idResolved.id

  try {
    const ratio = parseOptionalNonNegativeNumber(row.power, 'power') ?? 1
    const range = parseOptionalNonNegativeNumber(row.range, 'range') ?? KECO_SKILL_CAST_RANGE
    const mpCost = parseRequiredNonNegativeInteger(row.mpCost, 'mpCost')
    const cooldownTicks = parseRequiredNonNegativeInteger(row.maxCooldown, 'maxCooldown')
    const def: BattleSkillDefinition = {
      id: idResolved.id,
      name,
      description: row.description.trim() || undefined,
      category: parseCategory(row.category),
      ratio,
      mpCost,
      range,
      cooldownTicks,
    }

    const params: Record<string, unknown> = { skillType: row.skillType.trim() || 'attack' }
    const advanced = [
      ['attachElement', row.attachElement, 'string'],
      ['attachStrength', row.attachStrength, 'string'],
      ['attachTurns', row.attachTurns, 'number'],
      ['dotDamage', row.dotDamage, 'number'],
      ['dotTurns', row.dotTurns, 'number'],
      ['freezeTurns', row.freezeTurns, 'number'],
      ['specialEffect', row.specialEffect, 'string'],
      ['specialEffectValue', row.specialEffectValue, 'number'],
      ['specialEffectDuration', row.specialEffectDuration, 'number'],
    ] as const
    for (const [key, value, kind] of advanced) {
      if (!value.trim()) continue
      params[key] = kind === 'number' ? parseOptionalNonNegativeNumber(value, key) : value.trim()
    }
    if (row.reactionTriggersJson.trim()) {
      try {
        const parsed = JSON.parse(row.reactionTriggersJson)
        if (!Array.isArray(parsed)) throw new Error('must be a JSON array')
        params.reactionTriggers = parsed
      } catch (error) {
        throw new Error(`reactionTriggersJson must be valid JSON: ${error instanceof Error ? error.message : 'invalid value'}`)
      }
    }
    if (Object.keys(params).length > 0) def.params = params

    const freeze = parseOptionalNonNegativeNumber(row.freezeTurns, 'freezeTurns')
    if (freeze !== undefined && freeze > 0) def.applyFreezeTicks = Math.floor(freeze)
    return { definition: def }
  } catch (error) {
    return {
      definition: null,
      error: error instanceof Error ? error.message : 'invalid field value',
    }
  }
}

export function flatRowToBattleSkillDefinition(row: PocSkillFlatRow): BattleSkillDefinition | null {
  const parsed = parseBattleSkillRow(row)
  if (parsed.error) return null
  const def = parsed.definition
  if (!def) return null

  return def
}

export function battleSkillDefinitionToFlatRow(def: BattleSkillDefinition): PocSkillFlatRow {
  return {
    ...emptyPocSkillFlatRow(),
    id: def.id,
    name: def.name,
    description: def.description ?? '',
    category: def.category ?? 'burst',
    power: String(def.ratio),
    mpCost: String(def.mpCost),
    range: String(def.range ?? KECO_SKILL_CAST_RANGE),
    maxCooldown: String(
      def.cooldownUnit === 'ticks'
        ? Math.floor(def.cooldownTicks / 10)
        : def.cooldownTicks,
    ),
    freezeTurns: def.applyFreezeTicks != null ? String(def.applyFreezeTicks) : '',
  }
}
