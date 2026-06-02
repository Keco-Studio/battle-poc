import { v4 as uuidv4 } from 'uuid'
import type { BattleSession } from '../domain/entities/battle-session'
import type { BattleEntity } from '../domain/entities/battle-entity'
import type { BattleEvent } from '../domain/types/event-types'

export function updateEntity(session: BattleSession, entity: BattleEntity): BattleSession {
  if (session.left.id === entity.id) {
    return { ...session, left: entity }
  }
  if (session.right.id === entity.id) {
    return { ...session, right: entity }
  }
  return session
}

export function appendEvent(
  session: BattleSession,
  type: BattleEvent['type'],
  payload: Record<string, unknown>,
): BattleSession {
  const event: BattleEvent = {
    eventId: uuidv4(),
    sessionId: session.id,
    tick: session.tick,
    type,
    payload,
    createdAt: Date.now(),
  }
  return {
    ...session,
    events: [...session.events, event],
  }
}
