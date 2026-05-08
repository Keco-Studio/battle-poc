import type { BattleSession } from '../../domain/entities/battle-session'
import type { BattleEvent } from '../../domain/types/event-types'

export type ShortTermMemory = {
  actorId: string
  targetId: string
  windowSize: number
  recentEvents: BattleEvent[]
  recentActionSummary: string[]
  recentRejectReasons: Record<string, number>
  hpDelta: number
  targetHpDelta: number
}

/** Max executed-action lines merged into LLM `memorySummary` (after scanning recent events). */
export const MEMORY_SUMMARY_ACTION_LIMIT = 20

export function buildShortTermMemory(
  session: BattleSession,
  actorId: string,
  /** Recent raw events window; widen when fights emit many non-action events between strikes */
  windowSize = 200
): ShortTermMemory {
  const actor = session.left.id === actorId ? session.left : session.right
  const target = actor.id === session.left.id ? session.right : session.left
  const events = session.events.slice(-Math.max(1, windowSize))
  const rejectReasons: Record<string, number> = {}
  const actionSummary: string[] = []

  for (const event of events) {
    if (event.type === 'command_rejected') {
      const reason = String(event.payload.reason || 'unknown')
      rejectReasons[reason] = (rejectReasons[reason] || 0) + 1
    }
    if (event.type === 'action_executed') {
      const action = String(event.payload.action || 'unknown')
      const who = String(event.payload.actorId || 'unknown')
      actionSummary.push(`${who}:${action}@${event.tick}`)
    }
  }

  const hpDelta = actor.resources.hp - actor.resources.maxHp
  const targetHpDelta = target.resources.hp - target.resources.maxHp

  return {
    actorId: actor.id,
    targetId: target.id,
    windowSize,
    recentEvents: events,
    recentActionSummary: actionSummary.slice(-MEMORY_SUMMARY_ACTION_LIMIT),
    recentRejectReasons: rejectReasons,
    hpDelta,
    targetHpDelta
  }
}

