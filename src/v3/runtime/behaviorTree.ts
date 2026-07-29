import { V3_CONTENT, type V3BehaviorNode, type V3BehaviorTreeState } from '@/src/content/generated/v3'

import { chooseSafeFallbackAction, gridDistance, otherActor } from './guardrails'
import type {
  V3ActorId,
  V3BattleAction,
  V3BattleState,
  V3BehaviorTrace,
  V3BehaviorTreePatch,
  V3PatchRecord,
} from './types'

type PatchResult = { tree: V3BehaviorTreeState; record: V3PatchRecord; status: V3PatchRecord['status'] }

function cloneTree(tree: V3BehaviorTreeState): V3BehaviorTreeState {
  return {
    ...tree,
    nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, { ...node, children: node.children ? [...node.children] : undefined }])),
  }
}

export function applyBehaviorTreePatch(
  tree: V3BehaviorTreeState,
  patch: V3BehaviorTreePatch,
  expectedTick: number,
  maxPatchOps: number,
  equippedSkillIds: string[],
): PatchResult {
  const recordBase = {
    actorId: patch.actorId,
    decisionTick: patch.decisionTick,
    baseTreeVersion: patch.baseTreeVersion,
    resultingTreeVersion: tree.version,
    reason: patch.reason,
    ops: patch.ops,
  }
  if (patch.decisionTick !== expectedTick) {
    return { tree, status: 'stale', record: { ...recordBase, status: 'stale', rejectCode: 'stale_tick' } }
  }
  if (patch.baseTreeVersion !== tree.version) {
    return { tree, status: 'stale', record: { ...recordBase, status: 'stale', rejectCode: 'stale_tree' } }
  }
  if (patch.ops.length < 1 || patch.ops.length > maxPatchOps) {
    return { tree, status: 'rejected', record: { ...recordBase, status: 'rejected', rejectCode: 'op_count' } }
  }

  const next = cloneTree(tree)
  for (const op of patch.ops) {
    const node = next.nodes[op.nodeId]
    if (!node) return { tree, status: 'rejected', record: { ...recordBase, status: 'rejected', rejectCode: 'unknown_node' } }
    if (op.kind === 'set_threshold') {
      if (node.kind !== 'condition' || !Number.isFinite(op.value)) {
        return { tree, status: 'rejected', record: { ...recordBase, status: 'rejected', rejectCode: 'invalid_threshold' } }
      }
      node.value = op.value
    } else if (op.kind === 'set_action') {
      if (node.kind !== 'action' || !equippedSkillIds.includes(op.skillId) || !V3_CONTENT.skills[op.skillId]) {
        return { tree, status: 'rejected', record: { ...recordBase, status: 'rejected', rejectCode: 'invalid_action' } }
      }
      node.action = 'skill'
      node.skillId = op.skillId
    } else {
      const original = node.children ?? []
      if ((node.kind !== 'selector' && node.kind !== 'sequence') || op.childIds.length !== original.length) {
        return { tree, status: 'rejected', record: { ...recordBase, status: 'rejected', rejectCode: 'invalid_reorder' } }
      }
      const expected = [...original].sort().join('|')
      if ([...op.childIds].sort().join('|') !== expected) {
        return { tree, status: 'rejected', record: { ...recordBase, status: 'rejected', rejectCode: 'invalid_reorder' } }
      }
      node.children = [...op.childIds]
    }
  }

  next.version += 1
  return {
    tree: next,
    status: 'accepted',
    record: { ...recordBase, status: 'accepted', resultingTreeVersion: next.version },
  }
}

function conditionValue(state: V3BattleState, actorId: V3ActorId, node: V3BehaviorNode): number {
  const actor = state.actors[actorId]
  const enemy = state.actors[otherActor(actorId)]
  switch (node.metric) {
    case 'self_hp_ratio': return actor.hp / actor.maxHp
    case 'enemy_hp_ratio': return enemy.hp / enemy.maxHp
    case 'enemy_rooted': return enemy.statuses.some((status) => status.kind === 'root' && status.ticks > 0) ? 1 : 0
    case 'distance': return gridDistance(actor.position, enemy.position)
    default: return 0
  }
}

function conditionPasses(state: V3BattleState, actorId: V3ActorId, node: V3BehaviorNode): boolean {
  const current = conditionValue(state, actorId, node)
  const expected = node.value ?? 0
  if (node.op === 'gte') return current >= expected
  if (node.op === 'eq') return current === expected
  return current <= expected
}

function actionForNode(state: V3BattleState, actorId: V3ActorId, node: V3BehaviorNode): V3BattleAction | null {
  const targetId = otherActor(actorId)
  if (node.action === 'skill' && node.skillId) {
    const skill = V3_CONTENT.skills[node.skillId]
    const selfTarget = skill && skill.range === 0 && (skill.heal > 0 || skill.shield > 0)
    return { actorId, kind: 'skill', skillId: node.skillId, targetId: selfTarget ? actorId : targetId }
  }
  if (node.action === 'move') return chooseSafeFallbackAction(state, actorId)
  if (node.action === 'guard') return { actorId, kind: 'guard' }
  if (node.action === 'wait') return { actorId, kind: 'wait' }
  if (node.action === 'best_attack') return chooseSafeFallbackAction(state, actorId)
  return null
}

function evaluateNode(
  state: V3BattleState,
  actorId: V3ActorId,
  tree: V3BehaviorTreeState,
  nodeId: string,
  trace: V3BehaviorTrace,
): V3BattleAction | null {
  const node = tree.nodes[nodeId]
  if (!node) return null
  trace.visitedNodeIds.push(nodeId)
  if (node.kind === 'condition') return conditionPasses(state, actorId, node) ? { actorId, kind: 'wait' } : null
  if (node.kind === 'action') {
    const action = actionForNode(state, actorId, node)
    if (action) trace.selectedNodeId = nodeId
    return action
  }
  if (node.kind === 'selector') {
    for (const childId of node.children ?? []) {
      const action = evaluateNode(state, actorId, tree, childId, trace)
      if (action) return action
    }
    return null
  }
  for (const childId of node.children ?? []) {
    const child = tree.nodes[childId]
    if (!child) return null
    if (child.kind === 'condition') {
      trace.visitedNodeIds.push(childId)
      if (!conditionPasses(state, actorId, child)) return null
      continue
    }
    const action = evaluateNode(state, actorId, tree, childId, trace)
    if (action) return action
  }
  return null
}

export function evaluateBehaviorTree(state: V3BattleState, actorId: V3ActorId): V3BattleAction {
  return evaluateBehaviorTreeWithTrace(state, actorId).action
}

export function evaluateBehaviorTreeWithTrace(
  state: V3BattleState,
  actorId: V3ActorId,
): { action: V3BattleAction; trace: V3BehaviorTrace } {
  const trace: V3BehaviorTrace = { visitedNodeIds: [], selectedNodeId: null }
  const action = evaluateNode(state, actorId, state.trees[actorId], state.trees[actorId].rootId, trace)
    ?? chooseSafeFallbackAction(state, actorId)
  return { action, trace }
}
