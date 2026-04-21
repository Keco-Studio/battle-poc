import { BattleTickEngine } from '../battle-core/engine/tick-engine'
import { enqueueBattleCommand } from '../battle-core/engine/command-processor'
import type { BattleCommand } from '../battle-core/domain/types/command-types'
import type { BattleEntity } from '../battle-core/domain/entities/battle-entity'
import type { BattleSession } from '../battle-core/domain/entities/battle-session'
import { createMapBattleSession, newCommandId, type MapBattleStartConfig } from './createMapBattleSession'
import { getPocBattleUiOutcome } from './battleOutcome'
import { cooldownMsFromTicks, getSkillById, BASIC_ATTACK } from '../../app/constants'
import { getBattleSkillDefinition } from '../battle-core/content/skills/basic-skill-catalog'
import { BATTLE_BALANCE } from '../battle-core/config/battle-balance'
import { BattleCoreOrchestrator } from '../battle-core/service/battle-core-orchestrator'
import { clampDashDestination } from './walkability'

const MELEE_RANGE = 1.6
const RANGE_BUFFER = BATTLE_BALANCE.tacticalRangeBuffer
const KITE_MIN_DISTANCE = BATTLE_BALANCE.tacticalKiteMinDistance
const LOW_HP_RETREAT_RATIO = BATTLE_BALANCE.tacticalLowHpRetreatRatio
const TARGET_LOW_HP_FINISH_RATIO = BATTLE_BALANCE.tacticalTargetLowHpFinishRatio

type TacticalMode = 'aggressive_finish' | 'kite_and_cast' | 'flee_and_reset' | 'steady_trade'

