import { v4 as uuidv4 } from 'uuid'
import { BattleCommand } from '../types/command-types'
import { BattleEvent } from '../types/event-types'
import {
  BattleMapBounds,
  BattlePhase,
  BattleResult,
  BattleSessionId,
  BattleTick
} from '../types/battle-types'
import { BattleEntity } from './battle-entity'

export type BattleSession = {
  id: BattleSessionId
  tick: BattleTick
  phase: BattlePhase
  preparationEndTick: BattleTick
  result: BattleResult
  mapBounds: BattleMapBounds
  left: BattleEntity
  right: BattleEntity
  commandQueue: BattleCommand[]
  chaseState: {
    status: 'none' | 'flee_pending'
    runnerId?: string
    chaserId?: string
    startTick?: number
    expireTick?: number
    autoFleeFailStreak?: number
  }
  events: BattleEvent[]
  createdAt: number
  updatedAt: number
}

export function createBattleSession(input: {
  left: BattleEntity
  right: BattleEntity
  mapBounds?: BattleMapBounds
  preparationTicks?: number
}): BattleSession {
  const now = Date.now()
  const preparationTicks = Math.max(0, Math.floor(input.preparationTicks ?? 20))
  return {
    id: uuidv4(),
    tick: 0,
    phase: preparationTicks > 0 ? 'preparation' : 'battle',
    preparationEndTick: preparationTicks,
    result: 'ongoing',
    mapBounds: input.mapBounds || {
      minX: 0,
      maxX: 20,
      minY: 0,
      maxY: 12
    },
    left: input.left,
    right: input.right,
    commandQueue: [],
    chaseState: {
      status: 'none'
    },
    events: [],
    createdAt: now,
    updatedAt: now
  }
}

