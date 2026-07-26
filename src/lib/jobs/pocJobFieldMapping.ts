import type { JobClassConfig, JobRoleStats, PreferredRange } from './jobConfigTypes'

/** Strip optional "Label (dataType)" suffix from Keco Studio exported headers. */
export function parseHeaderLabel(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(.+?)\s*\(\w+(?:_\w+)*\)$/)
  return match ? match[1].trim() : trimmed
}

export function normalizeHeaderToken(raw: string): string {
  return parseHeaderLabel(raw).trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export type PocJobColumnMappingKey =
  | 'id'
  | 'name'
  | 'description'
  | 'preferredRange'
  | 'hp'
  | 'atk'
  | 'def'
  | 'spd'
  | 'growthHp'
  | 'growthAtk'
  | 'growthDef'
  | 'growthSpd'
  | 'hpMult'

export type PocJobMappingFieldDef = {
  key: PocJobColumnMappingKey
  label: string
  required?: boolean
  group: 'core' | 'stats'
  hint?: string
}

export const POC_JOB_MAPPING_FIELDS: PocJobMappingFieldDef[] = [
  { key: 'id', label: 'Class id', required: true, group: 'core', hint: 'e.g. hero, mage' },
  { key: 'name', label: 'Display name', required: true, group: 'core' },
  { key: 'description', label: 'Description', group: 'core' },
  {
    key: 'preferredRange',
    label: 'Preferred range',
    group: 'core',
    hint: 'melee | mid | ranged',
  },
  { key: 'hp', label: 'HP (Lv.1)', group: 'stats' },
  { key: 'atk', label: 'ATK (Lv.1)', group: 'stats' },
  { key: 'def', label: 'DEF (Lv.1)', group: 'stats' },
  { key: 'spd', label: 'SPD (Lv.1)', group: 'stats' },
  { key: 'growthHp', label: 'HP growth / level', group: 'stats' },
  { key: 'growthAtk', label: 'ATK growth / level', group: 'stats' },
  { key: 'growthDef', label: 'DEF growth / level', group: 'stats' },
  { key: 'growthSpd', label: 'SPD growth / level', group: 'stats' },
  { key: 'hpMult', label: 'HP multiplier', group: 'stats', hint: 'Reserved; maxHp currently ignores hpMult (see APPLY_ROLE_HP_MULT)' },
]

export type PocJobFlatRow = Record<PocJobColumnMappingKey, string>

export function emptyPocJobFlatRow(): PocJobFlatRow {
  return {
    id: '',
    name: '',
    description: '',
    preferredRange: 'melee',
    hp: '120',
    atk: '6',
    def: '4',
    spd: '4',
    growthHp: '35',
    growthAtk: '5',
    growthDef: '3',
    growthSpd: '3',
    hpMult: '5',
  }
}

export function normalizeJobId(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function resolveJobId(raw: string): { id: string } | { error: string } {
  const id = normalizeJobId(raw)
  if (!id) return { error: 'Job id is required' }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    return { error: 'Job id must start with a letter and use letters, digits, underscore' }
  }
  return { id }
}

function parsePreferredRange(raw: string): PreferredRange {
  const n = normalizeHeaderToken(raw)
  if (n === 'ranged' || n === 'range') return 'ranged'
  if (n === 'mid' || n === 'medium') return 'mid'
  return 'melee'
}

function parsePositiveNumber(raw: string, fallback: number): number {
  const n = Number(String(raw).trim())
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function flatRowToJobClassConfig(flat: PocJobFlatRow): JobClassConfig | null {
  const idRaw = flat.id.trim() || flat.name.trim()
  const resolved = resolveJobId(idRaw)
  if ('error' in resolved) return null

  const name = flat.name.trim() || resolved.id
  const builtin = emptyPocJobFlatRow()

  const stats: JobRoleStats = {
    hp: parsePositiveNumber(flat.hp, Number(builtin.hp)),
    atk: parsePositiveNumber(flat.atk, Number(builtin.atk)),
    def: parsePositiveNumber(flat.def, Number(builtin.def)),
    spd: parsePositiveNumber(flat.spd, Number(builtin.spd)),
    growthHp: parsePositiveNumber(flat.growthHp, Number(builtin.growthHp)),
    growthAtk: parsePositiveNumber(flat.growthAtk, Number(builtin.growthAtk)),
    growthDef: parsePositiveNumber(flat.growthDef, Number(builtin.growthDef)),
    growthSpd: parsePositiveNumber(flat.growthSpd, Number(builtin.growthSpd)),
    hpMult: Math.max(0.1, parsePositiveNumber(flat.hpMult, Number(builtin.hpMult))),
  }

  return {
    id: resolved.id,
    name,
    description: flat.description.trim() || name,
    preferredRange: parsePreferredRange(flat.preferredRange),
    stats,
  }
}
