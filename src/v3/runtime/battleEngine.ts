import { V3_CONTENT, type V3BehaviorTreeState, type V3CombatantTemplate } from '@/src/content/generated/v3'

import { applyBehaviorTreePatch, evaluateBehaviorTree } from './behaviorTree'
import { chooseSafeFallbackAction, gridDistance, otherActor, validateAction } from './guardrails'
import { nextRandom } from './rng'
import type {
  V3ActorId,
  V3ActorState,
  V3BattleAction,
  V3BattleConfig,
  V3BattleEvent,
  V3BattleState,
  V3BehaviorTreePatch,
} from './types'

function cloneTree(tree: V3BehaviorTreeState): V3BehaviorTreeState {
  return {
    ...tree,
    nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, { ...node, children: node.children ? [...node.children] : undefined }])),
  }
}

function actorTemplate(side: V3BattleConfig['left']): V3CombatantTemplate {
  const template = side.templateType === 'job' ? V3_CONTENT.jobs[side.templateId] : V3_CONTENT.enemies[side.templateId]
  if (!template) throw new Error(`Unknown combatant template: ${side.templateType}:${side.templateId}`)
  return template
}

function createActor(id: V3ActorId, config: V3BattleConfig['left'], position: { x: number; y: number }): V3ActorState {
  const template = actorTemplate(config)
  return {
    id,
    templateId: template.id,
    name: template.name,
    visualAssetId: template.visualAssetId,
    hp: template.hp,
    maxHp: template.hp,
    energy: template.energy,
    maxEnergy: template.energy,
    shield: 0,
    atk: template.atk,
    def: template.def,
    spd: template.spd,
    position: { ...position },
    skillIds: [...config.skillIds],
    cooldowns: {},
    statuses: [],
    guarding: false,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    skillsUsed: 0,
  }
}

export function createBattle(config: V3BattleConfig): V3BattleState {
  const map = V3_CONTENT.maps[config.mapId]
  if (!map || map.kind !== 'battle') throw new Error(`Unknown battle map: ${config.mapId}`)
  const leftTree = V3_CONTENT.trees[config.left.treeId]?.tree
  const rightTree = V3_CONTENT.trees[config.right.treeId]?.tree
  if (!leftTree || !rightTree) throw new Error('Unknown behavior tree')
  const leftSpawn = map.spawns.left
  const rightSpawn = map.spawns.right
  if (!leftSpawn || !rightSpawn) throw new Error('Battle map is missing actor spawns')

  return {
    initialConfig: JSON.parse(JSON.stringify(config)) as V3BattleConfig,
    map,
    actors: {
      left: createActor('left', config.left, leftSpawn),
      right: createActor('right', config.right, rightSpawn),
    },
    trees: { left: cloneTree(leftTree), right: cloneTree(rightTree) },
    tick: 0,
    maxDecisionTicks: config.maxDecisionTicks,
    seed: config.seed >>> 0,
    result: 'ongoing',
    endReason: null,
    events: [],
    patchRecords: [],
    history: [],
  }
}

function cloneState(state: V3BattleState): V3BattleState {
  return {
    ...state,
    actors: {
      left: { ...state.actors.left, position: { ...state.actors.left.position }, skillIds: [...state.actors.left.skillIds], cooldowns: { ...state.actors.left.cooldowns }, statuses: state.actors.left.statuses.map((status) => ({ ...status })) },
      right: { ...state.actors.right, position: { ...state.actors.right.position }, skillIds: [...state.actors.right.skillIds], cooldowns: { ...state.actors.right.cooldowns }, statuses: state.actors.right.statuses.map((status) => ({ ...status })) },
    },
    trees: { left: cloneTree(state.trees.left), right: cloneTree(state.trees.right) },
    events: [...state.events],
    patchRecords: [...state.patchRecords],
    history: [...state.history],
  }
}

