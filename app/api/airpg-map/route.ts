import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

import type { MapCharacterVisualId } from '@/app/constants'
import { requireServerUser } from '@/src/lib/auth/require-server-user'
import { validateMapProject, type MapProject } from '@/src/lib/maps/map-project'
import { DEFAULT_BUILTIN_MAP_REF, parseMapRef } from '@/src/lib/maps/map-reference'
import { getUserMap, signUserMapBackground } from '@/src/lib/maps/server-user-maps'
import { createServerSupabase } from '@/src/lib/supabase/server'
import { LOCAL_WEB_MODE } from '@/src/lib/runtime/localWebMode'
import { localModeUnavailable } from '@/src/lib/runtime/localModeResponse'
import { getVs01MapProject } from '@/src/content/generated/vs01/maps'

const LOCAL_MAPS_DIR = path.join(process.cwd(), 'data', 'maps')

type AirpgMapEntity = {
  instanceId: string
  entityDefId: string
  position: { x: number; y: number }
  overrides?: { visualId?: string | null }
}

type EntityDefLike = {
  name?: string
  templateId?: string
  level?: number
  skillIds?: string[]
  visualId?: string
  sprite?: { tilesetId?: string; tileIndex?: number }
  battleProfile?: { maxHp?: number; atk?: number; def?: number; spd?: number }
}

type TilesetLike = {
  id: string
  imagePath: string
  tileWidth: number
  tileHeight: number
  tileCount: number
  columns: number
}

type LoadableMapProject = MapProject & {
  tilesets?: Record<string, TilesetLike>
  entityDefs?: Record<string, EntityDefLike>
}

function resolveNpcMapRender(def: EntityDefLike | undefined, entity: AirpgMapEntity): {
  visualId?: MapCharacterVisualId | null
  mapSpriteTileIndex?: number
} {
  if (!def) return {}
  const rawOverride = entity.overrides && Object.prototype.hasOwnProperty.call(entity.overrides, 'visualId')
    ? entity.overrides.visualId
    : undefined
  const effectiveVisual = rawOverride === null
    ? undefined
    : rawOverride ?? def.visualId

  if (effectiveVisual === 'warriorBlue' || effectiveVisual === 'archerGreen') {
    return { visualId: effectiveVisual === 'archerGreen' ? 'warriorBlue' : effectiveVisual }
  }
  if (typeof effectiveVisual === 'string' && effectiveVisual.startsWith('pixellab:')) {
    return { visualId: effectiveVisual as MapCharacterVisualId }
  }
  const tileIndex = typeof def.sprite?.tileIndex === 'number' ? def.sprite.tileIndex : 0
  return tileIndex > 0 ? { mapSpriteTileIndex: tileIndex } : {}
}

async function resolveUsableTilesetPath(imagePath: string | undefined): Promise<string | null> {
  const candidates = [
    imagePath,
    'maps/tilesets/dungeon-tileset.png',
    'maps/tilesets/sprite.png',
    'assets/tilesets/dungeon-tileset.png',
    'assets/tilesets/sprite.png',
  ].filter((value): value is string => Boolean(value?.trim()))

  for (const candidate of candidates) {
    const normalized = candidate.startsWith('/') ? candidate.slice(1) : candidate
    try {
      await access(path.join(process.cwd(), 'public', normalized))
      return `/${normalized}`
    } catch {
      // Continue through the built-in fallback assets.
    }
  }
  return null
}

async function loadProject(mapRef: string): Promise<
  | { ok: true; project: LoadableMapProject; backgroundUrl: string | null }
  | { ok: false; status: number; error: string }
