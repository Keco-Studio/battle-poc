import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import {
  ASSET_NAME_COLUMN_KEY,
  type StudioTableColumn,
  type StudioTableRow,
} from '@/src/lib/studio/studioLibraryService'
import { normalizeHeaderToken } from '@/src/lib/jobs/pocJobFieldMapping'
import type { PocGameConfigDraft } from './pocGameConfigDrafts'
import type { GameConfigBundle, GameConfigImportKind } from './gameConfigTypes'
import {
  BALANCE_SCALAR_KEYS,
  createDefaultGameConfigBundle,
  isEquipmentType,
  type BalanceScalarKey,
} from './defaultGameConfig'

export type GameConfigColumnKey = string

export function detectIdColumnKey(columns: StudioTableColumn[], kind: GameConfigImportKind): string | undefined {
  const tokens =
    kind === 'balance_scalar'
      ? ['key', 'configkey', 'id']
      : kind === 'loadout'
        ? ['jobclassid', 'jobid', 'classid', 'id']
        : ['id']
  const hit = columns.find((c) => {
    const nLabel = normalizeHeaderToken(c.label)
    const nKey = normalizeHeaderToken(c.key)
    return tokens.some((t) => nLabel === t || nKey === t)
  })
  return hit?.key
}

export function findRowByIdCell(
  rows: StudioTableRow[],
  idColumnKey: string,
  idValue: string,
): StudioTableRow | null {
  const want = idValue.trim().toLowerCase()
  if (!want) return null
  const matches = rows.filter((row) => {
    const cell = cellValueToString(row.values[idColumnKey]).trim().toLowerCase()
    return cell === want
  })
  return matches.length === 1 ? matches[0]! : null
}

export function extractIdOptionsFromRows(
  rows: StudioTableRow[],
  columnKey: string,
): Array<{ value: string; label: string }> {
  const seen = new Set<string>()
  const options: Array<{ value: string; label: string }> = []
  for (const row of rows) {
    const value = cellValueToString(row.values[columnKey]).trim()
    if (!value) continue
    const dedupeKey = value.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    options.push({ value, label: value })
  }
  options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  return options
}

function parseNum(raw: string, field: string, fallback?: number): number {
  const value = String(raw).trim()
  if (!value && fallback !== undefined) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`${field} must be a finite number`)
  return n
}

function cell(row: StudioTableRow, colKey: string | undefined): string {
  if (!colKey) return ''
  return cellValueToString(row.values[colKey]).trim()
}

function colByAliases(columns: StudioTableColumn[], aliases: string[]): string | undefined {
  for (const col of columns) {
    const t = normalizeHeaderToken(col.label)
    const k = normalizeHeaderToken(col.key)
    if (aliases.some((a) => t === a || k === a)) return col.key
  }
  return undefined
}

export function buildDraftFromTableRow(args: {
  kind: GameConfigImportKind
  tableId: string
  row: StudioTableRow
  columns: StudioTableColumn[]
  idColumnKey: string
  idValue: string
}): PocGameConfigDraft {
  const { kind, tableId, row, columns, idColumnKey, idValue } = args
  const fields: PocGameConfigDraft['fields'] = {}
  const idStored = cell(row, idColumnKey) || idValue.trim()
  fields.id = { tableId, columnKey: idColumnKey, value: idStored }

  const set = (key: string, aliases: string[]) => {
    const ck = colByAliases(columns, aliases)
    if (!ck) return
    const v = cell(row, ck)
    fields[key] = { tableId, columnKey: ck, value: v }
  }

  if (kind === 'equipment') {
    set('name', ['name', 'displayname'])
    set('icon', ['icon'])
    set('stat', ['stat'])
    set('bonus', ['bonus'])
  } else if (kind === 'loadout') {
    set('skillIds', ['skillids', 'skills', 'defaultskills', 'loadout'])
  } else if (kind === 'basic_attack') {
    set('name', ['name'])
    set('icon', ['icon'])
    set('multiplier', ['multiplier', 'ratio'])
    set('desc', ['desc', 'description'])
  } else {
    set('value', ['value', 'amount'])
  }

  return {
    draftId: crypto.randomUUID(),
    kind,
    sourceRowId: row.id,
    fields,
  }
}

function parseSkillIdList(raw: string): string[] {
  return raw
    .split(/[,;|\s]+/)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((s) => s.length > 0)
}

