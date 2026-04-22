import { describe, expect, it } from 'vitest'
import { MapBattleController } from '../src/map-battle/MapBattleController'

describe('MapBattleController enemy cadence', () => {
  it('enemy command 为空时也应推进 nextEnemyDue，避免每 tick 重试', () => {
    const controller = new MapBattleController({
      mapWidth: 24,
      mapHeight: 16,
      battleTickMs: 200,
      isWalkable: () => true,
      playerName: 'player',
      playerGrid: { x: 8, y: 8 },
      playerStats: {
        maxHp: 120,
        atk: 20,
        def: 10,
        spd: 10,
      },
      playerHp: 120,
      playerMp: 40,
      playerMaxMp: 40,
      playerSkillIds: ['barrier'],
      enemyName: 'enemy',
      enemyId: 'enemy-test',
      enemyGrid: { x: 9, y: 8 },
      enemyStats: {
        maxHp: 120,
        atk: 20,
        def: 10,
        spd: 10,
      },
      battleDecisionMode: 'manual',
    })

    const anyController = controller as any
    const original = anyController.decisionActionToCommand.bind(anyController)
    anyController.decisionActionToCommand = (
      actor: { id: string },
      target: unknown,
      tick: number,
      action: unknown,
    ) => {
      if (actor.id === anyController.session.right.id) return null
      return original(actor, target, tick, action)
    }

    expect(anyController.nextEnemyDue).toBe(1)
    expect(anyController.enemyInterval).toBeGreaterThan(0)

    controller.step({
      executeAtTick: 1,
      nextAttackSkillId: null,
      pendingFlee: false,
    })
    expect(anyController.nextEnemyDue).toBe(1 + anyController.enemyInterval)

    controller.step({
      executeAtTick: 2,
      nextAttackSkillId: null,
      pendingFlee: false,
    })
    expect(anyController.nextEnemyDue).toBe(1 + anyController.enemyInterval)
  })

  it('dash 预演后无有效位移时不应入队', () => {
    const controller = new MapBattleController({
      mapWidth: 24,
      mapHeight: 16,
      battleTickMs: 200,
      isWalkable: () => true,
      playerName: 'player',
      playerGrid: { x: 7.8, y: 8 },
      playerStats: {
        maxHp: 120,
        atk: 20,
        def: 10,
        spd: 10,
      },
      playerHp: 120,
      playerMp: 40,
      playerMaxMp: 40,
      playerSkillIds: ['barrier'],
      enemyName: 'enemy',
      enemyId: 'enemy-test',
      enemyGrid: { x: 9, y: 8 },
      enemyStats: {
        maxHp: 120,
        atk: 20,
        def: 10,
        spd: 10,
      },
      battleDecisionMode: 'manual',
    })

    const anyController = controller as any
    const actor = anyController.session.left
    const target = anyController.session.right
    const cmd = anyController.decisionActionToCommand(actor, target, 1, {
      type: 'dash',
      target: { x: target.position.x, y: target.position.y },
      path: 'test>dash_blocked',
    })

    expect(cmd).toBeNull()
  })

  it('直线路径被阻挡时，dash 应尝试侧向绕行', () => {
    const blocked = new Set(['8,8'])
    const controller = new MapBattleController({
      mapWidth: 24,
      mapHeight: 16,
      battleTickMs: 200,
      isWalkable: (x, y) => !blocked.has(`${x},${y}`),
      playerName: 'player',
      playerGrid: { x: 7.2, y: 8 },
      playerStats: {
        maxHp: 120,
        atk: 20,
        def: 10,
        spd: 10,
      },
      playerHp: 120,
      playerMp: 40,
      playerMaxMp: 40,
      playerSkillIds: ['barrier'],
      enemyName: 'enemy',
      enemyId: 'enemy-test',
      enemyGrid: { x: 11, y: 8 },
      enemyStats: {
        maxHp: 120,
        atk: 20,
        def: 10,
        spd: 10,
      },
      battleDecisionMode: 'manual',
    })

    const anyController = controller as any
    const actor = anyController.session.left
    const target = anyController.session.right
    const cmd = anyController.decisionActionToCommand(actor, target, 1, {
      type: 'dash',
      target: { x: target.position.x - 1.4, y: target.position.y },
      path: 'test>dash_obstacle',
    })

    expect(cmd).not.toBeNull()
  })

  it('僵持超时后按剩余血量结束战斗', () => {
    const controller = new MapBattleController({
      mapWidth: 24,
      mapHeight: 16,
      battleTickMs: 200,
      isWalkable: () => true,
      playerName: 'player',
      playerGrid: { x: 7, y: 8 },
      playerStats: {
        maxHp: 120,
        atk: 20,
        def: 10,
        spd: 10,
      },
      playerHp: 120,
      playerMp: 40,
      playerMaxMp: 40,
      playerSkillIds: ['barrier'],
      enemyName: 'enemy',
      enemyId: 'enemy-test',
      enemyGrid: { x: 11, y: 8 },
      enemyStats: {
        maxHp: 120,
        atk: 20,
        def: 10,
        spd: 10,
      },
      battleDecisionMode: 'manual',
    })

    const anyController = controller as any
    anyController.nextEnemyDue = 9999
    anyController.nextPlayerDue = 9999
    anyController.session = {
      ...anyController.session,
      phase: 'battle',
      preparationEndTick: 0,
      tick: 299,
      left: {
        ...anyController.session.left,
        resources: {
          ...anyController.session.left.resources,
          hp: 90,
        },
      },
      right: {
        ...anyController.session.right,
        resources: {
          ...anyController.session.right.resources,
          hp: 100,
        },
      },
    }

    const out = controller.step({
      executeAtTick: 300,
      nextAttackSkillId: null,
      pendingFlee: false,
    })

    expect(out.uiOutcome).toBe('lose')
    expect(out.session.result).toBe('right_win')
  })
})
