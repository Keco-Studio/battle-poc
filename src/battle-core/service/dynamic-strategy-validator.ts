import { v4 as uuidv4 } from 'uuid'
import type { BattleSession } from '../domain/entities/battle-session'
import type { BattleCommand } from '../domain/types/command-types'
import { getBattleSkillDefinition } from '../content/skills/basic-skill-catalog'
import type { RawBattleDecision } from './auto-decision-engine'

export type ValidationResult = {
  ok: boolean
  command?: BattleCommand
  reason?: string
}

export function normalizeDecisionToCommand(input: {
  session: BattleSession
  actorId: string
  executeAtTick: number
  rawDecision: RawBattleDecision | null
}): ValidationResult {
  const actor = getActor(input.session, input.actorId)
  const target = getOpponent(input.session, input.actorId)
  if (!actor || !target) {
    return {
      ok: false,
      reason: 'actor_or_target_missing'
    }
  }

  if (!input.rawDecision?.action) {
    return {
      ok: false,
      reason: 'empty_decision'
    }
  }

  const action = String(input.rawDecision.action)
  if (!isAllowedAction(action)) {
    return {
      ok: false,
      reason: 'invalid_action'
    }
  }

  if (action === 'cast_skill') {
    const skillId = String(input.rawDecision.skillId || '')
    if (!skillId) {
      return {
        ok: false,
        reason: 'missing_skill'
      }
    }
    const slot = actor.skillSlots.find((item) => item.skillId === skillId)
    const skill = getBattleSkillDefinition(skillId)
    if (!slot || !skill) {
      return {
        ok: false,
        reason: 'skill_not_equipped_or_missing'
      }
    }
    const distance = getDistance(actor, target)
    if (slot.cooldownTick > input.session.tick || actor.resources.mp < skill.mpCost || distance > skill.range) {
      return {
        ok: false,
        reason: 'skill_not_ready'
      }
    }
    return {
      ok: true,
      command: buildCommand(
        input.session.id,
        actor.id,
        input.executeAtTick,
        'cast_skill',
        target.id,
        skill.id,
        sanitizeMetadata(input.rawDecision.metadata)
      )
    }
  }

  if (action === 'basic_attack') {
    return {
      ok: true,
      command: buildCommand(
        input.session.id,
        actor.id,
        input.executeAtTick,
        'basic_attack',
        target.id,
        undefined,
        sanitizeMetadata(input.rawDecision.metadata)
      )
    }
  }

  if (action === 'dash' || action === 'flee') {
    const metadata = sanitizeMetadata(input.rawDecision.metadata)
    return {
      ok: true,
      command: buildCommand(input.session.id, actor.id, input.executeAtTick, action, target.id, undefined, metadata)
    }
  }

  return {
    ok: true,
    command: buildCommand(input.session.id, actor.id, input.executeAtTick, action)
  }
}

function buildCommand(
  sessionId: string,
  actorId: string,
  tick: number,
  action: BattleCommand['action'],
  targetId?: string,
  skillId?: string,
  metadata?: Record<string, unknown>
): BattleCommand {
  const command: BattleCommand = {
    commandId: uuidv4(),
    sessionId,
    actorId,
    tick,
    action
  }
  if (targetId) command.targetId = targetId
  if (skillId) command.skillId = skillId
  if (metadata && Object.keys(metadata).length > 0) command.metadata = metadata
  return command
}

function sanitizeMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const source = metadata as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (typeof source.moveTargetX === 'number' && Number.isFinite(source.moveTargetX)) {
    out.moveTargetX = Number(source.moveTargetX)
  }
  if (typeof source.moveTargetY === 'number' && Number.isFinite(source.moveTargetY)) {
    out.moveTargetY = Number(source.moveTargetY)
  }
  if (typeof source.moveStep === 'number' && Number.isFinite(source.moveStep)) {
    out.moveStep = Math.max(0.4, Math.min(4.2, Number(source.moveStep)))
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function isAllowedAction(action: string): action is BattleCommand['action'] {
  return (
    action === 'basic_attack' ||
    action === 'cast_skill' ||
    action === 'defend' ||
    action === 'dash' ||
    action === 'dodge' ||
    action === 'flee'
  )
}

function getActor(session: BattleSession, actorId: string) {
  if (session.left.id === actorId) return session.left
  if (session.right.id === actorId) return session.right
  return undefined
}

function getOpponent(session: BattleSession, actorId: string) {
  if (session.left.id === actorId) return session.right
  if (session.right.id === actorId) return session.left
  return undefined
}

function getDistance(
  a: { position: { x: number; y: number } },
  b: { position: { x: number; y: number } }
): number {
  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  return Math.sqrt(dx * dx + dy * dy)
}