function pushEvent(state: V3BattleState, event: Omit<V3BattleEvent, 'id' | 'tick' | 'sequence'>): void {
  const sequence = state.events.filter((item) => item.tick === state.tick).length
  state.events.push({ ...event, id: `v3-${state.tick}-${sequence}-${event.type}`, tick: state.tick, sequence })
}

function effectiveStat(actor: V3ActorState, kind: 'atk' | 'def'): number {
  const debuff = actor.statuses.find((status) => status.kind === `${kind}_down`)
  return Math.max(1, actor[kind] * (1 - (debuff?.value ?? 0)))
}

function rollDamage(state: V3BattleState, actor: V3ActorState, target: V3ActorState, power: number): number {
  const random = nextRandom(state.seed)
  state.seed = random.seed
  const variance = 0.92 + random.value * 0.16
  return Math.max(1, Math.round((effectiveStat(actor, 'atk') * power - effectiveStat(target, 'def') * 0.42) * variance))
}

function dealDamage(state: V3BattleState, actor: V3ActorState, target: V3ActorState, amount: number, skillId?: string): void {
  let remaining = amount
  if (target.guarding) {
    remaining = Math.max(1, Math.round(remaining * (1 - V3_CONTENT.rules.guardReduction)))
    target.guarding = false
  }
  const absorbed = Math.min(target.shield, remaining)
  target.shield -= absorbed
  remaining -= absorbed
  target.hp = Math.max(0, target.hp - remaining)
  actor.damageDealt += remaining
  target.damageTaken += remaining
  pushEvent(state, { type: 'damage', actorId: actor.id, targetId: target.id, skillId, amount: remaining, message: `${actor.name} 造成 ${remaining} 伤害` })
}

function moveToward(state: V3BattleState, actorId: V3ActorId, tiles: number): void {
  const actor = state.actors[actorId]
  const target = state.actors[otherActor(actorId)]
  for (let index = 0; index < tiles; index += 1) {
    if (gridDistance(actor.position, target.position) <= 1) break
    const dx = Math.sign(target.position.x - actor.position.x)
    const dy = Math.sign(target.position.y - actor.position.y)
    const candidates = [
      { x: actor.position.x + dx, y: actor.position.y },
      { x: actor.position.x, y: actor.position.y + dy },
    ]
    const next = candidates.find((point) => validateAction(state, { actorId, kind: 'move', to: point }).ok)
    if (!next) break
    actor.position = next
  }
  pushEvent(state, { type: 'move', actorId, position: { ...actor.position }, message: `${actor.name} 移动` })
}

function executeAction(state: V3BattleState, action: V3BattleAction): void {
  const actor = state.actors[action.actorId]
  pushEvent(state, { type: 'action', actorId: actor.id, targetId: 'targetId' in action ? action.targetId : undefined, skillId: action.kind === 'skill' ? action.skillId : undefined, message: `${actor.name}: ${action.kind}` })

  if (action.kind === 'wait') return
  if (action.kind === 'guard') {
    actor.guarding = true
    pushEvent(state, { type: 'guard', actorId: actor.id, message: `${actor.name} 进入防御` })
    return
  }
  if (action.kind === 'move') {
    actor.position = { ...action.to }
    pushEvent(state, { type: 'move', actorId: actor.id, position: { ...action.to }, message: `${actor.name} 移动` })
    return
  }

  const target = state.actors[action.targetId]
  if (action.kind === 'basic') {
    dealDamage(state, actor, target, rollDamage(state, actor, target, 1))
    return
  }

  const skill = V3_CONTENT.skills[action.skillId]
  actor.energy -= skill.energyCost
  actor.cooldowns[skill.id] = skill.cooldownTicks
  actor.skillsUsed += 1
  if (skill.moveTiles > 0) moveToward(state, actor.id, skill.moveTiles)
  if (skill.power > 0 && gridDistance(actor.position, target.position) <= Math.max(1, skill.range)) {
    dealDamage(state, actor, target, rollDamage(state, actor, target, skill.power), skill.id)
  }
  if (skill.shield > 0) {
    actor.shield += skill.shield
    pushEvent(state, { type: 'shield', actorId: actor.id, skillId: skill.id, amount: skill.shield, message: `${actor.name} 获得 ${skill.shield} 护盾` })
  }
  if (skill.heal > 0) {
    const healed = Math.min(skill.heal, actor.maxHp - actor.hp)
    actor.hp += healed
    actor.healingDone += healed
    pushEvent(state, { type: 'heal', actorId: actor.id, skillId: skill.id, amount: healed, message: `${actor.name} 恢复 ${healed} 生命` })
  }
  if (skill.status !== 'none' && skill.statusTicks > 0 && target.hp > 0) {
    target.statuses = target.statuses.filter((status) => status.kind !== skill.status)
    target.statuses.push({ kind: skill.status, ticks: skill.statusTicks, value: skill.statusValue })
    pushEvent(state, { type: 'status', actorId: actor.id, targetId: target.id, skillId: skill.id, message: `${target.name} 获得 ${skill.status}` })
  }
}

