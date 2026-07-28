import type { MapProject } from '@/src/lib/maps/map-project'
import { VS01_ENEMY_BY_ID } from './enemies'

export type Vs01MapDefinition = {
  id: string
  name: string
  description: string
  order: number
  width: number
  height: number
  backgroundImageUrl: string
  enemyTemplateIds: readonly string[]
  unlockEnemyIds: readonly string[]
  bossMap: boolean
}

export const VS01_MAPS = [
  { id: 'emberwatch_causeway', name: 'Emberwatch Causeway', description: 'A broken approach deck with three separated relay threats.', order: 1, width: 20, height: 12, backgroundImageUrl: '/assets/generated/vs01/maps/emberwatch-causeway.png', enemyTemplateIds: ['cinder_wisp', 'iron_husk', 'frost_revenant'], unlockEnemyIds: [], bossMap: false },
  { id: 'ashen_relay_core', name: 'Ashen Relay Core', description: 'The circular relay heart where the Null Custodian waits.', order: 2, width: 20, height: 12, backgroundImageUrl: '/assets/generated/vs01/maps/ashen-relay-core.png', enemyTemplateIds: ['null_custodian'], unlockEnemyIds: ['cinder_wisp', 'iron_husk', 'frost_revenant'], bossMap: true },
] as const satisfies readonly Vs01MapDefinition[]

const ENCOUNTERS = [
  { id: 'causeway_cinder', mapId: 'emberwatch_causeway', enemyTemplateId: 'cinder_wisp', x: 5, y: 3 },
  { id: 'causeway_husk', mapId: 'emberwatch_causeway', enemyTemplateId: 'iron_husk', x: 14, y: 4 },
  { id: 'causeway_frost', mapId: 'emberwatch_causeway', enemyTemplateId: 'frost_revenant', x: 11, y: 9 },
  { id: 'core_custodian', mapId: 'ashen_relay_core', enemyTemplateId: 'null_custodian', x: 14, y: 6 },
] as const

function createGround(width: number, height: number): number[] {
  return Array.from({ length: width * height }, () => 1)
}

function createCollision(mapId: string, width: number, height: number, blocked: readonly [number, number][]): number[] {
  const blockedKeys = new Set(blocked.map(([x, y]) => `${x}:${y}`))
  return Array.from({ length: width * height }, (_, index) => {
    const x = index % width
    const y = Math.floor(index / width)
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1
    const outsideCauseway = mapId === 'emberwatch_causeway'
      && !((y >= 3 && y <= 7) || (x >= 8 && x <= 11))
    return border || outsideCauseway || blockedKeys.has(`${x}:${y}`) ? 1 : 0
  })
}

const MAP_BLOCKERS: Record<string, readonly [number, number][]> = {
  emberwatch_causeway: [[8, 2], [8, 3], [8, 8], [8, 9], [16, 7], [17, 7]],
  ashen_relay_core: [[4, 3], [4, 8], [15, 3], [15, 8]],
}

export function getVs01MapDefinition(id: string): Vs01MapDefinition | null {
  const contentId = id === 'emberwatch-causeway'
    ? 'emberwatch_causeway'
    : id === 'ashen-relay-core'
      ? 'ashen_relay_core'
      : id
  return VS01_MAPS.find((map) => map.id === contentId) ?? null
}

export function getVs01MapProject(id: string): MapProject | null {
  const map = getVs01MapDefinition(id)
  if (!map) return null
  const encounters = ENCOUNTERS.filter((encounter) => encounter.mapId === map.id)
  const entityDefs = Object.fromEntries(encounters.map((encounter) => {
    const enemy = VS01_ENEMY_BY_ID.get(encounter.enemyTemplateId)
    if (!enemy) throw new Error(`VS01 map references unknown enemy: ${encounter.enemyTemplateId}`)
    return [enemy.id, {
      name: enemy.name,
      templateId: enemy.id,
      level: enemy.level,
      visualId: enemy.visualId,
      skillIds: [...enemy.skillIds],
      battleProfile: { ...enemy.stats },
    }]
  }))
  return {
    config: {
      startingMap: map.id,
      playerSpawn: map.id === 'ashen_relay_core' ? { x: 3, y: 6 } : { x: 2, y: 6 },
      playerVisualId: 'pixellab:vs01-relay-warden',
    },
    entityDefs,
    maps: {
      [map.id]: {
        id: map.id,
        width: map.width,
        height: map.height,
        backgroundImageUrl: map.backgroundImageUrl,
        tileLayers: { ground: { data: createGround(map.width, map.height) } },
        collisionLayer: createCollision(map.id, map.width, map.height, MAP_BLOCKERS[map.id] ?? []),
        entities: encounters.map((encounter) => ({
          instanceId: encounter.id,
          entityDefId: encounter.enemyTemplateId,
          position: { x: encounter.x, y: encounter.y },
        })),
      },
    },
  }
}
