import {
  emptyPocSkillFlatRow,
  flatRowToBattleSkillDefinition,
  normalizeHeaderToken,
  POC_SKILL_MAPPING_FIELDS,
  type PocSkillColumnMappingKey,
  type PocSkillFlatRow,
  type PocSkillKecoExtraFields,
} from './pocSkillFieldMapping'
import { flatRowToKecoSkillFromRow } from './kecoSkillTableCodec'
import { registerKecoSkills } from '@/src/keco/kecoSkillBridge'
import { setKecoSkillsRecord } from './kecoSkillRegistry'
import type { PocSkillDraft } from './pocSkillDrafts'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import {
  ASSET_NAME_COLUMN_KEY,
  type StudioTableColumn,
  type StudioTableRow,
} from '@/src/lib/studio/studioLibraryService'
import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'

/** Studio / sheet header aliases → battle-poc skill fields. */
const HEADER_SKILL_CANDIDATES: Record<string, PocSkillColumnMappingKey[]> = {
  id: ['id'],
  skillid: ['id'],
  name: ['name'],
  displayname: ['name'],
  display: ['name'],
  skillname: ['name'],
  title: ['name'],
  description: ['description'],
  desc: ['description'],
  category: ['category'],
  skillcategory: ['category'],
  power: ['power'],
  ratio: ['power'],
  damage: ['power'],
  multiplier: ['power'],
  mpcost: ['mpCost'],
  mp: ['mpCost'],
  manacost: ['mpCost'],
  range: ['range'],
  castrange: ['range'],
  maxcooldown: ['maxCooldown'],
  cooldownticks: ['maxCooldown'],
  cooldown: ['maxCooldown'],
  cd: ['maxCooldown'],
  maxcd: ['maxCooldown'],
}

export type ImportHeaderAmbiguity = {
  kind: 'header'
  columnKey: string
  columnLabel: string
  candidates: PocSkillColumnMappingKey[]
}

export type ImportColumnCollision = {
  kind: 'columnCollision'
  skillKey: PocSkillColumnMappingKey
  columns: { columnKey: string; columnLabel: string }[]
}

export type ImportAmbiguity = ImportHeaderAmbiguity | ImportColumnCollision

export type ImportColumnMappingPlan = {
  columnToField: Map<string, PocSkillColumnMappingKey>
  ambiguities: ImportAmbiguity[]
  unmappedColumnKeys: string[]
}

function skillKeysForHeaderToken(token: string): PocSkillColumnMappingKey[] {
  const norm = normalizeHeaderToken(token)
  if (!norm) return []
  return HEADER_SKILL_CANDIDATES[norm] ?? []
}

function candidatesForColumn(col: StudioTableColumn): PocSkillColumnMappingKey[] {
  if (col.key === ASSET_NAME_COLUMN_KEY) return []
  const fromLabel = skillKeysForHeaderToken(col.label)
  const fromKey = skillKeysForHeaderToken(col.key)
  return [...new Set([...fromLabel, ...fromKey])]
}

export function planImportColumnMapping(
  columns: StudioTableColumn[],
  resolutions: Record<string, PocSkillColumnMappingKey> = {},
): ImportColumnMappingPlan {
  const columnToField = new Map<string, PocSkillColumnMappingKey>()
  const ambiguities: ImportAmbiguity[] = []
  const unmappedColumnKeys: string[] = []

  for (const col of columns) {
    if (resolutions[col.key]) {
      columnToField.set(col.key, resolutions[col.key]!)
      continue
    }

    const candidates = candidatesForColumn(col)
    if (candidates.length === 0) {
      unmappedColumnKeys.push(col.key)
      continue
    }
    if (candidates.length > 1) {
      ambiguities.push({
        kind: 'header',
        columnKey: col.key,
        columnLabel: col.label,
        candidates,
      })
      continue
    }
    columnToField.set(col.key, candidates[0]!)
  }

  const bySkill = new Map<PocSkillColumnMappingKey, { columnKey: string; columnLabel: string }[]>()
  for (const col of columns) {
    const skillKey = columnToField.get(col.key)
    if (!skillKey) continue
    const list = bySkill.get(skillKey) ?? []
    list.push({ columnKey: col.key, columnLabel: col.label })
    bySkill.set(skillKey, list)
  }

  for (const [skillKey, cols] of bySkill) {
    if (cols.length <= 1) continue
    const resolved = cols.find((c) => resolutions[c.columnKey] === skillKey)
    if (resolved) {
      for (const c of cols) {
        if (c.columnKey !== resolved.columnKey) columnToField.delete(c.columnKey)
      }
      columnToField.set(resolved.columnKey, skillKey)
      continue
    }
    ambiguities.push({ kind: 'columnCollision', skillKey, columns: cols })
  }

  return { columnToField, ambiguities, unmappedColumnKeys }
}

