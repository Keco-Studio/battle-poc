/**
 * Refresh simulation-format skill drafts from live Studio tables.
 * Ported from keco-simulation buildDraftsFromAttributeBindings + refreshDraftsFromLiveTables.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import {
  ASSET_NAME_COLUMN_KEY,
  type StudioTableColumn,
  type StudioTableRow,
} from '@/src/lib/studio/studioLibraryService'
import { findRowByIdCell } from './importPocSkillFromTable'
import { loadStudioTableRows } from './studioSkillPicker'
import { findDuplicateStudioRowIds } from '@/src/lib/studio/validateStudioTableImport'
import {
  SIMULATION_SKILL_MAPPING_FIELD_KEYS,
  type SimulationLocalTableCellRef,
  type SimulationSkillColumnMappingKey,
  type SimulationSkillDraft,
} from './simulationSkillDraftTypes'

export type DraftRefreshWarning = {
  draftId: string
  label: string
  warning: string
}

export type RefreshSimulationDraftsResult = {
  drafts: SimulationSkillDraft[]
  warnings: DraftRefreshWarning[]
}

type TableColumnInfo = { key: string; label: string }

type AttributeColumnBinding = {
  tableId: string
  columnKey: string
}

type AttributeColumnBindings = Partial<
  Record<SimulationSkillColumnMappingKey, AttributeColumnBinding>
>

type TableSnapshot = {
  rows: StudioTableRow[]
  columns: TableColumnInfo[]
}

function bindingFromCellRef(
  ref: SimulationLocalTableCellRef | undefined,
): AttributeColumnBinding | undefined {
  if (!ref?.tableId?.trim() || !ref.columnKey?.trim()) return undefined
  return { tableId: ref.tableId, columnKey: ref.columnKey }
}

function attributeBindingsFromDraftFields(
  fields: Partial<Record<SimulationSkillColumnMappingKey, SimulationLocalTableCellRef>>,
): AttributeColumnBindings {
  const out: AttributeColumnBindings = {}
  for (const key of SIMULATION_SKILL_MAPPING_FIELD_KEYS) {
    const binding = bindingFromCellRef(fields[key])
    if (binding) out[key] = binding
  }
  return out
}

function detectIdColumnKey(columns: TableColumnInfo[]): string | null {
  const idCol = columns.find((c) => c.key === 'id' || c.label.toLowerCase() === 'id')
  return idCol?.key ?? null
}

function resolveIdColumnKeyForTable(
  tableId: string,
  anchorIdBinding: AttributeColumnBinding,
  columns: TableColumnInfo[],
): string | null {
  if (anchorIdBinding.tableId === tableId) return anchorIdBinding.columnKey
  return detectIdColumnKey(columns)
}

function readCell(row: StudioTableRow, columnKey: string): string {
  return cellValueToString(row.values[columnKey]).trim()
}

function findRowForSkillIdInTable(args: {
  tableId: string
  skillIdValue: string
  anchorIdBinding: AttributeColumnBinding
  rows: StudioTableRow[]
  columns: TableColumnInfo[]
  preferredRowId?: string
}): StudioTableRow | null {
  const { tableId, skillIdValue, anchorIdBinding, rows, columns, preferredRowId } = args
  if (tableId === anchorIdBinding.tableId && preferredRowId) {
    const byStableId = rows.find((r) => r.id === preferredRowId)
    if (byStableId) {
      const liveId = readCell(byStableId, anchorIdBinding.columnKey)
      return findRowByIdCell(rows, anchorIdBinding.columnKey, liveId)
    }
  }
  const idColumnKey = resolveIdColumnKeyForTable(tableId, anchorIdBinding, columns)
  if (!idColumnKey) return null
  return findRowByIdCell(rows, idColumnKey, skillIdValue)
}

function resolveFieldValue(args: {
  binding: AttributeColumnBinding
  skillIdValue: string
  anchorRow: StudioTableRow
  anchorIdBinding: AttributeColumnBinding
  rowsByTable: Map<string, StudioTableRow[]>
  columnsByTable: Map<string, TableColumnInfo[]>
}): string {
  const { binding, skillIdValue, anchorRow, anchorIdBinding, rowsByTable, columnsByTable } = args

  if (binding.tableId === anchorIdBinding.tableId) {
    return readCell(anchorRow, binding.columnKey)
  }

  const rows = rowsByTable.get(binding.tableId) ?? []
  const columns = columnsByTable.get(binding.tableId) ?? []
  const row = findRowForSkillIdInTable({
    tableId: binding.tableId,
    skillIdValue,
    anchorIdBinding,
    rows,
    columns,
  })
  if (!row) return ''
  return readCell(row, binding.columnKey)
}

function refreshDraftFromLiveTables(
  draft: SimulationSkillDraft,
  rowsByTable: Map<string, StudioTableRow[]>,
  columnsByTable: Map<string, TableColumnInfo[]>,
): { draft: SimulationSkillDraft; ok: boolean } {
  const bindings = attributeBindingsFromDraftFields(draft.fields)
  const anchorIdBinding = bindings.id
  if (!anchorIdBinding) return { draft, ok: false }

  const skillIdValue = draft.fields.id?.value?.trim()
  if (!skillIdValue) return { draft, ok: false }

  const anchorRows = rowsByTable.get(anchorIdBinding.tableId) ?? []
  const anchorColumns = columnsByTable.get(anchorIdBinding.tableId) ?? []
  const anchorRow = findRowForSkillIdInTable({
    tableId: anchorIdBinding.tableId,
    skillIdValue,
    anchorIdBinding,
    rows: anchorRows,
    columns: anchorColumns,
    preferredRowId: draft.sourceRowId,
  })
  if (!anchorRow) return { draft, ok: false }

  const fields = { ...draft.fields }
  for (const key of SIMULATION_SKILL_MAPPING_FIELD_KEYS) {
    const binding = bindings[key]
    const ref = fields[key]
    if (!binding || !ref?.columnKey) continue
    const value = resolveFieldValue({
      binding,
      skillIdValue,
      anchorRow,
      anchorIdBinding,
      rowsByTable,
      columnsByTable,
    })
    fields[key] = { ...ref, value }
  }

  return {
    draft: { ...draft, sourceRowId: anchorRow.id, fields },
    ok: true,
  }
}

function draftLabel(draft: SimulationSkillDraft, index: number): string {
  return (
    draft.fields.name?.value?.trim() ||
    draft.fields.id?.value?.trim() ||
    `Skill ${index + 1}`
  )
}

function collectTableIds(draft: SimulationSkillDraft): string[] {
  const ids = new Set<string>()
  const bindings = attributeBindingsFromDraftFields(draft.fields)
  for (const binding of Object.values(bindings)) {
    if (binding?.tableId) ids.add(binding.tableId)
  }
  return [...ids]
}

export async function refreshSimulationSkillDraftsFromLiveTables(
  drafts: SimulationSkillDraft[],
  loadTable: (tableId: string) => Promise<TableSnapshot | null>,
): Promise<RefreshSimulationDraftsResult> {
  const tableCache = new Map<string, TableSnapshot>()
  const warnings: DraftRefreshWarning[] = []
  const next: SimulationSkillDraft[] = []

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!
    const anchorIdBinding = attributeBindingsFromDraftFields(draft.fields).id
    const tableIds = collectTableIds(draft)
    if (tableIds.length === 0) {
      next.push({
        ...draft,
        invalidReason: 'Studio source binding is missing; rebind this draft before syncing.',
      })
      continue
    }

    const rowsByTable = new Map<string, StudioTableRow[]>()
    const columnsByTable = new Map<string, TableColumnInfo[]>()

    for (const tableId of tableIds) {
      let snapshot = tableCache.get(tableId)
      if (snapshot === undefined) {
        try {
          snapshot = (await loadTable(tableId)) ?? { rows: [], columns: [] }
        } catch (error) {
          warnings.push({
            draftId: draft.draftId,
            label: draftLabel(draft, i),
            warning: `Source table unavailable: ${error instanceof Error ? error.message : 'load failed'}`,
          })
          next.push({ ...draft, invalidReason: 'Source table unavailable; rebind this draft before syncing.' })
          snapshot = { rows: [], columns: [] }
          tableCache.set(tableId, snapshot)
          break
        }
        tableCache.set(tableId, snapshot)
      }
      rowsByTable.set(tableId, snapshot.rows)
      columnsByTable.set(tableId, snapshot.columns)
    }
    if (next[next.length - 1]?.draftId === draft.draftId && next[next.length - 1]?.invalidReason) continue

    const tableWithoutExplicitId = tableIds.find(
      (tableId) =>
        tableId !== anchorIdBinding?.tableId &&
        !detectIdColumnKey(columnsByTable.get(tableId) ?? []),
    )
    if (tableWithoutExplicitId) {
      const invalidReason = `Cross-table source ${tableWithoutExplicitId} has no explicit id column; rebind this draft before syncing.`
      warnings.push({
        draftId: draft.draftId,
        label: draftLabel(draft, i),
        warning: invalidReason,
      })
      next.push({ ...draft, invalidReason })
      continue
    }

    const duplicateSource = tableIds
      .map((tableId) => {
        const columns = columnsByTable.get(tableId) ?? []
        const idColumnKey = resolveIdColumnKeyForTable(tableId, anchorIdBinding!, columns)
        if (!idColumnKey) return null
        const duplicateIds = findDuplicateStudioRowIds(
          rowsByTable.get(tableId) ?? [],
          idColumnKey,
          'skills',
        )
        return duplicateIds.length > 0 ? { tableId, duplicateIds } : null
      })
      .find((item) => item !== null)
    if (duplicateSource) {
      const invalidReason = `Source table ${duplicateSource.tableId} has duplicate skill id(s): ${duplicateSource.duplicateIds.join(', ')}`
      warnings.push({
        draftId: draft.draftId,
        label: draftLabel(draft, i),
        warning: invalidReason,
      })
      next.push({ ...draft, invalidReason })
      continue
    }

    const refreshed = refreshDraftFromLiveTables(draft, rowsByTable, columnsByTable)
    if (!refreshed.ok) {
      warnings.push({
        draftId: draft.draftId,
        label: draftLabel(draft, i),
        warning:
          'Source table row not found (id may have changed). Draft is disabled until rebound.',
      })
      next.push({ ...draft, invalidReason: 'Source table row not found; rebind this draft before syncing.' })
      continue
    }

    next.push({ ...refreshed.draft, invalidReason: undefined })
  }

  return { drafts: next, warnings }
}

function columnsFromStudio(cols: StudioTableColumn[]): TableColumnInfo[] {
  return cols.map((c) => ({ key: c.key, label: c.label }))
}

export async function refreshSimulationSkillDraftsWithSupabase(
  supabase: SupabaseClient | null,
  drafts: SimulationSkillDraft[],
): Promise<RefreshSimulationDraftsResult> {
  return refreshSimulationSkillDraftsFromLiveTables(drafts, async (tableId) => {
    const loaded = await loadStudioTableRows(supabase, tableId)
    if (!loaded) return null
    return { rows: loaded.rows, columns: columnsFromStudio(loaded.columns) }
  })
}

function applyNameFallback(
  fields: Partial<Record<SimulationSkillColumnMappingKey, SimulationLocalTableCellRef>>,
  anchorRow: StudioTableRow,
  anchorIdBinding: AttributeColumnBinding,
): void {
  if (fields.name?.value?.trim()) return

  const nameBinding = bindingFromCellRef(fields.name)
  const idValue = fields.id?.value?.trim() ?? ''
  const assetName = readCell(anchorRow, ASSET_NAME_COLUMN_KEY)
  const fallback =
    (nameBinding ? readCell(anchorRow, nameBinding.columnKey) : '') || assetName || idValue
  if (!fallback) return

  fields.name = {
    tableId: nameBinding?.tableId ?? anchorIdBinding.tableId,
    columnKey: nameBinding?.columnKey ?? ASSET_NAME_COLUMN_KEY,
    value: fallback,
  }
}

export { applyNameFallback, readCell, ASSET_NAME_COLUMN_KEY }