function applyBalanceScalar(bundle: GameConfigBundle, key: string, value: string): void {
  const token = normalizeHeaderToken(key)
  const resolved = BALANCE_SCALAR_KEYS.find((k) => normalizeHeaderToken(k) === token)
  if (!resolved) return
  const v = parseNum(value, key)

  switch (resolved) {
    case 'exp_per_level':
      bundle.progression.expPerLevel = v
      break
    case 'reward_exp_per_enemy_level':
      bundle.progression.rewardExpPerEnemyLevel = v
      break
    case 'reward_gold_per_enemy_level':
      bundle.progression.rewardGoldPerEnemyLevel = v
      break
    case 'enemy_base_hp':
      bundle.enemyFormula.base.hp = v
      break
    case 'enemy_base_atk':
      bundle.enemyFormula.base.atk = v
      break
    case 'enemy_base_def':
      bundle.enemyFormula.base.def = v
      break
    case 'enemy_base_spd':
      bundle.enemyFormula.base.spd = v
      break
    case 'enemy_growth_hp':
      bundle.enemyFormula.growth.hp = v
      break
    case 'enemy_growth_atk':
      bundle.enemyFormula.growth.atk = v
      break
    case 'enemy_growth_def':
      bundle.enemyFormula.growth.def = v
      break
    case 'enemy_growth_spd':
      bundle.enemyFormula.growth.spd = v
      break
    case 'hp_multiplier':
      bundle.enemyFormula.hpMultiplier = v
      break
    case 'battle_armor_k':
      bundle.battleFormulas.armorK = v
      break
    case 'basic_damage_multiplier':
      bundle.battleFormulas.basicDamageMultiplier = v
      break
    case 'skill_damage_multiplier':
      bundle.battleFormulas.skillDamageMultiplier = v
      break
    case 'defend_damage_reduction':
      bundle.battleFormulas.defendDamageReduction = v
      break
    case 'defend_skill_reduction':
      bundle.battleFormulas.defendSkillReduction = v
      break
    default:
      break
  }
}

export function applyDraftToBundle(
  bundle: GameConfigBundle,
  draft: PocGameConfigDraft,
): string | null {
  const id = draft.fields.id?.value?.trim().toLowerCase()
  if (!id) return 'Missing id'

  if (draft.kind === 'equipment') {
    if (!isEquipmentType(id)) return `Unknown equipment slot "${id}" (use weapon|ring|armor|shoes)`
    const statRaw = (draft.fields.stat?.value ?? 'atk').trim().toLowerCase()
    if (!['atk', 'maxhp', 'hp', 'def', 'spd'].includes(statRaw)) {
      return `Unknown equipment stat "${statRaw}" (use atk|maxHp|def|spd)`
    }
    const stat =
      statRaw === 'maxhp' || statRaw === 'hp' ? 'maxHp' : statRaw === 'def' ? 'def' : statRaw === 'spd' ? 'spd' : 'atk'
    const bonus = parseNum(draft.fields.bonus?.value ?? '', 'bonus', bundle.equipment[id].bonus)
    bundle.equipment[id] = {
      name: draft.fields.name?.value?.trim() || bundle.equipment[id].name,
      icon: draft.fields.icon?.value?.trim() || bundle.equipment[id].icon,
      stat: stat as 'atk' | 'maxHp' | 'def' | 'spd',
      bonus,
    }
    return null
  }

  if (draft.kind === 'loadout') {
    const skills = parseSkillIdList(draft.fields.skillIds?.value ?? '')
    if (skills.length === 0) return 'Missing skill ids'
    bundle.roleLoadouts[id] = skills
    return null
  }

  if (draft.kind === 'basic_attack') {
    if (id !== 'basic_attack') return 'basic_attack row id must be "basic_attack"'
    const def = bundle.basicAttack
    const multiplier = parseNum(draft.fields.multiplier?.value ?? '', 'multiplier', def.multiplier)
    const next = {
      ...def,
      name: draft.fields.name?.value?.trim() || def.name,
      icon: draft.fields.icon?.value?.trim() || def.icon,
      multiplier,
      desc: draft.fields.desc?.value?.trim() || def.desc,
    }
    bundle.basicAttack = next
    return null
  }

  if (draft.kind === 'balance_scalar') {
    const keyNorm = normalizeHeaderToken(id)
    if (!BALANCE_SCALAR_KEYS.some((k) => normalizeHeaderToken(k) === keyNorm)) {
      return `Unknown balance key "${id}"`
    }
    try {
      applyBalanceScalar(bundle, id, draft.fields.value?.value ?? '')
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid balance value'
    }
    return null
  }

  return 'Unknown draft kind'
}

export function mergeDraftsIntoBundle(
  drafts: PocGameConfigDraft[],
  base?: GameConfigBundle,
): { bundle: GameConfigBundle; errors: { draftId: string; error: string }[] } {
  const bundle = JSON.parse(JSON.stringify(base ?? createDefaultGameConfigBundle())) as GameConfigBundle
  const errors: { draftId: string; error: string }[] = []
  for (const draft of drafts) {
    try {
      const err = applyDraftToBundle(bundle, draft)
      if (err) errors.push({ draftId: draft.draftId, error: err })
    } catch (error) {
      errors.push({
        draftId: draft.draftId,
        error: error instanceof Error ? error.message : 'Invalid game config value',
      })
    }
  }
  return { bundle, errors }
}
