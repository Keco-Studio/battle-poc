import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'

/** Normalize header / column key for case-insensitive alias lookup. */
export function normalizeHeaderToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/** Maps a Studio table column to a battle-poc skill field. */
export type PocSkillColumnMappingKey =
  | 'id'
  | 'name'
  | 'description'
  | 'category'
  | 'ratio'
  | 'mpCost'
  | 'range'
  | 'cooldownTicks'
  | 'applyFreezeTicks'
  | 'shatterBonusRatio'
  | 'consumeFreezeOnHit'

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
    label: 'Category',
    group: 'core',
    hint: 'burst | control | sustain | mobility | utility | execute',
  },
  { key: 'ratio', label: 'Damage ratio', group: 'combat', hint: 'Skill damage multiplier (e.g. 1.35)' },
  { key: 'mpCost', label: 'MP cost', group: 'combat' },
  { key: 'range', label: 'Cast range', group: 'combat', hint: 'Tiles / world units' },
  { key: 'cooldownTicks', label: 'Cooldown ticks', group: 'combat', hint: 'Base CD before engine scaling' },
  { key: 'applyFreezeTicks', label: 'Freeze ticks', group: 'control' },
  { key: 'shatterBonusRatio', label: 'Shatter bonus ratio', group: 'control' },
  { key: 'consumeFreezeOnHit', label: 'Consume freeze on hit', group: 'control', hint: 'true | false' },
]

export type PocSkillFlatRow = Record<PocSkillColumnMappingKey, string>

export function emptyPocSkillFlatRow(): PocSkillFlatRow {
  return {
    id: '',
    name: '',
    description: '',
    category: 'burst',
    ratio: '1',
    mpCost: '0',
    range: '6',
    cooldownTicks: '0',
    applyFreezeTicks: '',
    shatterBonusRatio: '',
    consumeFreezeOnHit: '',
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

function parseBool(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase()
  if (!v) return undefined
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  return undefined
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
    ratio: Math.max(0, parseNum(row.ratio, 1)),
    mpCost: parseIntNonNeg(row.mpCost, 0),
    range: Math.max(0.5, parseNum(row.range, 6)),
    cooldownTicks: parseIntNonNeg(row.cooldownTicks, 0),
  }

  const freeze = row.applyFreezeTicks.trim()
  if (freeze) {
    const ticks = parseIntNonNeg(freeze, 0)
    if (ticks > 0) def.applyFreezeTicks = ticks
  }

  const shatter = row.shatterBonusRatio.trim()
  if (shatter) {
    const ratio = parseNum(shatter, 0)
    if (ratio > 0) def.shatterBonusRatio = ratio
  }

  const consume = parseBool(row.consumeFreezeOnHit)
  if (consume !== undefined) def.consumeFreezeOnHit = consume

  return def
}

export function battleSkillDefinitionToFlatRow(def: BattleSkillDefinition): PocSkillFlatRow {
  return {
    id: def.id,
    name: def.name,
    description: def.description ?? '',
    category: def.category ?? 'burst',
    ratio: String(def.ratio),
    mpCost: String(def.mpCost),
    range: String(def.range),
    cooldownTicks: String(Math.floor(def.cooldownTicks / 10)),
    applyFreezeTicks: def.applyFreezeTicks != null ? String(def.applyFreezeTicks) : '',
    shatterBonusRatio: def.shatterBonusRatio != null ? String(def.shatterBonusRatio) : '',
    consumeFreezeOnHit:
      def.consumeFreezeOnHit != null ? String(def.consumeFreezeOnHit) : '',
  }
}
