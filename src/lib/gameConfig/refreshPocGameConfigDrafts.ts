import type { SupabaseClient } from '@supabase/supabase-js'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import type { StudioTableRow } from '@/src/lib/studio/studioLibraryService'
import { findRowByIdCell } from './importPocGameConfig'
import { loadStudioTableRows } from '@/src/lib/jobs/studioJobPicker'
import type { PocGameConfigDraft } from './pocGameConfigDrafts'
import { savePocGameConfigDrafts } from './pocGameConfigDrafts'
import { findDuplicateStudioRowIds } from '@/src/lib/studio/validateStudioTableImport'

type StudioTableLoader = typeof loadStudioTableRows

function anchorTableId(draft: PocGameConfigDraft): string | null {
  return draft.fields.id?.tableId?.trim() ?? null
}

function applyRowToDraft(
  draft: PocGameConfigDraft,
  row: StudioTableRow,
  tableId: string,
): PocGameConfigDraft {
  const fields = { ...draft.fields }
  for (const [key, ref] of Object.entries(fields)) {
    if (!ref || ref.tableId !== tableId || !ref.columnKey) continue
    fields[key] = { ...ref, value: cellValueToString(row.values[ref.columnKey]).trim() }
  }
  return { ...draft, sourceRowId: row.id, fields }
}

export async function refreshPocGameConfigDraftsFromLiveTables(
  supabase: SupabaseClient | null,
  drafts: PocGameConfigDraft[],
  loadTable: StudioTableLoader = loadStudioTableRows,
): Promise<{ drafts: PocGameConfigDraft[] }> {
  const rowCache = new Map<string, StudioTableRow[]>()
  const next: PocGameConfigDraft[] = []

  for (const draft of drafts) {
    const tableId = anchorTableId(draft)
    if (!tableId) {
      next.push({ ...draft, invalidReason: 'Studio source binding is missing; rebind this draft before applying.' })
      continue
    }
    if (!supabase) {
      next.push({ ...draft, invalidReason: 'Live table unavailable; sign in and rebind this draft before applying.' })
      continue
    }

    let rows = rowCache.get(tableId)
    if (!rows) {
      let loaded: { columns: unknown[]; rows: StudioTableRow[] } | null
      try {
        loaded = await loadTable(supabase, tableId)
      } catch {
        rows = []
        rowCache.set(tableId, rows)
        next.push({ ...draft, invalidReason: 'Source table unavailable; rebind this draft before applying.' })
        continue
      }
      rows = loaded?.rows ?? []
      rowCache.set(tableId, rows)
    }

    const idRef = draft.fields.id
    const duplicateIds = idRef?.columnKey
      ? findDuplicateStudioRowIds(rows, idRef.columnKey, draft.kind)
      : []
    if (duplicateIds.length > 0) {
      next.push({
        ...draft,
        invalidReason: `Source table has duplicate config id(s): ${duplicateIds.join(', ')}`,
      })
      continue
    }
    const sourceRow = draft.sourceRowId ? rows.find((r) => r.id === draft.sourceRowId) : null
    const sourceLiveId = sourceRow && idRef?.columnKey
      ? cellValueToString(sourceRow.values[idRef.columnKey]).trim()
      : ''
    const row =
      (sourceLiveId && idRef?.columnKey
        ? findRowByIdCell(rows, idRef.columnKey, sourceLiveId)
        : null) ??
      (idRef?.columnKey && idRef.value
        ? findRowByIdCell(rows, idRef.columnKey, idRef.value)
        : null)

    next.push(
      row
        ? { ...applyRowToDraft(draft, row, tableId), invalidReason: undefined }
        : { ...draft, invalidReason: 'Source table row not found; rebind this draft before applying.' },
    )
  }

  savePocGameConfigDrafts(next)
  return { drafts: next }
}
