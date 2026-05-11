import { describe, expect, it } from 'vitest'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import {
  enqueueBattleCommand,
  processBattleCommands,
  type BattleCommandWalkContext,
} from '../src/battle-core/engine/command-processor'
import { floatToCell } from '../src/map-battle/walkability'

function makeEntity(input: {
  id: string
  team: 'left' | 'right'
  x: number
  y: number
}): BattleEntity {
  return {
    id: input.id,
    name: input.id,
    team: input.team,
    position: { x: input.x, y: input.y },
    resources: {
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      stamina: 40,
      maxStamina: 40,
      rage: 0,
      maxRage: 100,
      shield: 0,
      maxShield: 30,
    },
    atk: 20,
    def: 8,
    spd: 12,
    skillSlots: [],
    defending: false,
    alive: true,
    effects: [],
  }
}

describe('flee walkability', () => {
  it('flee movement should honor collision and stay on walkable cells', () => {
    const left = makeEntity({ id: 'left-flee', team: 'left', x: 2.5, y: 4.5 })
    const right = makeEntity({ id: 'right-flee', team: 'right', x: 8.5, y: 4.5 })
    const walk: BattleCommandWalkContext = {
      mapW: 12,
      mapH: 10,
      isTerrainWalkable: (x, y) => {
        if (x === 0) return false
        return y >= 0 && y < 10
      },
    }
    const session0 = createBattleSession({
      left,
      right,
      preparationTicks: 0,
      mapBounds: { minX: 0, maxX: 12, minY: 0, maxY: 10 },
    })
    const session1 = enqueueBattleCommand(session0, {
      commandId: 'flee-cmd',
      sessionId: session0.id,
      actorId: left.id,
      tick: 0,
      action: 'flee',
      targetId: right.id,
    })
    const out = processBattleCommands(session1, walk).session
    const actor = out.left
    const cell = floatToCell(actor.position.x, actor.position.y, walk.mapW, walk.mapH)

    expect(walk.isTerrainWalkable(cell.ix, cell.iy)).toBe(true)
  })

  it('when pinned at edge, flee should move toward open field center', () => {
    const left = makeEntity({ id: 'left-edge', team: 'left', x: 0.6, y: 4.5 })
    const right = makeEntity({ id: 'right-edge', team: 'right', x: 3.2, y: 4.5 })
    const session0 = createBattleSession({
      left,
      right,
      preparationTicks: 0,
      mapBounds: { minX: 0, maxX: 12, minY: 0, maxY: 10 },
    })
    const session1 = enqueueBattleCommand(session0, {
      commandId: 'flee-open-field',
      sessionId: session0.id,
      actorId: left.id,
      tick: 0,
      action: 'flee',
      targetId: right.id,
    })
    const out = processBattleCommands(session1).session

    expect(out.left.position.x).toBeGreaterThan(left.position.x)
  })
})
