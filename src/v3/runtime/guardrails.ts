import { V3_CONTENT, type V3Point } from '@/src/content/generated/v3'

import type {
  V3ActionValidation,
  V3ActorId,
  V3BattleAction,
  V3BattleState,
} from './types'

export function otherActor(actorId: V3ActorId): V3ActorId {
  return actorId === 'left' ? 'right' : 'left'
}

export function gridDistance(a: V3Point, b: V3Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function isBlocked(state: V3BattleState, point: V3Point): boolean {
  if (point.x < 0 || point.y < 0 || point.x >= state.map.width || point.y >= state.map.height) return true
  if (state.map.obstacles.some(([x, y]) => x === point.x && y === point.y)) return true
  return Object.values(state.actors).some((actor) => actor.hp > 0 && actor.position.x === point.x && actor.position.y === point.y)
}

export function validateAction(state: V3BattleState, action: V3BattleAction): V3ActionValidation {
  if (state.result !== 'ongoing') return { ok: false, code: 'battle_over' }
  const actor = state.actors[action.actorId]
  if (actor.hp <= 0) return { ok: false, code: 'actor_down' }

  if (action.kind === 'guard' || action.kind === 'wait') return { ok: true }

  if (action.kind === 'move') {
    if (actor.statuses.some((status) => status.kind === 'root' && status.ticks > 0)) return { ok: false, code: 'rooted' }
    const distance = gridDistance(actor.position, action.to)
    if (distance < 1 || distance > V3_CONTENT.rules.moveTiles) return { ok: false, code: 'invalid_destination' }
    if (isBlocked(state, action.to)) return { ok: false, code: 'blocked_destination' }
    return { ok: true }
  }

  const target = state.actors[action.targetId]
  if (target.hp <= 0) return { ok: false, code: 'target_down' }
  if (action.kind === 'basic') {
    return gridDistance(actor.position, target.position) <= 1 ? { ok: true } : { ok: false, code: 'out_of_range' }
  }

  const skill = V3_CONTENT.skills[action.skillId]
  if (!skill) return { ok: false, code: 'unknown_skill' }
  if (!actor.skillIds.includes(skill.id)) return { ok: false, code: 'not_equipped' }
  if ((actor.cooldowns[skill.id] ?? 0) > 0) return { ok: false, code: 'cooldown' }
  if (actor.energy < skill.energyCost) return { ok: false, code: 'insufficient_energy' }
  if (skill.moveTiles > 0 || skill.range === 0) return { ok: true }
  return gridDistance(actor.position, target.position) <= skill.range
    ? { ok: true }
    : { ok: false, code: 'out_of_range' }
}

function stepToward(state: V3BattleState, actorId: V3ActorId): V3Point | null {
  const actor = state.actors[actorId]
  const target = state.actors[otherActor(actorId)]
  const key = (point: V3Point) => `${point.x},${point.y}`
  const start = { ...actor.position }
  const queue: V3Point[] = [start]
  const previous = new Map<string, V3Point | null>([[key(start), null]])
  let destination: V3Point | null = null

  while (queue.length > 0) {
    const current = queue.shift()!
    if (key(current) !== key(start) && gridDistance(current, target.position) <= 1) {
      destination = current
      break
    }

    const dx = Math.sign(target.position.x - current.x)
    const dy = Math.sign(target.position.y - current.y)
    const offsets = [
      { x: dx, y: 0 },
      { x: 0, y: dy },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
    ].filter((offset, index, values) => (
      (offset.x !== 0 || offset.y !== 0)
      && values.findIndex((value) => value.x === offset.x && value.y === offset.y) === index
    ))

    for (const offset of offsets) {
      const next = { x: current.x + offset.x, y: current.y + offset.y }
      const nextKey = key(next)
      if (previous.has(nextKey)) continue
      if (isBlocked(state, next)) continue
      previous.set(nextKey, current)
      queue.push(next)
    }
  }

  if (!destination) return null
  let step = destination
  let parent = previous.get(key(step)) ?? null
  while (parent && key(parent) !== key(start)) {
    step = parent
    parent = previous.get(key(step)) ?? null
  }
  return validateAction(state, { actorId, kind: 'move', to: step }).ok ? step : null
}

export function chooseSafeFallbackAction(state: V3BattleState, actorId: V3ActorId): V3BattleAction {
  const actor = state.actors[actorId]
  const targetId = otherActor(actorId)
  const offensive = actor.skillIds
    .map((skillId) => V3_CONTENT.skills[skillId])
    .filter((skill) => skill && skill.power > 0)
    .sort((a, b) => b.power - a.power)

  for (const skill of offensive) {
    const action: V3BattleAction = { actorId, kind: 'skill', skillId: skill.id, targetId }
    if (validateAction(state, action).ok) return action
  }

  const basic: V3BattleAction = { actorId, kind: 'basic', targetId }
  if (validateAction(state, basic).ok) return basic
  const destination = stepToward(state, actorId)
  if (destination) return { actorId, kind: 'move', to: destination }
  return actor.hp / actor.maxHp < 0.5 ? { actorId, kind: 'guard' } : { actorId, kind: 'wait' }
}
