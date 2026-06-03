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
    if (byId) return byId
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
      next.push(draft)
      continue
    }

    let rows = rowCache.get(tableId)
    if (!rows) {
      const loaded = await loadRows(tableId)
      rows = loaded ?? []
      rowCache.set(tableId, rows)
    }

    const row = findRowForDraft(draft, rows)
    if (!row) {
      warnings.push({
        draftId: draft.draftId,
        label: draftLabel(draft, i),
        warning: 'Source row not found in live table',
      })
      next.push(draft)
      continue
    }

    next.push(applyRowToDraft(draft, row, tableId))
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