function distBetween(session: BattleSession): number {
  const a = session.left.position
  const b = session.right.position
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function intervalTicksForSpd(spd: number): number {
  return Math.max(2, Math.min(12, 10 - Math.floor(spd / 4)))
}

function pickTacticalMode(input: {
  actorHpRatio: number
  targetHpRatio: number
  distance: number
  preferredRange: number
}): TacticalMode {
  if (input.actorHpRatio <= LOW_HP_RETREAT_RATIO && input.distance <= KITE_MIN_DISTANCE) {
    return 'flee_and_reset'
  }
  if (
    input.targetHpRatio <= TARGET_LOW_HP_FINISH_RATIO &&
    input.distance <= Math.max(MELEE_RANGE + 0.4, input.preferredRange)
  ) {
    return 'aggressive_finish'
  }
  if (input.preferredRange > MELEE_RANGE + 0.6) {
    return 'kite_and_cast'
  }
  return 'steady_trade'
}

function computeApproachX(input: {
  actorTeam: 'left' | 'right'
  targetX: number
  preferredRange: number
  minX: number
  maxX: number
}): number {
  const stayDistance = Math.max(1.1, input.preferredRange - 0.5)
  if (input.actorTeam === 'left') {
    return Math.min(input.maxX - 0.5, input.targetX - stayDistance)
  }
  return Math.max(input.minX + 0.5, input.targetX + stayDistance)
}

function computeRetreatX(input: {
  actorX: number
  actorTeam: 'left' | 'right'
  preferredRange: number
  minX: number
  maxX: number
}): number {
  const retreatStep = Math.max(1.2, Math.min(3.6, input.preferredRange * 0.55))
  const raw =
    input.actorTeam === 'left' ? input.actorX - retreatStep : input.actorX + retreatStep
  return Math.max(input.minX + 0.5, Math.min(input.maxX - 0.5, raw))
}

export type MapBattleStepResult = {
  session: BattleSession
  uiOutcome: ReturnType<typeof getPocBattleUiOutcome>
  /** 本步内新产生的事件（用于飘字 / 演出） */
  newEventCount: number
  /** 准备阶段剩余 tick（若已进入 battle 则为 0） */
  remainingPreparationTicks: number
}

export class MapBattleController {
  session: BattleSession
  private readonly engine = new BattleTickEngine()
  private readonly decisionMode: 'manual' | 'dual_llm'
  private readonly llmOrchestrator: BattleCoreOrchestrator | null
  private nextPlayerDue = 1
  private nextEnemyDue = 1
  private playerInterval: number
  private enemyInterval: number
  private readonly mapW: number
  private readonly mapH: number
  private readonly isWalkable?: (gx: number, gy: number) => boolean

  constructor(cfg: MapBattleStartConfig) {
    this.session = createMapBattleSession(cfg)
    this.decisionMode = cfg.battleDecisionMode || 'manual'
    this.llmOrchestrator =
      this.decisionMode === 'dual_llm'
        ? new BattleCoreOrchestrator({
            llmConfig: cfg.llmConfig
          })
        : null
    this.playerInterval = intervalTicksForSpd(this.session.left.spd)
    this.enemyInterval = intervalTicksForSpd(this.session.right.spd)
    this.mapW = cfg.mapWidth
    this.mapH = cfg.mapHeight
    this.isWalkable = cfg.isWalkable
  }

  /** dash 目标沿射线裁剪到可走区域；未提供 isWalkable 时原样返回 */
  private clampDashMoveTarget(actor: BattleEntity, tx: number, ty: number): { x: number; y: number } {
    if (!this.isWalkable) {
      return { x: tx, y: ty }
    }
    return clampDashDestination({
      from: actor.position,
      to: { x: tx, y: ty },
      mapW: this.mapW,
      mapH: this.mapH,
      isWalkable: this.isWalkable,
    })
  }

  /** 裁剪后是否仍能产生有效位移（避免穿墙导致每 tick 空 dash 卡死） */
  private canDashToward(actor: BattleEntity, tx: number, ty: number): boolean {
    const c = this.clampDashMoveTarget(actor, tx, ty)
    return Math.hypot(c.x - actor.position.x, c.y - actor.position.y) > 0.12
  }

  step(input: {
    executeAtTick: number
    nextAttackSkillId: string | null
    pendingFlee: boolean
    pendingFleeSource?: 'manual' | 'auto' | null
    onClearQueuedSkill?: () => void
    onSkillCooldown?: (skillId: string, cooldownMs: number) => void
  }): MapBattleStepResult {
    const eventsBefore = this.session.events.length

    if (this.session.result !== 'ongoing') {
      return {
        session: this.session,
        uiOutcome: getPocBattleUiOutcome(this.session),
        newEventCount: 0,
        remainingPreparationTicks: Math.max(0, this.session.preparationEndTick - this.session.tick),
      }
    }

    if (input.pendingFlee) {
      const fleeReason = input.pendingFleeSource === 'auto' ? 'auto_flee' : 'manual_flee'
      const cmd: BattleCommand = {
        commandId: newCommandId(),
        sessionId: this.session.id,
        actorId: this.session.left.id,
        tick: input.executeAtTick,
        action: 'flee',
        targetId: this.session.right.id,
      }
      this.enqueueIntentCommand(cmd, 'flee_and_reset', fleeReason)
      const out = this.engine.tick(this.session)
      this.session = out.session
    } else if (this.decisionMode === 'dual_llm' && this.llmOrchestrator) {
      const prepared = this.llmOrchestrator.prepareCommands(this.session, input.executeAtTick)
      this.session = prepared.session
      if (prepared.failedActorIds.length > 0) {
        const dist = distBetween(this.session)
        if (prepared.failedActorIds.includes(this.session.right.id)) {
          this.enqueueEnemyIntent(input.executeAtTick, dist)
        }
        if (prepared.failedActorIds.includes(this.session.left.id)) {
          this.enqueuePlayerIntent(input.executeAtTick, dist, input)
        }
      }
      const out = this.engine.tick(this.session)
      this.session = out.session
      this.llmOrchestrator.onTickFinished(this.session)
    } else {
      const dist = distBetween(this.session)

      this.enqueueEnemyIntent(input.executeAtTick, dist)

      this.enqueuePlayerIntent(input.executeAtTick, dist, input)
      const out = this.engine.tick(this.session)
      this.session = out.session
    }

    const uiOutcome = getPocBattleUiOutcome(this.session)
    return {
      session: this.session,
      uiOutcome,
      newEventCount: this.session.events.length - eventsBefore,
      remainingPreparationTicks: Math.max(0, this.session.preparationEndTick - this.session.tick),
    }
  }

  private enqueueEnemyIntent(executeAtTick: number, dist: number): void {
    if (this.session.result !== 'ongoing') return
    const actor = this.session.right
    const target = this.session.left
    if (!actor.alive || !target.alive) return

    const hpRatio = actor.resources.maxHp > 0 ? actor.resources.hp / actor.resources.maxHp : 1
    const targetHpRatio = target.resources.maxHp > 0 ? target.resources.hp / target.resources.maxHp : 1
    const frostSlot = actor.skillSlots.find((slot) => slot.skillId === 'frost_lock')
    const boltSlot = actor.skillSlots.find((slot) => slot.skillId === 'arcane_bolt')
    const canUseFrost =
      !!frostSlot &&
      frostSlot.cooldownTick <= executeAtTick &&
      actor.resources.mp >= (getBattleSkillDefinition('frost_lock')?.mpCost ?? 6)
    const canUseBolt =
      !!boltSlot &&
      boltSlot.cooldownTick <= executeAtTick &&
      actor.resources.mp >= (getBattleSkillDefinition('arcane_bolt')?.mpCost ?? 4)
    const frostRange = getBattleSkillDefinition('frost_lock')?.range ?? 7.2
    const boltRange = getBattleSkillDefinition('arcane_bolt')?.range ?? 6.5
    const preferredRange = canUseFrost ? frostRange : canUseBolt ? boltRange : MELEE_RANGE
    const mode = pickTacticalMode({
      actorHpRatio: hpRatio,
      targetHpRatio,
      distance: dist,
      preferredRange,
    })

    // 近战贴脸且未到敌方「普攻节奏」窗口时整段跳过（沿用原意）；远程技能必须与 nextEnemyDue 对齐，
    // 否则在 gcd 窗口内仍会每技能冷却 tick 射一箭，日志与体感都会刷屏。
    if (executeAtTick < this.nextEnemyDue && dist <= MELEE_RANGE + 0.2) return

    if (
      canUseFrost &&
      executeAtTick >= this.nextEnemyDue &&
      dist <= frostRange + RANGE_BUFFER &&
      targetHpRatio > 0.15
    ) {
      const cmd: BattleCommand = {
        commandId: newCommandId(),
        sessionId: this.session.id,
        actorId: actor.id,
        tick: executeAtTick,
        action: 'cast_skill',
        targetId: target.id,
        skillId: 'frost_lock',
      }
      this.enqueueIntentCommand(cmd, mode, 'enemy_cast_control')
      this.nextEnemyDue = executeAtTick + this.enemyInterval
      return
    }

    if (canUseBolt && executeAtTick >= this.nextEnemyDue && dist <= boltRange + RANGE_BUFFER) {
      const cmd: BattleCommand = {
        commandId: newCommandId(),
        sessionId: this.session.id,
        actorId: actor.id,
        tick: executeAtTick,
        action: 'cast_skill',
        targetId: target.id,
        skillId: 'arcane_bolt',
      }
      this.enqueueIntentCommand(cmd, mode, 'enemy_cast_burst')
      this.nextEnemyDue = executeAtTick + this.enemyInterval
      return
    }

    if (mode === 'flee_and_reset' && actor.resources.stamina >= BATTLE_BALANCE.dodgeStaminaCost) {
      if (executeAtTick < this.nextEnemyDue) return
      const dodge: BattleCommand = {
        commandId: newCommandId(),
        sessionId: this.session.id,
        actorId: actor.id,
        tick: executeAtTick,
        action: 'dodge',
      }
      this.enqueueIntentCommand(dodge, mode, 'enemy_dodge_retreat')
      this.nextEnemyDue = executeAtTick + this.enemyInterval
      const rawTx = actor.team === 'right' ? this.session.mapBounds.maxX - 0.5 : this.session.mapBounds.minX + 0.5
      const rawTy = actor.position.y
      if (this.canDashToward(actor, rawTx, rawTy)) {
        const c = this.clampDashMoveTarget(actor, rawTx, rawTy)
        const retreat: BattleCommand = {
          commandId: newCommandId(),
          sessionId: this.session.id,
          actorId: actor.id,
          tick: executeAtTick,
          action: 'dash',
          targetId: target.id,
          metadata: {
            moveTargetX: c.x,
            moveTargetY: c.y,
            moveStep: 2.8,
          },
        }
        this.enqueueIntentCommand(retreat, mode, 'enemy_dash_retreat')
      }
      return
    }

    // 即使已在射程内，kite 模式也要主动拉开，避免站桩。
    if (mode === 'kite_and_cast' && dist < Math.max(MELEE_RANGE + 0.4, preferredRange - 1.2)) {
      if (executeAtTick < this.nextEnemyDue) return
      const rawTx = computeRetreatX({
        actorX: actor.position.x,
        actorTeam: actor.team,
        preferredRange,
        minX: this.session.mapBounds.minX,
        maxX: this.session.mapBounds.maxX,
      })
      const rawTy = actor.position.y
      if (this.canDashToward(actor, rawTx, rawTy)) {
        const c = this.clampDashMoveTarget(actor, rawTx, rawTy)
        const reposition: BattleCommand = {
          commandId: newCommandId(),
          sessionId: this.session.id,
          actorId: actor.id,
          tick: executeAtTick,
          action: 'dash',
          targetId: target.id,
          metadata: {
            moveTargetX: c.x,
            moveTargetY: c.y,
            moveStep: 2.4,
          },
        }
        this.enqueueIntentCommand(reposition, mode, 'enemy_dash_kite')
        this.nextEnemyDue = executeAtTick + this.enemyInterval
        return
      }
      // 无法沿风筝方向位移（贴墙等）：不 return，交给下方普攻/接近逻辑，避免每 tick 空 dash 卡死
    }

    if (dist > MELEE_RANGE) {
      if (executeAtTick < this.nextEnemyDue) return
      const desired =
        mode === 'aggressive_finish'
          ? MELEE_RANGE - 0.1
          : canUseBolt && dist > boltRange
            ? boltRange - 0.6
            : canUseFrost && dist > frostRange
              ? frostRange - 0.6
              : preferredRange - 0.4
      const closeEnough = dist <= desired + RANGE_BUFFER
      if (closeEnough) return
      const rawTx = computeApproachX({
        actorTeam: actor.team,
        targetX: target.position.x,
        preferredRange: desired,
        minX: this.session.mapBounds.minX,
        maxX: this.session.mapBounds.maxX,
      })
      const rawTy = target.position.y
      if (this.canDashToward(actor, rawTx, rawTy)) {
        const c = this.clampDashMoveTarget(actor, rawTx, rawTy)
        const cmd: BattleCommand = {
          commandId: newCommandId(),
          sessionId: this.session.id,
          actorId: actor.id,
          tick: executeAtTick,
          action: 'dash',
          targetId: target.id,
          metadata: {
            moveTargetX: c.x,
            moveTargetY: c.y,
          },
        }
        this.enqueueIntentCommand(cmd, mode, 'enemy_dash_approach')
        this.nextEnemyDue = executeAtTick + this.enemyInterval
        return
      }
      // 仍远离且无法沿直线接近：本 tick 不出手，避免 basic_attack 超距被拒刷屏
      return
    }
    if (dist <= MELEE_RANGE + RANGE_BUFFER && executeAtTick >= this.nextEnemyDue) {
      const cmd: BattleCommand = {
        commandId: newCommandId(),
        sessionId: this.session.id,
        actorId: actor.id,
        tick: executeAtTick,
        action: 'basic_attack',
        targetId: target.id,
      }
      this.enqueueIntentCommand(cmd, mode, 'enemy_basic_attack')
      this.nextEnemyDue = executeAtTick + this.enemyInterval
    }
  }

  private enqueuePlayerIntent(
    executeAtTick: number,
    dist: number,
    input: {
      nextAttackSkillId: string | null
      onClearQueuedSkill?: () => void
      onSkillCooldown?: (skillId: string, cooldownMs: number) => void
    },
  ): void {
    if (this.session.result !== 'ongoing') return
    const actor = this.session.left
    const target = this.session.right
    if (!actor.alive || !target.alive) return

    const skillId = input.nextAttackSkillId
    const chosen = skillId !== null && skillId !== BASIC_ATTACK.id ? skillId : BASIC_ATTACK.id
    const selectedSkill = chosen === BASIC_ATTACK.id ? BASIC_ATTACK : getSkillById(chosen)
    const action = selectedSkill?.action
    const preferredRange =
      selectedSkill?.action === 'cast_skill' && selectedSkill.coreSkillId
        ? (getBattleSkillDefinition(selectedSkill.coreSkillId)?.range ?? selectedSkill.range ?? MELEE_RANGE)
        : MELEE_RANGE
    const hpRatio = actor.resources.maxHp > 0 ? actor.resources.hp / actor.resources.maxHp : 1
    const targetHpRatio = target.resources.maxHp > 0 ? target.resources.hp / target.resources.maxHp : 1
    const mode = pickTacticalMode({
      actorHpRatio: hpRatio,
      targetHpRatio,
      distance: dist,
      preferredRange,
    })
    // 必须与 command-processor 中 basic_attack 的射程一致（>1.6 会 command_rejected），
    // 不能用 MELEE_RANGE+BUFFER 误判“已在普攻射程内”，否则会在 1.6~1.8 反复入队普攻刷屏。
    const inPreferredRange =
      selectedSkill?.action === 'cast_skill' && selectedSkill.coreSkillId
        ? dist <= preferredRange + RANGE_BUFFER
        : dist <= MELEE_RANGE

    const playerHasManualQueuedSkill = chosen !== BASIC_ATTACK.id
    if (mode === 'flee_and_reset') {
      // 低血撤离阶段不再因手选技能而主动贴近，优先清空队列并尝试脱离。
      if (playerHasManualQueuedSkill) {
        input.onClearQueuedSkill?.()
      }
      // 撤离动作按玩家节奏窗口执行；flee 由 step.pendingFlee（自动/手动）统一触发，
      // 这里仅做撤步，不在低血时无条件强制发 flee，避免“阈值到了但未满足自动逃跑判定时卡住”。
      if (executeAtTick < this.nextPlayerDue) return
      this.nextPlayerDue = executeAtTick + this.playerInterval

      if (actor.resources.stamina >= BATTLE_BALANCE.dodgeStaminaCost) {
        const dodge: BattleCommand = {
          commandId: newCommandId(),
          sessionId: this.session.id,
          actorId: actor.id,
          tick: executeAtTick,
          action: 'dodge',
        }
        this.enqueueIntentCommand(dodge, mode, 'player_dodge_retreat')
        return
      }

      // 体力不足时回落到常规分支（可能普攻/施法），避免整段空转。
      // 不 return
    }

    if (executeAtTick < this.nextPlayerDue) return
    this.nextPlayerDue = executeAtTick + this.playerInterval

    if (!inPreferredRange) {
      const approachRange = mode === 'aggressive_finish' ? MELEE_RANGE : preferredRange
      const rawTx = computeApproachX({
        actorTeam: actor.team,
        targetX: target.position.x,
        preferredRange: approachRange,
        minX: this.session.mapBounds.minX,
        maxX: this.session.mapBounds.maxX,
      })
      const rawTy = target.position.y
      if (this.canDashToward(actor, rawTx, rawTy)) {
        const c = this.clampDashMoveTarget(actor, rawTx, rawTy)
        const cmd: BattleCommand = {
          commandId: newCommandId(),
          sessionId: this.session.id,
          actorId: actor.id,
          tick: executeAtTick,
          action: 'dash',
          targetId: target.id,
          metadata: {
            moveTargetX: c.x,
            moveTargetY: c.y,
          },
        }
        this.enqueueIntentCommand(cmd, mode, 'player_dash_approach')
        return
      }
      // 无法沿直线接近：不 return，继续尝试施法/普攻分支（避免贴墙时整局空转）
    }

    // 玩家处于风筝策略时，若贴得太近则优先后撤再打。若本 tick 已手选技能且已在理想射程内，勿每 tick 后撤，
    // 否则会与技能施放分支死锁（看起来「不动」），并与敌方走位叠加成左右抖动。
    if (
      !playerHasManualQueuedSkill &&
      mode === 'kite_and_cast' &&
      dist < Math.max(MELEE_RANGE + 0.4, preferredRange - 1.2)
    ) {
      const rawTx = computeRetreatX({
        actorX: actor.position.x,
        actorTeam: actor.team,
        preferredRange,
        minX: this.session.mapBounds.minX,
        maxX: this.session.mapBounds.maxX,
      })
      const rawTy = actor.position.y
      if (this.canDashToward(actor, rawTx, rawTy)) {
        const c = this.clampDashMoveTarget(actor, rawTx, rawTy)
        const reposition: BattleCommand = {
          commandId: newCommandId(),
          sessionId: this.session.id,
          actorId: actor.id,
          tick: executeAtTick,
          action: 'dash',
          targetId: target.id,
          metadata: {
            moveTargetX: c.x,
            moveTargetY: c.y,
            moveStep: 2.3,
          },
        }
        this.enqueueIntentCommand(reposition, mode, 'player_dash_kite')
        return
      }
      // 无法后撤时允许本 tick 继续出手，避免与技能队列死锁
    }

    if (executeAtTick < this.nextPlayerDue) return
    this.nextPlayerDue = executeAtTick + this.playerInterval

    if (!selectedSkill || chosen === BASIC_ATTACK.id || !action) {
      // 与引擎 basic_attack 判定一致；避免「位移差一点仍 >1.6」时入队普攻被拒刷屏
      if (dist > MELEE_RANGE) {
        return
      }
      const cmd: BattleCommand = {
        commandId: newCommandId(),
        sessionId: this.session.id,
        actorId: actor.id,
        tick: executeAtTick,
        action: 'basic_attack',
        targetId: target.id,
      }
      this.enqueueIntentCommand(cmd, mode, 'player_basic_attack')
      input.onClearQueuedSkill?.()
      return
    }

    if (action === 'defend') {
      const cmd: BattleCommand = {
        commandId: newCommandId(),
        sessionId: this.session.id,
        actorId: actor.id,
        tick: executeAtTick,
        action: 'defend',
      }
      this.enqueueIntentCommand(cmd, mode, 'player_defend')
      if (selectedSkill.cooldownTicks > 0) {
        input.onSkillCooldown?.(selectedSkill.id, cooldownMsFromTicks(selectedSkill.cooldownTicks))
      }
      input.onClearQueuedSkill?.()
      return
    }

    if (action === 'cast_skill' && selectedSkill.coreSkillId) {
      const cmd: BattleCommand = {
        commandId: newCommandId(),
        sessionId: this.session.id,
        actorId: actor.id,
        tick: executeAtTick,
        action: 'cast_skill',
        targetId: target.id,
        skillId: selectedSkill.coreSkillId,
      }
      this.enqueueIntentCommand(cmd, mode, 'player_cast_skill')
      // 冷却在 GameMap 于 action_executed(cast_skill) 时再写 UI，避免入队后遭拒绝仍进入冷却
      // 不在入队时清空 nextAttackSkillId：拒绝时由 GameMap 清队列；成功施放亦在 action_executed 时清空
      return
    }

    // 兜底：技能条里可能存在当前 map-battle 不可执行的条目（无 coreSkillId 或 action 不匹配）。
    // 若直接 return 会导致 nextAttackSkillId 长期不清空，玩家回合持续空转“看起来打不出伤害”。
    if (dist > MELEE_RANGE) {
      input.onClearQueuedSkill?.()
      return
    }
    const fallback: BattleCommand = {
      commandId: newCommandId(),
      sessionId: this.session.id,
      actorId: actor.id,
      tick: executeAtTick,
      action: 'basic_attack',
      targetId: target.id,
    }
    this.enqueueIntentCommand(fallback, mode, 'player_basic_attack_fallback')
    input.onClearQueuedSkill?.()
    return
  }

  private enqueueIntentCommand(command: BattleCommand, strategy: TacticalMode, reason: string): void {
    const nextCommand: BattleCommand = {
      ...command,
      metadata: {
        ...(command.metadata || {}),
        strategy,
        reason,
      },
    }
    this.session = enqueueBattleCommand(this.session, nextCommand)
  }
}
