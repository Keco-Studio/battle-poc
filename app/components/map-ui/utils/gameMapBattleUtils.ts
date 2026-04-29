import { snapGridSpawnToWalkable } from '@/src/map-battle/dungeonDemoFootTiles'
import type { Enemy } from '@/app/constants'

export const DEEPCLAW_ENEMY_ID = 9001

type MapSpawnInfo = {
  width: number
  height: number
  collision: number[]
  ground: number[]
  tilesetId: string | null
}

export function ensureDeepClawAgentEnemy(enemies: Enemy[], mapInfo: MapSpawnInfo): Enemy[] {
  if (enemies.some((e) => e.enemyType === 'agent' || e.agentId === 'deepclaw' || e.id === DEEPCLAW_ENEMY_ID)) {
    return enemies
  }
  const spawn = snapGridSpawnToWalkable(
    Math.max(1, mapInfo.width - 3),
    2,
    mapInfo.width,
    mapInfo.height,
    mapInfo.collision,
    mapInfo.ground,
    mapInfo.tilesetId,
  )
  return [
    ...enemies,
    {
      id: DEEPCLAW_ENEMY_ID,
      name: 'DeepClaw Agent',
      x: spawn.x,
      y: spawn.y,
      level: 8,
      enemyType: 'agent',
      agentId: 'deepclaw',
      visualId: 'archerGreen',
    },
  ]
}
