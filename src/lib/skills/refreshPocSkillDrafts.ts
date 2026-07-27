/**
 * Re-read skill draft field values from live Studio table rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import type { StudioTableRow } from '@/src/lib/studio/studioLibraryService'
import {
  POC_SKILL_MAPPING_FIELDS,
  type PocSkillColumnMappingKey,
} from './pocSkillFieldMapping'
import type { PocSkillDraft, SkillDraftValidationResult } from './pocSkillDrafts'
import { savePocSkillDrafts, validatePocSkillDrafts } from './pocSkillDrafts'
import { findRowByIdCell } from './importPocSkillFromTable'
import { loadStudioTableRows } from './studioSkillPicker'
import type { PocSkillKecoExtraFields } from './pocSkillFieldMapping'
import { findDuplicateStudioRowIds } from '@/src/lib/studio/validateStudioTableImport'

export type DraftRefreshWarning = {
  draftId: string
  label: string
  warning: string
}

export type RefreshDraftsFromLiveTablesResult = {
  drafts: PocSkillDraft[]
  warnings: DraftRefreshWarning[]
}

function draftLabel(draft: PocSkillDraft, index: number): string {
  return (
    draft.fields.name?.value?.trim() ||
    draft.fields.id?.value?.trim() ||
    `Skill ${index + 1}`
  )
}

function anchorTableId(draft: PocSkillDraft): string | null {
  const idTable = draft.fields.id?.tableId?.trim()
  if (idTable) return idTable
  for (const f of POC_SKILL_MAPPING_FIELDS) {
    const tid = draft.fields[f.key]?.tableId?.trim()
    if (tid) return tid
  }
  return null
}

function findRowForDraft(draft: PocSkillDraft, rows: StudioTableRow[]): StudioTableRow | null {
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
  draft: PocSkillDraft,
  row: StudioTableRow,
  tableId: string,
): PocSkillDraft {
  const fields = { ...draft.fields }
  for (const f of POC_SKILL_MAPPING_FIELDS) {
    const ref = fields[f.key]
    if (!ref || ref.tableId !== tableId || !ref.columnKey) continue
    const live = cellValueToString(row.values[ref.columnKey]).trim()
    fields[f.key] = { ...ref, value: live }
  }
  const extraKeys: Array<keyof PocSkillKecoExtraFields> = [
    'skillType', 'attachElement', 'attachStrength', 'attachTurns', 'dotDamage', 'dotTurns',
    'freezeTurns', 'specialEffect', 'specialEffectValue', 'specialEffectDuration', 'reactionTriggersJson',
  ]
  for (const key of extraKeys) {
    const ref = fields[key]
    if (!ref || ref.tableId !== tableId || !ref.columnKey) continue
    fields[key] = { ...ref, value: cellValueToString(row.values[ref.columnKey]).trim() }
  }
  return { ...draft, sourceRowId: row.id, fields }
}

export async function refreshPocSkillDraftsFromLiveTables(
  drafts: PocSkillDraft[],
  loadRows: (tableId: string) => Promise<StudioTableRow[] | null>,
): Promise<RefreshDraftsFromLiveTablesResult> {
  const rowCache = new Map<string, StudioTableRow[]>()
  const warnings: DraftRefreshWarning[] = []
  const next: PocSkillDraft[] = []

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!
    const tableId = anchorTableId(draft)
    if (!tableId) {
      next.push({ ...draft, invalidReason: 'Studio source binding is missing; rebind this draft before applying.' })
      continue
    }

    let rows = rowCache.get(tableId)
    if (rows === undefined) {
      try {
        rows = (await loadRows(tableId)) ?? []
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
      rowCache.set(tableId, rows)
    }

    const idColumnKey = draft.fields.id?.columnKey
    const duplicateIds = idColumnKey
      ? findDuplicateStudioRowIds(rows, idColumnKey, 'skills')
      : []
    if (duplicateIds.length > 0) {
      const invalidReason = `Source table has duplicate skill id(s): ${duplicateIds.join(', ')}`
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
        warning: 'Source table row not found (id may have changed). Draft is disabled until rebound.',
      })
      next.push({ ...draft, invalidReason: 'Source table row not found; rebind this draft before applying.' })
      continue
    }

    next.push({ ...applyRowToDraft(draft, row, tableId), invalidReason: undefined })
  }

  return { drafts: next, warnings }
}

export async function refreshPocSkillDraftsWithSupabase(
  supabase: SupabaseClient | null,
  drafts: PocSkillDraft[],
): Promise<RefreshDraftsFromLiveTablesResult> {
  return refreshPocSkillDraftsFromLiveTables(drafts, async (tableId) => {
    const loaded = await loadStudioTableRows(supabase, tableId)
    return loaded?.rows ?? null
  })
}

export type ValidatePocSkillDraftsFromLiveResult = SkillDraftValidationResult & {
  refreshedDrafts: PocSkillDraft[]
  warnings: DraftRefreshWarning[]
}

export async function validatePocSkillDraftsFromLiveTables(
  supabase: SupabaseClient | null,
  drafts: PocSkillDraft[],
): Promise<ValidatePocSkillDraftsFromLiveResult> {
  const { drafts: refreshed, warnings } = await refreshPocSkillDraftsWithSupabase(
    supabase,
    drafts,
  )
  savePocSkillDrafts(refreshed)
  const result = validatePocSkillDrafts(refreshed)
  return { ...result, refreshedDrafts: refreshed, warnings }
}
