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
  if (VALID_CATEGORIES.has(v as NonNullable<BattleSkillDefinition['category']>)) {
    return v as NonNullable<BattleSkillDefinition['category']>
  }
  if (v === 'heal' || v === 'support') return 'sustain'
  if (v === 'attack' || v === 'damage') return 'burst'
  if (v === 'freeze' || v === 'cc') return 'control'
  return 'burst'
}

export function flatRowToBattleSkillDefinition(row: PocSkillFlatRow): BattleSkillDefinition | null {
  const idResolved = resolveSkillId(row.id)
  if ('error' in idResolved) return null
  const name = row.name.trim() || idResolved.id

  const def: BattleSkillDefinition = {
    id: idResolved.id,
    name,
    description: row.description.trim() || undefined,
    category: parseCategory(row.category),
    ratio: Math.max(0, parseNum(row.power, 1)),
    mpCost: parseIntNonNeg(row.mpCost, 0),
    range: KECO_SKILL_CAST_RANGE,
    cooldownTicks: parseIntNonNeg(row.maxCooldown, 0),
  }

  const freeze = row.freezeTurns.trim()
  if (freeze) {
    const turns = parseIntNonNeg(freeze, 0)
    if (turns > 0) def.applyFreezeTicks = turns
  }

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
    maxCooldown: String(Math.floor(def.cooldownTicks / 10) || def.cooldownTicks),
    freezeTurns: def.applyFreezeTicks != null ? String(def.applyFreezeTicks) : '',
  }
}