function advanceActorTimers(actor: V3ActorState): void {
  actor.cooldowns = Object.fromEntries(Object.entries(actor.cooldowns).map(([id, value]) => [id, Math.max(0, value - 1)]))
  actor.statuses = actor.statuses.map((status) => ({ ...status, ticks: status.ticks - 1 })).filter((status) => status.ticks > 0)
  actor.energy = Math.min(actor.maxEnergy, actor.energy + 8)
}

function finishIfNeeded(state: V3BattleState): void {
  const leftAlive = state.actors.left.hp > 0
  const rightAlive = state.actors.right.hp > 0
  if (!leftAlive || !rightAlive) {
    state.result = leftAlive ? 'left_win' : rightAlive ? 'right_win' : 'draw'
    state.endReason = 'hp_zero'
  } else if (state.tick >= state.maxDecisionTicks) {
    state.result = 'draw'
    state.endReason = 'max_tick'
  }
  if (state.result !== 'ongoing') {
    pushEvent(state, { type: 'result', message: `${state.result}:${state.endReason}` })
  }
}

export function resolveDecisionTick(
  input: V3BattleState,
  decisions: Record<V3ActorId, V3BehaviorTreePatch | null>,
): V3BattleState {
  if (input.result !== 'ongoing') return input
  const state = cloneState(input)
  state.history.push({ tick: state.tick, decisions: JSON.parse(JSON.stringify(decisions)) as Record<V3ActorId, V3BehaviorTreePatch | null> })
  advanceActorTimers(state.actors.left)
  advanceActorTimers(state.actors.right)

  for (const actorId of ['left', 'right'] as const) {
    const patch = decisions[actorId]
    if (!patch) continue
    const applied = applyBehaviorTreePatch(
      state.trees[actorId],
      patch,
      state.tick,
      V3_CONTENT.rules.maxPatchOps,
      state.actors[actorId].skillIds,
    )
    state.trees[actorId] = applied.tree
    state.patchRecords.push(applied.record)
    pushEvent(state, { type: 'patch', actorId, message: `${applied.status}:${patch.reason}` })
  }

  const order: V3ActorId[] = ['left', 'right']
  order.sort((a, b) => state.actors[b].spd - state.actors[a].spd || a.localeCompare(b))
  for (const actorId of order) {
    if (state.actors[actorId].hp <= 0 || state.actors[otherActor(actorId)].hp <= 0) continue
    const proposed = evaluateBehaviorTree(state, actorId)
    const action = validateAction(state, proposed).ok ? proposed : chooseSafeFallbackAction(state, actorId)
    executeAction(state, action)
  }

  state.tick += 1
  finishIfNeeded(state)
  return state
}

export { validateAction } from './guardrails'
