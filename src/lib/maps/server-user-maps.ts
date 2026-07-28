import type { UserMapRow } from '@/src/lib/db/types'
import { validateMapProject, type MapProject } from '@/src/lib/maps/map-project'
import { formatUserMapRef, type UserMapRef } from '@/src/lib/maps/map-reference'

export const USER_MAP_ASSET_BUCKET = 'battle-user-map-assets'

type QueryError = { message: string }

type ServerMapClient = {
  // Supabase's fluent query types are intentionally hidden behind this route-only boundary.
  from(table: string): any
  storage?: {
    from(bucket: string): {
      remove?(paths: string[]): Promise<{ error: QueryError | null }>
      createSignedUrl?(path: string, expiresIn: number): Promise<{
        data: { signedUrl: string } | null
        error: QueryError | null
      }>
      upload?(
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ): Promise<{ data: { path: string } | null; error: QueryError | null }>
    }
  }
}

export type UserMapServiceError = {
  ok: false
  status: 400 | 404 | 500
  error: string
}

export type UserMapServiceResult<T> = { ok: true } & T | UserMapServiceError

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name.length >= 1 && name.length <= 80 ? name : null
}

function databaseError(error: QueryError): UserMapServiceError {
  return { ok: false, status: 500, error: error.message }
}

export async function listUserMaps(
  client: ServerMapClient,
  ownerId: string,
): Promise<UserMapServiceResult<{ maps: UserMapRow[] }>> {
  const { data, error } = await client
    .from('user_maps')
    .select('id, owner_id, name, map_data, background_object_path, created_at, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })

  if (error) return databaseError(error)
  return { ok: true, maps: (data ?? []) as UserMapRow[] }
}

export async function getUserMap(
  client: ServerMapClient,
  ownerId: string,
  mapId: string,
): Promise<UserMapServiceResult<{ map: UserMapRow }>> {
  const { data, error } = await client
    .from('user_maps')
    .select('id, owner_id, name, map_data, background_object_path, created_at, updated_at')
    .eq('id', mapId)
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (error) return databaseError(error)
  if (!data) return { ok: false, status: 404, error: 'map_not_found' }
  return { ok: true, map: data as UserMapRow }
}

export async function createUserMap(
  client: ServerMapClient,
  ownerId: string,
  input: { name: unknown; mapData: unknown; backgroundObjectPath?: string | null },
): Promise<UserMapServiceResult<{ map: UserMapRow }>> {
  const name = normalizeName(input.name)
  if (!name) return { ok: false, status: 400, error: 'map name must contain 1 to 80 characters' }

  const validated = validateMapProject(input.mapData)
  if (!validated.ok) return { ok: false, status: 400, error: validated.error }

  const { data, error } = await client
    .from('user_maps')
    .insert({
      owner_id: ownerId,
      name,
      map_data: validated.value,
      background_object_path: input.backgroundObjectPath ?? null,
    })
    .select('id, owner_id, name, map_data, background_object_path, created_at, updated_at')
    .single()

  if (error) return databaseError(error)
  return { ok: true, map: data as UserMapRow }
}

export async function updateUserMap(
  client: ServerMapClient,
  ownerId: string,
  mapId: string,
  input: { name?: unknown; mapData?: unknown; backgroundObjectPath?: string | null },
): Promise<UserMapServiceResult<{ map: UserMapRow }>> {
  const update: {
    name?: string
    map_data?: MapProject
    background_object_path?: string | null
  } = {}

  if (input.name !== undefined) {
    const name = normalizeName(input.name)
    if (!name) return { ok: false, status: 400, error: 'map name must contain 1 to 80 characters' }
    update.name = name
  }
  if (input.mapData !== undefined) {
    const validated = validateMapProject(input.mapData)
    if (!validated.ok) return { ok: false, status: 400, error: validated.error }
    update.map_data = validated.value
  }
  if (input.backgroundObjectPath !== undefined) {
    update.background_object_path = input.backgroundObjectPath
  }
  if (Object.keys(update).length === 0) {
    return { ok: false, status: 400, error: 'no map fields to update' }
  }

  const { data, error } = await client
    .from('user_maps')
    .update(update)
    .eq('id', mapId)
    .eq('owner_id', ownerId)
    .select('id, owner_id, name, map_data, background_object_path, created_at, updated_at')
    .maybeSingle()

  if (error) return databaseError(error)
  if (!data) return { ok: false, status: 404, error: 'map_not_found' }
  return { ok: true, map: data as UserMapRow }
}

export async function deleteUserMap(
  client: ServerMapClient,
  ownerId: string,
  mapId: string,
): Promise<{ ok: true } | UserMapServiceError> {
  const { data, error } = await client
    .from('user_maps')
    .delete()
    .eq('id', mapId)
    .eq('owner_id', ownerId)
    .select('background_object_path')
    .maybeSingle()

  if (error) return databaseError(error)
  if (!data) return { ok: false, status: 404, error: 'map_not_found' }

  const objectPath = data.background_object_path
  if (typeof objectPath === 'string' && objectPath.startsWith(`${ownerId}/`)) {
    const storage = client.storage
    if (!storage) return { ok: false, status: 500, error: 'storage_not_available' }
    const bucket = storage.from(USER_MAP_ASSET_BUCKET)
    const remove = bucket.remove
    if (!remove) return { ok: false, status: 500, error: 'storage_not_available' }
    const { error: storageError } = await remove.call(bucket, [objectPath])
    if (storageError) return databaseError(storageError)
  }

  return { ok: true }
}

export async function signUserMapBackground(
  client: ServerMapClient,
  ownerId: string,
  objectPath: string | null,
): Promise<UserMapServiceResult<{ url: string | null }>> {
  if (objectPath === null) return { ok: true, url: null }
  if (!objectPath.startsWith(`${ownerId}/`)) {
    return { ok: false, status: 404, error: 'map_asset_not_found' }
  }

  const bucket = client.storage?.from(USER_MAP_ASSET_BUCKET)
  if (!bucket?.createSignedUrl) return { ok: false, status: 500, error: 'storage_not_available' }

  const { data, error } = await bucket.createSignedUrl(objectPath, 3600)
  if (error) return databaseError(error)
  if (!data?.signedUrl) return { ok: false, status: 404, error: 'map_asset_not_found' }
  return { ok: true, url: data.signedUrl }
}

export async function persistUserMapWithBackground(
  client: ServerMapClient,
  ownerId: string,
  input: { name: unknown; mapData: unknown; png: Uint8Array },
): Promise<UserMapServiceResult<{
  map: UserMapRow
  mapRef: UserMapRef
  objectPath: string
  previewUrl: string
}>> {
  const created = await createUserMap(client, ownerId, {
    name: input.name,
    mapData: input.mapData,
  })
  if (!created.ok) return created

  const objectPath = `${ownerId}/${created.map.id}/background.png`
  const bucket = client.storage?.from(USER_MAP_ASSET_BUCKET)
  if (!bucket?.upload) {
    await deleteUserMap(client, ownerId, created.map.id)
    return { ok: false, status: 500, error: 'storage_not_available' }
  }

  const uploaded = await bucket.upload(objectPath, input.png, {
    contentType: 'image/png',
    upsert: false,
  })
  if (uploaded.error) {
    await deleteUserMap(client, ownerId, created.map.id)
    return databaseError(uploaded.error)
  }

  const updated = await updateUserMap(client, ownerId, created.map.id, {
    backgroundObjectPath: objectPath,
  })
  if (!updated.ok) {
    await bucket.remove?.([objectPath])
    await deleteUserMap(client, ownerId, created.map.id)
    return updated
  }

  const signed = await signUserMapBackground(client, ownerId, objectPath)
  if (!signed.ok || !signed.url) {
    await deleteUserMap(client, ownerId, created.map.id)
    return signed.ok
      ? { ok: false, status: 500, error: 'failed_to_sign_map_asset' }
      : signed
  }

  return {
    ok: true,
    map: updated.map,
    mapRef: formatUserMapRef(updated.map.id),
    objectPath,
    previewUrl: signed.url,
  }
}
