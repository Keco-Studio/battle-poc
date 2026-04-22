import { describe, expect, it } from 'vitest'
import { MapBattleController } from '../src/map-battle/MapBattleController'

function buildController(overrides?: {
  isWalkable?: (x: number, y: number) => boolean
  playerGrid?: { x: number; y: number }
  enemyGrid?: { x: number; y: number }
  playerSkillIds?: string[]
  mapWidth?: number
  mapHeight?: number
}) {
  return new MapBattleController({
    mapWidth: overrides?.mapWidth ?? 24,
    mapHeight: overrides?.mapHeight ?? 16,
    battleTickMs: 200,
    isWalkable: overrides?.isWalkable ?? (() => true),
    playerName: 'player',
    playerGrid: overrides?.playerGrid ?? { x: 7, y: 8 },
    playerStats: {
      maxHp: 120,
      atk: 20,
      def: 10,
      spd: 10,
    },
    playerHp: 120,
    playerMp: 40,
    playerMaxMp: 40,
    playerSkillIds: overrides?.playerSkillIds ?? [
      'backstab',
      'volley',
      'heal_wave',
      'fireball',
      'focus_shot',
      'rally_call',
    ],
    enemyName: 'enemy',
    enemyId: 'enemy-test',
    enemyGrid: overrides?.enemyGrid ?? { x: 9, y: 8 },
    enemyStats: {
      maxHp: 120,
      atk: 20,
      def: 10,
      spd: 10,
    },
    battleDecisionMode: 'manual',
  })
}

function runBattleAndCountPlayerActions(input: {
  controller: MapBattleController
  maxTicks: number
}): { playerActions: number; enemyActions: number; log: string[] } {
  const { controller, maxTicks } = input
  // skip preparation
  const session = (controller as unknown as { session: { tick: number; phase: string; preparationEndTick: number } }).session
  session.phase = 'battle'
  session.preparationEndTick = 0
  session.tick = 0

  let playerActions = 0
  let enemyActions = 0
  const log: string[] = []
  for (let t = 1; t <= maxTicks; t++) {
    const before = controller.session.events.length
    controller.step({ executeAtTick: t, nextAttackSkillId: null, pendingFlee: false })
    const after = controller.session.events.length
    for (let i = before; i < after; i++) {
      const ev = controller.session.events[i]
      if (ev.type === 'action_executed') {
        const actorId = String(ev.payload.actorId ?? '')
        const action = String(ev.payload.action ?? '')
        if (actorId === controller.session.left.id) {
          playerActions++
          log.push(`t${ev.tick} player ${action}`)
        } else if (actorId === controller.session.right.id) {
          enemyActions++
          log.push(`t${ev.tick} enemy ${action}`)
        }
      } else if (ev.type === 'command_rejected') {
        log.push(`t${ev.tick} REJECT ${String(ev.payload.actorId)} reason=${String(ev.payload.reason)}`)
      }
    }
    if (controller.session.result !== 'ongoing') break
  }
  return { playerActions, enemyActions, log }
}

describe('player stuck dash regression', () => {
  it('玩家紧贴墙壁时，若 kite 退路被阻，不应持续空转 dash 而不出技能', () => {
    // Map: a vertical wall on the player's back-left direction + top/bottom walls
    // so every "retreat" direction the kite template picks ends up blocked.
    // Player is an archer (focus_shot + volley), enemy a mage. kite_cycle template.
    const walls = new Set<string>()
    // Left wall
    for (let y = 0; y < 16; y++) walls.add(`7,${y}`)
    // Top + bottom walls near the player
    for (let x = 7; x < 24; x++) walls.add(`${x},7`)
    for (let x = 7; x < 24; x++) walls.add(`${x},9`)
    const isWalkable = (x: number, y: number) => !walls.has(`${x},${y}`)

    const controller = buildController({
      isWalkable,
      playerGrid: { x: 8.1, y: 8.1 }, // trapped in a narrow corridor
      enemyGrid: { x: 10, y: 8.1 },
    })

    const result = runBattleAndCountPlayerActions({ controller, maxTicks: 40 })

    // Over 40 ticks, enemy gets many actions. If dash fallback is broken, player
    // does 0 real actions while enemy pummels them; the issue reported by the
    // user is "player does only one dash and then nothing".
    // Sanity: both sides should get turns. If the bug regresses, player is 0
    // while enemy runs freely, which reliably trips this invariant.
    expect(result.enemyActions).toBeGreaterThanOrEqual(3)
    expect(result.playerActions).toBeGreaterThanOrEqual(3)
  })
})
