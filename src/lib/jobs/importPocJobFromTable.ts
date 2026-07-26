import {
  emptyPocJobFlatRow,
  flatRowToJobClassConfig,
  normalizeHeaderToken,
  POC_JOB_MAPPING_FIELDS,
  type PocJobColumnMappingKey,
  type PocJobFlatRow,
} from './pocJobFieldMapping'
import type { PocJobDraft } from './pocJobDrafts'
import type { JobClassConfig } from './jobConfigTypes'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import {
  ASSET_NAME_COLUMN_KEY,
  type StudioTableColumn,
  type StudioTableRow,
} from '@/src/lib/studio/studioLibraryService'

const HEADER_JOB_CANDIDATES: Record<string, PocJobColumnMappingKey[]> = {
  id: ['id'],
  classid: ['id'],
  jobid: ['id'],
  name: ['name'],
  displayname: ['name'],
  classname: ['name'],
  description: ['description'],
  desc: ['description'],
  preferredrange: ['preferredRange'],
  range: ['preferredRange'],
  preferred_range: ['preferredRange'],
  hp: ['hp'],
  basehp: ['hp'],
  atk: ['atk'],
  baseatk: ['atk'],
  def: ['def'],
  basedef: ['def'],
  spd: ['spd'],
  basespd: ['spd'],
  speed: ['spd'],
  growthhp: ['growthHp'],
  hpgrowth: ['growthHp'],
  growthatk: ['growthAtk'],
  atkgrowth: ['growthAtk'],
  growthdef: ['growthDef'],
  defgrowth: ['growthDef'],
  growthspd: ['growthSpd'],
  spdgrowth: ['growthSpd'],
  hpmult: ['hpMult'],
  hpmultiplier: ['hpMult'],
  hp_multiplier: ['hpMult'],
}

export type ImportHeaderAmbiguity = {
  kind: 'header'
  columnKey: string
  columnLabel: string
  candidates: PocJobColumnMappingKey[]
}

export type ImportColumnCollision = {
  kind: 'columnCollision'
  jobKey: PocJobColumnMappingKey
  columns: { columnKey: string; columnLabel: string }[]
}

export type ImportAmbiguity = ImportHeaderAmbiguity | ImportColumnCollision

export type ImportColumnMappingPlan = {
  columnToField: Map<string, PocJobColumnMappingKey>
  ambiguities: ImportAmbiguity[]
  unmappedColumnKeys: string[]
}

function jobKeysForHeaderToken(token: string): PocJobColumnMappingKey[] {
  const norm = normalizeHeaderToken(token)
  if (!norm) return []
  return HEADER_JOB_CANDIDATES[norm] ?? []
}

function candidatesForColumn(col: StudioTableColumn): PocJobColumnMappingKey[] {
  if (col.key === ASSET_NAME_COLUMN_KEY) return []
  const fromLabel = jobKeysForHeaderToken(col.label)
  const fromKey = jobKeysForHeaderToken(col.key)
  return [...new Set([...fromLabel, ...fromKey])]
}

export function planImportColumnMapping(
  columns: StudioTableColumn[],
  resolutions: Record<string, PocJobColumnMappingKey> = {},
): ImportColumnMappingPlan {
  const columnToField = new Map<string, PocJobColumnMappingKey>()
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

  const byJob = new Map<PocJobColumnMappingKey, { columnKey: string; columnLabel: string }[]>()
  for (const col of columns) {
    const jobKey = columnToField.get(col.key)
    if (!jobKey) continue
    const list = byJob.get(jobKey) ?? []
    list.push({ columnKey: col.key, columnLabel: col.label })
    byJob.set(jobKey, list)
  }

  for (const [jobKey, cols] of byJob) {
    if (cols.length <= 1) continue
    const resolved = cols.find((c) => resolutions[c.columnKey] === jobKey)
    if (resolved) {
      for (const c of cols) {
        if (c.columnKey !== resolved.columnKey) columnToField.delete(c.columnKey)
      }
      columnToField.set(resolved.columnKey, jobKey)
      continue
    }
    ambiguities.push({ kind: 'columnCollision', jobKey, columns: cols })
  }

  return { columnToField, ambiguities, unmappedColumnKeys }
}

export function detectIdColumnKey(columns: StudioTableColumn[]): string | undefined {
  const hit = columns.find((c) => {
    const nLabel = normalizeHeaderToken(c.label)
    const nKey = normalizeHeaderToken(c.key)
    return nLabel === 'id' || nKey === 'id' || nLabel === 'classid' || nKey === 'jobid'
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
  columnToField: Map<string, PocJobColumnMappingKey>
  idColumnKey: string
  jobIdValue: string
}): PocJobDraft {
  const { tableId, row, columnToField, idColumnKey, jobIdValue } = args
  const fields: PocJobDraft['fields'] = {}

  const idFromRow = cellValueToString(row.values[idColumnKey]).trim()
  const idStored = idFromRow || jobIdValue.trim()
  fields.id = { tableId, columnKey: idColumnKey, value: idStored }

  for (const [columnKey, jobKey] of columnToField) {
    if (jobKey === 'id') continue
    const value = cellValueToString(row.values[columnKey]).trim()
    if (!value) continue
    fields[jobKey] = { tableId, columnKey, value }
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

export function jobFieldLabel(key: PocJobColumnMappingKey): string {
  return POC_JOB_MAPPING_FIELDS.find((f) => f.key === key)?.label ?? key
}

export function rowToFlatJob(
  row: StudioTableRow,
  columnToField: Map<string, PocJobColumnMappingKey>,
  idColumnKey: string,
): PocJobFlatRow {
  const flat = emptyPocJobFlatRow()
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

  return flat
}

export function importBattleJobsFromTableRows(args: {
  columns: StudioTableColumn[]
  rows: StudioTableRow[]
  resolutions?: Record<string, PocJobColumnMappingKey>
}): JobClassConfig[] {
  const { columns, rows, resolutions = {} } = args
  const plan = planImportColumnMapping(columns, resolutions)
  if (plan.ambiguities.length > 0) {
    throw new Error('Column mapping has unresolved ambiguities')
  }
  const idColumnKey = detectIdColumnKey(columns) ?? ASSET_NAME_COLUMN_KEY
  const seen = new Set<string>()
  const out: JobClassConfig[] = []

  for (const row of rows) {
    const flat = rowToFlatJob(row, plan.columnToField, idColumnKey)
    if (!flat.id.trim() && !flat.name.trim()) continue
    const def = flatRowToJobClassConfig(flat)
    if (!def || seen.has(def.id)) continue
    seen.add(def.id)
    out.push(def)
  }

  return out
}