export function detectIdColumnKey(columns: StudioTableColumn[]): string | undefined {
  const hit = columns.find((c) => {
    const nLabel = normalizeHeaderToken(c.label)
    const nKey = normalizeHeaderToken(c.key)
    return nLabel === 'id' || nKey === 'id' || nLabel === 'skillid' || nKey === 'skillid'
  })
  return hit?.key ?? columns.find((c) => c.key === ASSET_NAME_COLUMN_KEY)?.key
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

export function findRowByIdCell(
  rows: StudioTableRow[],
  idColumnKey: string,
  idValue: string,
): StudioTableRow | null {
  const want = idValue.trim().toLowerCase()
  if (!want) return null
  for (const row of rows) {
    const cell = cellValueToString(row.values[idColumnKey]).trim().toLowerCase()
    if (cell === want) return row
  }
  return null
}

export function buildDraftFromTableRow(args: {
  tableId: string
  row: StudioTableRow
  columnToField: Map<string, PocSkillColumnMappingKey>
  idColumnKey: string
  skillIdValue: string
}): PocSkillDraft {
  const { tableId, row, columnToField, idColumnKey, skillIdValue } = args
  const fields: PocSkillDraft['fields'] = {}

  const idFromRow = cellValueToString(row.values[idColumnKey]).trim()
  const idStored = idFromRow || skillIdValue.trim()
  fields.id = { tableId, columnKey: idColumnKey, value: idStored }

  for (const [columnKey, skillKey] of columnToField) {
    if (skillKey === 'id') continue
    const value = cellValueToString(row.values[columnKey]).trim()
    if (!value) continue
    fields[skillKey] = { tableId, columnKey, value }
  }

  if (!fields.name?.value?.trim()) {
    const nameCol = [...columnToField.entries()].find(([, k]) => k === 'name')?.[0]
    const assetName = cellValueToString(row.values[ASSET_NAME_COLUMN_KEY]).trim()
    const fallback =
      (nameCol ? cellValueToString(row.values[nameCol]).trim() : '') || assetName || idStored
    fields.name = {
      tableId,
      columnKey: nameCol ?? (assetName ? ASSET_NAME_COLUMN_KEY : idColumnKey),
      value: fallback,
    }
  }

  return { draftId: crypto.randomUUID(), sourceRowId: row.id, fields }
}

export function skillFieldLabel(key: PocSkillColumnMappingKey): string {
  return POC_SKILL_MAPPING_FIELDS.find((f) => f.key === key)?.label ?? key
}

const KECO_COLUMN_ALIASES: Record<string, keyof PocSkillKecoExtraFields> = {
  type: 'skillType',
  skilltype: 'skillType',
  attachelement: 'attachElement',
  element: 'attachElement',
  attachstrength: 'attachStrength',
  strength: 'attachStrength',
  attachturns: 'attachTurns',
  attachduration: 'attachTurns',
  dotdamage: 'dotDamage',
  dotturns: 'dotTurns',
  dotduration: 'dotTurns',
  freezeturns: 'freezeTurns',
  freezeduration: 'freezeTurns',
  freeze: 'freezeTurns',
  special: 'specialEffect',
  specialeffect: 'specialEffect',
  specialtype: 'specialEffect',
  specialeffectvalue: 'specialEffectValue',
  specialvalue: 'specialEffectValue',
  specialeffectduration: 'specialEffectDuration',
  specialduration: 'specialEffectDuration',
  reactiontriggers: 'reactionTriggersJson',
  reactiontriggersjson: 'reactionTriggersJson',
  reactions: 'reactionTriggersJson',
}

function mergeKecoColumnsIntoFlat(
  flat: PocSkillFlatRow,
  row: StudioTableRow,
  columns: StudioTableColumn[],
): void {
  for (const col of columns) {
    const token = normalizeHeaderToken(col.label)
    const key = KECO_COLUMN_ALIASES[token]
    if (!key) continue
    const value = cellValueToString(row.values[col.key]).trim()
    if (value) flat[key] = value
  }
}

export function rowToFlatSkill(
  row: StudioTableRow,
  columnToField: Map<string, PocSkillColumnMappingKey>,
  idColumnKey: string,
  columns?: StudioTableColumn[],
): PocSkillFlatRow {
  const flat = emptyPocSkillFlatRow()
  const idValue = cellValueToString(row.values[idColumnKey]).trim()
  if (idValue) flat.id = idValue

  for (const [columnKey, fieldKey] of columnToField) {
    if (fieldKey === 'id') continue
    const value = cellValueToString(row.values[columnKey]).trim()
    if (!value) continue
    flat[fieldKey] = value
  }

  if (!flat.name.trim()) {
    const nameCol = [...columnToField.entries()].find(([, k]) => k === 'name')?.[0]
    const assetName = cellValueToString(row.values[ASSET_NAME_COLUMN_KEY]).trim()
    flat.name =
      (nameCol ? cellValueToString(row.values[nameCol]).trim() : '') || assetName || flat.id
  }

  if (!flat.description.trim() && flat.name.trim()) {
    flat.description = flat.name
  }

  if (columns) mergeKecoColumnsIntoFlat(flat, row, columns)

  return flat
}

export function importBattleSkillsFromTableRows(args: {
  columns: StudioTableColumn[]
  rows: StudioTableRow[]
  resolutions?: Record<string, PocSkillColumnMappingKey>
}): BattleSkillDefinition[] {
  const { columns, rows, resolutions = {} } = args
  const plan = planImportColumnMapping(columns, resolutions)
  if (plan.ambiguities.length > 0) {
    throw new Error('Column mapping has unresolved ambiguities')
  }
  const idColumnKey = detectIdColumnKey(columns) ?? ASSET_NAME_COLUMN_KEY
  const seen = new Set<string>()
  const out: BattleSkillDefinition[] = []

  const kecoSkills: import('@keco/battle-engine').Skill[] = []

  for (const row of rows) {
    const flat = rowToFlatSkill(row, plan.columnToField, idColumnKey, columns)
    if (!flat.id.trim() && !flat.name.trim()) continue
    if (!flat.id.trim()) flat.id = flat.name
    const def = flatRowToBattleSkillDefinition(flat)
    if (!def || seen.has(def.id)) continue
    seen.add(def.id)
    out.push(def)
    const keco = flatRowToKecoSkillFromRow(flat)
    if (keco) kecoSkills.push(keco)
  }

  if (kecoSkills.length > 0) {
    setKecoSkillsRecord(registerKecoSkills(kecoSkills))
  }

  return out
}
