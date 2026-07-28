export type MapProjectEntity = {
  instanceId: string
  entityDefId: string
  position: { x: number; y: number }
  overrides?: Record<string, unknown>
}

export type MapProjectNode = {
  id: string
  width: number
  height: number
  backgroundImageUrl?: string
  tilesetId?: string
  tileLayers: { ground: { data: number[] } }
  collisionLayer: number[]
  entities?: MapProjectEntity[]
  [key: string]: unknown
}

export type MapProject = {
  config: {
    startingMap: string
    playerSpawn: { x: number; y: number }
    playerVisualId?: string
    [key: string]: unknown
  }
  maps: Record<string, MapProjectNode>
  [key: string]: unknown
}

export type MapProjectValidationResult =
  | { ok: true; value: MapProject }
  | { ok: false; error: string }

const MAX_MAP_JSON_BYTES = 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  if (!isRecord(value)) return false
  return Number.isFinite(value.x) && Number.isFinite(value.y)
}

export function validateMapProject(input: unknown): MapProjectValidationResult {
  if (!isRecord(input)) return { ok: false, error: 'map project must be an object' }

  let serialized: string
  try {
    serialized = JSON.stringify(input)
  } catch {
    return { ok: false, error: 'map project must be JSON serializable' }
  }
  if (serialized.length > MAX_MAP_JSON_BYTES) {
    return { ok: false, error: 'map project exceeds 1 MiB' }
  }

  const config = input.config
  const maps = input.maps
  if (!isRecord(config) || typeof config.startingMap !== 'string') {
    return { ok: false, error: 'config.startingMap is required' }
  }
  if (!isFinitePosition(config.playerSpawn)) {
    return { ok: false, error: 'config.playerSpawn must contain finite coordinates' }
  }
  if (!isRecord(maps)) return { ok: false, error: 'maps is required' }

  const startingMap = maps[config.startingMap]
  if (!isRecord(startingMap)) {
    return { ok: false, error: 'config.startingMap must reference an existing map' }
  }

  for (const mapValue of Object.values(maps)) {
    if (!isRecord(mapValue)) return { ok: false, error: 'each map must be an object' }
    const width = mapValue.width
    const height = mapValue.height
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      Number(width) < 1 ||
      Number(width) > 128 ||
      Number(height) < 1 ||
      Number(height) > 128
    ) {
      return { ok: false, error: 'map dimensions must be integers between 1 and 128' }
    }
    const expectedLength = Number(width) * Number(height)
    const tileLayers = mapValue.tileLayers
    const ground = isRecord(tileLayers) && isRecord(tileLayers.ground)
      ? tileLayers.ground.data
      : null
    if (
      !Array.isArray(ground) ||
      ground.length !== expectedLength ||
      !ground.every(Number.isFinite)
    ) {
      return { ok: false, error: 'ground data length must equal width * height' }
    }
    const collision = mapValue.collisionLayer
    if (
      !Array.isArray(collision) ||
      collision.length !== expectedLength ||
      !collision.every(Number.isFinite)
    ) {
      return { ok: false, error: 'collisionLayer length must equal width * height' }
    }
    const entities = mapValue.entities
    if (entities !== undefined) {
      if (!Array.isArray(entities)) return { ok: false, error: 'entities must be an array' }
      for (const entity of entities) {
        if (!isRecord(entity) || !isFinitePosition(entity.position)) {
          return { ok: false, error: 'entity positions must contain finite coordinates' }
        }
      }
    }
  }

  return { ok: true, value: input as MapProject }
}