> {
  const parsed = parseMapRef(mapRef)
  if (!parsed) return { ok: false, status: 400, error: 'invalid_map_ref' }

  let rawProject: unknown
  let backgroundUrl: string | null = null
  if (parsed.source === 'builtin') {
    rawProject = getVs01MapProject(parsed.id)
    if (!rawProject) {
      try {
        const raw = await readFile(path.join(LOCAL_MAPS_DIR, `${parsed.id}.json`), 'utf8')
        rawProject = JSON.parse(raw)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        return {
          ok: false,
          status: code === 'ENOENT' ? 404 : 500,
          error: code === 'ENOENT' ? 'map_not_found' : 'failed_to_load_builtin_map',
        }
      }
    }
  } else {
    const supabase = await createServerSupabase()
    const auth = await requireServerUser(supabase)
    if (!auth.ok) {
      return { ok: false, status: auth.status, error: auth.error }
    }
    if (!supabase) return { ok: false, status: 503, error: 'supabase_not_configured' }
    const result = await getUserMap(supabase, auth.user.id, parsed.id)
    if (!result.ok) return result
    rawProject = result.map.map_data

    const signed = await signUserMapBackground(
      supabase,
      auth.user.id,
      result.map.background_object_path,
    )
    if (!signed.ok) return signed
    backgroundUrl = signed.url
  }

  const validated = validateMapProject(rawProject)
  if (!validated.ok) return { ok: false, status: 500, error: validated.error }
  return {
    ok: true,
    project: validated.value as LoadableMapProject,
    backgroundUrl,
  }
}

export async function GET(request: Request) {
  const requestedMap = new URL(request.url).searchParams.get('map') ?? DEFAULT_BUILTIN_MAP_REF
  if (LOCAL_WEB_MODE && parseMapRef(requestedMap)?.source === 'user') {
    return localModeUnavailable('cloud_maps')
  }
  const loaded = await loadProject(requestedMap)
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  }

  const project = loaded.project
  const map = project.maps[project.config.startingMap]
  const tileset = map.tilesetId ? project.tilesets?.[map.tilesetId] : undefined
  const publicImagePath = await resolveUsableTilesetPath(tileset?.imagePath)
  const entities = (map.entities ?? []) as AirpgMapEntity[]
  const enemies = entities.map((entity, index) => {
    const definition = project.entityDefs?.[entity.entityDefId]
    const render = resolveNpcMapRender(definition, entity)
    return {
      id: index + 1,
      templateId: definition?.templateId,
      skillIds: Array.isArray(definition?.skillIds) ? definition.skillIds : undefined,
      name: definition?.name ?? entity.entityDefId,
      x: entity.position.x,
      y: entity.position.y,
      level: definition?.level ?? 1,
      profile: {
        maxHp: definition?.battleProfile?.maxHp ?? null,
        atk: definition?.battleProfile?.atk ?? null,
        def: definition?.battleProfile?.def ?? null,
        spd: definition?.battleProfile?.spd ?? null,
      },
      ...render,
    }
  })

  const rawPlayerVisual = project.config.playerVisualId
  const playerVisualId: MapCharacterVisualId =
    rawPlayerVisual === 'warriorBlue' || rawPlayerVisual === 'archerGreen'
      ? rawPlayerVisual
      : typeof rawPlayerVisual === 'string' && rawPlayerVisual.startsWith('pixellab:')
        ? rawPlayerVisual as MapCharacterVisualId
        : 'archerGreen'

  return NextResponse.json({
    mapRef: requestedMap,
    mapId: map.id,
    width: map.width,
    height: map.height,
    backgroundImageUrl: loaded.backgroundUrl
      ?? (typeof map.backgroundImageUrl === 'string' ? map.backgroundImageUrl : null),
    ground: map.tileLayers.ground.data,
    collision: map.collisionLayer,
    tileset: tileset
      ? {
          id: tileset.id,
          imagePath: tileset.imagePath,
          publicImagePath,
          tileWidth: tileset.tileWidth,
          tileHeight: tileset.tileHeight,
          tileCount: tileset.tileCount,
          columns: tileset.columns,
        }
      : null,
    playerSpawn: project.config.playerSpawn,
    playerVisualId,
    enemies,
  })
}
