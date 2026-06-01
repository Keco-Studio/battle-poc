import type { SupabaseClient } from '@supabase/supabase-js'
import { cellToPickerOptions } from './cellDisplayValue'

export type StudioProject = {
  id: string
  name: string
}

export type StudioLibrary = {
  id: string
  project_id: string
  name: string
}

export type StudioProperty = {
  id: string
  key: string
  name: string
}

export type StudioAssetRow = {
  id: string
  name: string
  propertyValues: Record<string, unknown>
}

export type StudioTableRow = {
  id: string
  values: Record<string, string>
}

export type StudioTableColumn = {
  key: string
  label: string
}

export const ASSET_NAME_COLUMN_KEY = '__asset_name__'

function normalizeValue(input: unknown): unknown {
  if (input === null || input === undefined) return null
  let value = input
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      value = JSON.parse(value)
    } catch {
      // keep plain string
    }
  }
  return value
}

export async function listStudioProjects(
  supabase: SupabaseClient,
  userId: string,
): Promise<StudioProject[]> {
  const { data: collaboratorRecords, error: collaboratorError } = await supabase
    .from('project_collaborators')
    .select('project_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)

  if (collaboratorError) throw collaboratorError
  if (!collaboratorRecords?.length) return []

  const projectIds = collaboratorRecords.map((r) => r.project_id)
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name')
    .in('id', projectIds)
    .order('created_at', { ascending: true })

  if (projectsError) throw projectsError
  return (projects ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id }))
}

export async function listStudioLibraries(
  supabase: SupabaseClient,
  projectId: string,
): Promise<StudioLibrary[]> {
  const { data, error } = await supabase
    .from('libraries')
    .select('id, project_id, name')
    .eq('project_id', projectId)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((l) => ({
    id: l.id,
    project_id: l.project_id,
    name: l.name ?? l.id,
  }))
}

export async function listStudioLibrariesForSkillImport(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<{ projectId: string; libraryId: string; label: string }>> {
  const projects = await listStudioProjects(supabase, userId)
  const pairs: Array<{ projectId: string; libraryId: string; label: string }> = []
  for (const p of projects) {
    const libs = await listStudioLibraries(supabase, p.id)
    for (const lib of libs) {
      pairs.push({
        projectId: p.id,
        libraryId: lib.id,
        label: `${p.name || p.id} / ${lib.name || lib.id}`,
      })
    }
  }
  pairs.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  return pairs
}

export async function getStudioLibrarySchema(
  supabase: SupabaseClient,
  libraryId: string,
): Promise<StudioProperty[]> {
  const { data, error } = await supabase
    .from('library_field_definitions')
    .select('id, label, order_index, section')
    .eq('library_id', libraryId)
    .order('section', { ascending: true })
    .order('order_index', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.id,
    name: row.label ?? row.id,
  }))
}

export async function getStudioLibraryAssets(
  supabase: SupabaseClient,
  libraryId: string,
): Promise<StudioAssetRow[]> {
  const { data: assetData, error: assetError } = await supabase
    .from('library_assets')
    .select('id, name, row_index')
    .eq('library_id', libraryId)
    .order('row_index', { ascending: true })
    .order('id', { ascending: true })

  if (assetError) throw assetError
  const assets = assetData ?? []
  if (assets.length === 0) return []

  const assetIds = assets.map((a) => a.id)
  const { data: valueData, error: valueError } = await supabase
    .from('library_asset_values')
    .select('asset_id, field_id, value_json')
    .in('asset_id', assetIds)

  if (valueError) throw valueError

  const rowsByAssetId = new Map<string, StudioAssetRow>()
  for (const asset of assets) {
    rowsByAssetId.set(asset.id, {
      id: asset.id,
      name: asset.name ?? '',
      propertyValues: {},
    })
  }

  for (const value of valueData ?? []) {
    const row = rowsByAssetId.get(value.asset_id)
    if (!row) continue
    row.propertyValues[value.field_id] = normalizeValue(value.value_json)
  }

  return Array.from(rowsByAssetId.values())
}

export async function loadStudioLibraryTableData(
  supabase: SupabaseClient,
  libraryId: string,
): Promise<{ columns: StudioTableColumn[]; rows: StudioTableRow[] }> {
  const properties = await getStudioLibrarySchema(supabase, libraryId)
  const assets = await getStudioLibraryAssets(supabase, libraryId)
  const columns: StudioTableColumn[] = [
    { key: ASSET_NAME_COLUMN_KEY, label: 'Name' },
    ...properties.map((p) => ({ key: p.key, label: p.name.trim() || p.key })),
  ]
  const assetNameById = new Map(assets.map((a) => [a.id, a.name.trim() || a.id]))
  const rows: StudioTableRow[] = assets.map((a) => {
    const values: Record<string, string> = {
      [ASSET_NAME_COLUMN_KEY]: a.name ?? '',
    }
    for (const p of properties) {
      const opts = cellToPickerOptions(a.propertyValues[p.key], assetNameById)
      values[p.key] = opts[0]?.value ?? ''
    }
    return { id: a.id, values }
  })
  return { columns, rows }
}
