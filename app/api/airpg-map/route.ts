import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

import type { MapCharacterVisualId } from '@/app/constants'

const LOCAL_MAPS_DIR = path.join(process.cwd(), 'data', 'maps')
const DEFAULT_MAP_FILE = 'demo-project.json'

type AirpgMapEntity = {
  instanceId: string
  entityDefId: string
  position: { x: number; y: number }
  overrides?: {
    visualId?: string | null
  }
}

type EntityDefLike = {
  name?: string
  visualId?: string
  sprite?: { tilesetId?: string; tileIndex?: number }
  battleProfile?: { maxHp?: number; atk?: number; def?: number; spd?: number }
}

function resolveNpcMapRender(def: EntityDefLike | undefined, entity: AirpgMapEntity): {
  visualId?: MapCharacterVisualId | null
  mapSpriteTileIndex?: number
} {
  if (!def) return {}
  const rawOverride = entity.overrides && Object.prototype.hasOwnProperty.call(entity.overrides, 'visualId')
    ? entity.overrides!.visualId
    : undefined
  let effectiveVisual: string | undefined
  if (rawOverride === null) {
    effectiveVisual = undefined
  } else if (rawOverride !== undefined) {
    effectiveVisual = rawOverride
  } else {
    effectiveVisual = def.visualId
  }
  if (effectiveVisual === 'warriorBlue' || effectiveVisual === 'archerGreen') {
    // Archer artwork reserved for player protagonist; NPCs marked as archerGreen still use warrior sprite to avoid duplicate "you" on map
    const mapVisual: MapCharacterVisualId = effectiveVisual === 'archerGreen' ? 'warriorBlue' : effectiveVisual
    return { visualId: mapVisual }
  }
  if (typeof effectiveVisual === 'string' && effectiveVisual.startsWith('pixellab:')) {
    return { visualId: effectiveVisual as MapCharacterVisualId }
  }
  const ti = typeof def.sprite?.tileIndex === 'number' ? def.sprite.tileIndex : 0
  if (ti > 0) return { mapSpriteTileIndex: ti }
  return {}
}

async function resolveUsableTilesetPath(imagePath: string | undefined): Promise<string | null> {
  const candidates = [
    imagePath,
    'maps/tilesets/dungeon-tileset.png',
    'maps/tilesets/sprite.png',
    'assets/tilesets/dungeon-tileset.png',
    'assets/tilesets/sprite.png',
  ].filter((v): v is string => !!v && v.trim().length > 0)

  for (const candidate of candidates) {
    const normalized = candidate.startsWith('/') ? candidate.slice(1) : candidate
    const diskPath = path.join(process.cwd(), 'public', normalized)
    try {
      await access(diskPath)
      return `/${normalized}`
    } catch {
      // Try next candidate.
    }
  }
  return null
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const requestedMap = url.searchParams.get('map')
    const mapFileName = requestedMap
      ? `${path.basename(requestedMap).replace(/\.json$/i, '')}.json`
      : DEFAULT_MAP_FILE
    const mapFilePath = path.join(LOCAL_MAPS_DIR, mapFileName)
    const raw = await readFile(mapFilePath, 'utf8')
    const project = JSON.parse(raw) as {
      config?: {
        startingMap?: string
        playerSpawn?: { x: number; y: number }
        /** Aligned with ai-rpg-poc: map protagonist appearance, default archer */
        playerVisualId?: MapCharacterVisualId
      }
      maps?: Record<
        string,
        {
          id: string
          width: number
          height: number
          /** Optional background image overlay (generated PNG). */
          backgroundImageUrl?: string
          tilesetId?: string
          tileLayers?: { ground?: { data?: number[] } }
          collisionLayer?: number[]
          entities?: AirpgMapEntity[]
        }
      >
      tilesets?: Record<
        string,
        {
          id: string
          imagePath: string
          tileWidth: number
          tileHeight: number
          tileCount: number
          columns: number
        }
      >
      entityDefs?: Record<string, EntityDefLike>
    }

    const mapId = project.config?.startingMap
    const map = mapId ? project.maps?.[mapId] : undefined
    if (!map) {
      return NextResponse.json({ error: 'starting map not found in selected map json' }, { status: 404 })
    }

    const tileset = map.tilesetId ? project.tilesets?.[map.tilesetId] : undefined
    const publicImagePath = await resolveUsableTilesetPath(tileset?.imagePath)

    const enemies = (map.entities ?? []).map((entity, index) => {
      const def = project.entityDefs?.[entity.entityDefId]
      const maxHp = def?.battleProfile?.maxHp ?? null
      const atk = def?.battleProfile?.atk ?? null
      const defStat = def?.battleProfile?.def ?? null
      const spd = def?.battleProfile?.spd ?? null
      const { visualId, mapSpriteTileIndex } = resolveNpcMapRender(def, entity)
      return {
        id: index + 1,
        name: def?.name ?? entity.entityDefId,
        x: entity.position.x,
        y: entity.position.y,
        level: 1,
        profile: {
          maxHp,
          atk,
          def: defStat,
          spd,
        },
        ...(visualId !== undefined ? { visualId } : {}),
        ...(mapSpriteTileIndex !== undefined ? { mapSpriteTileIndex } : {}),
      }
    })

    const rawPlayerVisual = project.config?.playerVisualId
    let playerVisualId: MapCharacterVisualId = 'archerGreen'
    if (rawPlayerVisual === 'warriorBlue' || rawPlayerVisual === 'archerGreen') {
      playerVisualId = rawPlayerVisual
    } else if (typeof rawPlayerVisual === 'string' && rawPlayerVisual.startsWith('pixellab:')) {
      playerVisualId = rawPlayerVisual as MapCharacterVisualId
    }

    return NextResponse.json({
      mapId: map.id,
      width: map.width,
      height: map.height,
      backgroundImageUrl: typeof map.backgroundImageUrl === 'string' ? map.backgroundImageUrl : null,
      ground: map.tileLayers?.ground?.data ?? [],
      collision: map.collisionLayer ?? [],
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
      playerSpawn: project.config?.playerSpawn ?? { x: 0, y: 0 },
      playerVisualId,
      enemies,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'failed to load local map json', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
