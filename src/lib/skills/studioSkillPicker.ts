/**
 * Studio library picker helpers (virtual table id studio:{libraryId}).
 * Mirrors keco-simulation simTablePickerData for Studio-only tables.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cellToPickerOptions,
  dedupePickerOptions,
  type PickerValueOption,
} from '@/src/lib/studio/cellDisplayValue'
import {
  ASSET_NAME_COLUMN_KEY,
  getStudioLibraryAssets,
  getStudioLibrarySchema,
  listStudioLibrariesForSkillImport,
  loadStudioLibraryTableData,
  type StudioTableColumn,
  type StudioTableRow,
} from '@/src/lib/studio/studioLibraryService'

export type { PickerValueOption }

export const STUDIO_SKILL_SOURCE_TABLE_PREFIX = 'studio:'

export type SelectableStudioTable = {
  id: string
  name: string
  libraryId: string
  projectId: string
}

export function studioSkillSourceTableId(libraryId: string): string {
  return `${STUDIO_SKILL_SOURCE_TABLE_PREFIX}${libraryId}`
}

export function parseStudioSkillSourceLibraryId(tableId: string): string | null {
  if (!tableId.startsWith(STUDIO_SKILL_SOURCE_TABLE_PREFIX)) return null
  const libraryId = tableId.slice(STUDIO_SKILL_SOURCE_TABLE_PREFIX.length).trim()
  return libraryId || null
}

export async function listSelectableStudioTables(
  supabase: SupabaseClient,
  userId: string,
): Promise<SelectableStudioTable[]> {
  const libs = await listStudioLibrariesForSkillImport(supabase, userId)
  return libs.map((l) => ({
    id: studioSkillSourceTableId(l.libraryId),
    name: l.label,
    libraryId: l.libraryId,
    projectId: l.projectId,
  }))
}

export async function loadStudioTableRows(
  supabase: SupabaseClient | null,
  tableId: string,
): Promise<{ columns: StudioTableColumn[]; rows: StudioTableRow[] } | null> {
  const libraryId = parseStudioSkillSourceLibraryId(tableId)
  if (!libraryId || !supabase) return null
  return loadStudioLibraryTableData(supabase, libraryId)
}

export async function loadStudioTableColumns(
  supabase: SupabaseClient | null,
  tableId: string,
): Promise<StudioTableColumn[] | null> {
  const loaded = await loadStudioTableRows(supabase, tableId)
  return loaded?.columns ?? null
}

export async function loadStudioColumnValueOptions(
  supabase: SupabaseClient | null,
  tableId: string,
  columnKey: string,
): Promise<PickerValueOption[]> {
  const libraryId = parseStudioSkillSourceLibraryId(tableId)
  if (!libraryId || !supabase || !columnKey) return []

  const assets = await getStudioLibraryAssets(supabase, libraryId)
  const assetNameById = new Map(assets.map((a) => [a.id, a.name?.trim() || a.id]))
  const options: PickerValueOption[] = []

  if (columnKey === ASSET_NAME_COLUMN_KEY) {
    for (const a of assets) {
      if (a.name?.trim()) options.push({ value: a.name.trim(), label: a.name.trim() })
    }
    return dedupePickerOptions(options)
  }

  const properties = await getStudioLibrarySchema(supabase, libraryId)
  const fieldExists = properties.some((p) => p.key === columnKey)
  if (!fieldExists && columnKey !== ASSET_NAME_COLUMN_KEY) return []

  for (const a of assets) {
    const raw = columnKey === ASSET_NAME_COLUMN_KEY ? a.name : a.propertyValues[columnKey]
    options.push(...cellToPickerOptions(raw, assetNameById))
  }
  return dedupePickerOptions(options)
}
