import type { SupabaseClient } from '@supabase/supabase-js'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import type { StudioTableRow } from '@/src/lib/studio/studioLibraryService'
import {
  POC_JOB_MAPPING_FIELDS,
  type PocJobColumnMappingKey,
} from './pocJobFieldMapping'
import type { PocJobDraft, JobDraftValidationResult } from './pocJobDrafts'
import { savePocJobDrafts, validatePocJobDrafts } from './pocJobDrafts'
import { findRowByIdCell } from './importPocJobFromTable'
import { loadStudioTableRows } from './studioJobPicker'
import { findDuplicateStudioRowIds } from '@/src/lib/studio/validateStudioTableImport'

export type DraftRefreshWarning = {
  draftId: string
  label: string
  warning: string
}

export type RefreshDraftsFromLiveTablesResult = {
  drafts: PocJobDraft[]
  warnings: DraftRefreshWarning[]
}

function draftLabel(draft: PocJobDraft, index: number): string {
  return (
    draft.fields.name?.value?.trim() ||
    draft.fields.id?.value?.trim() ||
    `Class ${index + 1}`
  )
}

function anchorTableId(draft: PocJobDraft): string | null {
  const idTable = draft.fields.id?.tableId?.trim()
  if (idTable) return idTable
  for (const f of POC_JOB_MAPPING_FIELDS) {
    const tid = draft.fields[f.key]?.tableId?.trim()
    if (tid) return tid
  }
  return null
}

function findRowForDraft(draft: PocJobDraft, rows: StudioTableRow[]): StudioTableRow | null {
  if (draft.sourceRowId) {
    const byId = rows.find((r) => r.id === draft.sourceRowId)
    const idRef = draft.fields.id
    if (byId && idRef?.columnKey) {
      const liveId = cellValueToString(byId.values[idRef.columnKey]).trim()
      return findRowByIdCell(rows, idRef.columnKey, liveId)
    }
  }
  const idRef = draft.fields.id
  if (!idRef?.columnKey || !idRef.value?.trim()) return null
  return findRowByIdCell(rows, idRef.columnKey, idRef.value)
}

function applyRowToDraft(
  draft: PocJobDraft,
  row: StudioTableRow,
  tableId: string,
): PocJobDraft {
  const fields = { ...draft.fields }
  for (const f of POC_JOB_MAPPING_FIELDS) {
    const ref = fields[f.key]
    if (!ref || ref.tableId !== tableId || !ref.columnKey) continue
    const live = cellValueToString(row.values[ref.columnKey]).trim()
    fields[f.key] = { ...ref, value: live }
  }
  return { ...draft, sourceRowId: row.id, fields }
}

export async function refreshPocJobDraftsFromLiveTables(
  drafts: PocJobDraft[],
  loadRows: (tableId: string) => Promise<StudioTableRow[] | null>,
): Promise<RefreshDraftsFromLiveTablesResult> {
  const rowCache = new Map<string, StudioTableRow[]>()
  const warnings: DraftRefreshWarning[] = []
  const next: PocJobDraft[] = []

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!
    const tableId = anchorTableId(draft)
    if (!tableId) {
      next.push({ ...draft, invalidReason: 'Studio source binding is missing; rebind this draft before applying.' })
      continue
    }

    let rows = rowCache.get(tableId)
    if (!rows) {
      let loaded: StudioTableRow[] | null
      try {
        loaded = await loadRows(tableId)
      } catch (error) {
        warnings.push({
          draftId: draft.draftId,
          label: draftLabel(draft, i),
          warning: `Source table unavailable: ${error instanceof Error ? error.message : 'load failed'}`,
        })
        next.push({ ...draft, invalidReason: 'Source table unavailable; rebind this draft before applying.' })
        rowCache.set(tableId, [])
        continue
      }
      rows = loaded ?? []
      rowCache.set(tableId, rows)
    }

    const idColumnKey = draft.fields.id?.columnKey
    const duplicateIds = idColumnKey
      ? findDuplicateStudioRowIds(rows, idColumnKey, 'job_classes')
      : []
    if (duplicateIds.length > 0) {
      const invalidReason = `Source table has duplicate class id(s): ${duplicateIds.join(', ')}`
      warnings.push({
        draftId: draft.draftId,
        label: draftLabel(draft, i),
        warning: invalidReason,
      })
      next.push({ ...draft, invalidReason })
      continue
    }

    const row = findRowForDraft(draft, rows)
    if (!row) {
      warnings.push({
        draftId: draft.draftId,
        label: draftLabel(draft, i),
        warning: 'Source row not found in live table; draft is disabled until rebound',
      })
      next.push({ ...draft, invalidReason: 'Source row not found; rebind this draft before applying.' })
      continue
    }

    next.push({ ...applyRowToDraft(draft, row, tableId), invalidReason: undefined })
  }

  return { drafts: next, warnings }
}

export async function validatePocJobDraftsFromLiveTables(
  supabase: SupabaseClient | null,
  drafts: PocJobDraft[],
): Promise<JobDraftValidationResult & { warnings: DraftRefreshWarning[] }> {
  if (drafts.length === 0) {
    return { ok: false, configs: [], draftErrors: [], warnings: [] }
  }

  const loadRows = async (tableId: string) => {
    const res = await loadStudioTableRows(supabase, tableId)
    return res?.rows ?? null
  }

  const refreshed = await refreshPocJobDraftsFromLiveTables(drafts, loadRows)
  savePocJobDrafts(refreshed.drafts)
  const validated = validatePocJobDrafts(refreshed.drafts)
  return { ...validated, warnings: refreshed.warnings }
}
