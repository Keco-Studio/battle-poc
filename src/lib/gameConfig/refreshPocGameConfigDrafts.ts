import type { SupabaseClient } from '@supabase/supabase-js'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import type { StudioTableRow } from '@/src/lib/studio/studioLibraryService'
import { findRowByIdCell } from './importPocGameConfig'
import { loadStudioTableRows } from '@/src/lib/jobs/studioJobPicker'
import type { PocGameConfigDraft } from './pocGameConfigDrafts'
import { savePocGameConfigDrafts } from './pocGameConfigDrafts'

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
): Promise<{ drafts: PocGameConfigDraft[] }> {
  const rowCache = new Map<string, StudioTableRow[]>()
  const next: PocGameConfigDraft[] = []

  for (const draft of drafts) {
    const tableId = anchorTableId(draft)
    if (!tableId || !supabase) {
      next.push(draft)
      continue
    }

    let rows = rowCache.get(tableId)
    if (!rows) {
      const loaded = await loadStudioTableRows(supabase, tableId)
      rows = loaded?.rows ?? []
      rowCache.set(tableId, rows)
    }

    const idRef = draft.fields.id
    const row =
      (draft.sourceRowId ? rows.find((r) => r.id === draft.sourceRowId) : null) ??
      (idRef?.columnKey && idRef.value
        ? findRowByIdCell(rows, idRef.columnKey, idRef.value)
        : null)

    next.push(row ? applyRowToDraft(draft, row, tableId) : draft)
  }

  savePocGameConfigDrafts(next)
  return { drafts: next }
}
