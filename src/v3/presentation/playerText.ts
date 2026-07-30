import { V3_CONTENT } from '@/src/content/generated/v3'
import type {
  V3ActorId,
  V3BattleEvent,
  V3BattleState,
  V3BehaviorTreePatchOperation,
  V3PatchStatus,
} from '@/src/v3/runtime/types'

const REJECTION_TEXT: Record<string, string> = {
  battle_over: 'The battle is already over',
  actor_down: 'The actor has already fallen',
  target_down: 'The target has already fallen',
  unknown_skill: 'Unrecognized skill',
  not_equipped: 'Skill is not equipped',
  cooldown: 'Skill is still on cooldown',
  insufficient_energy: 'Not enough energy',
  out_of_range: 'Target is out of range',
  rooted: 'Rooted and unable to move',
  blocked_destination: 'Destination is blocked',
  invalid_destination: 'Destination is unreachable',
}

function actorName(actorId: V3ActorId | undefined, battle: V3BattleState): string {
  return actorId ? battle.actors[actorId].name : 'Battle'
}

function targetName(actorId: V3ActorId | undefined, battle: V3BattleState): string {
  return actorId ? battle.actors[actorId].name : 'Target'
}

function skillName(skillId: string | undefined): string {
  return skillId ? V3_CONTENT.skills[skillId]?.name ?? 'Unknown skill' : 'Skill'
}

export function playerPatchStatusText(status: V3PatchStatus | undefined): string {
  if (status === 'accepted') return 'Strategy adjusted'
  if (status === 'rejected') return 'Strategy failed validation'
  if (status === 'stale') return 'Strategy version is outdated'
  if (status === 'timeout') return 'Strategy computation timed out'
  return 'No strategy adjustment this turn'
}

export function playerPatchOperationText(operation: V3BehaviorTreePatchOperation): string {
  if (operation.kind === 'set_threshold') return 'Adjust decision threshold'
  if (operation.kind === 'set_action') return `Switch action to ${skillName(operation.skillId)}`
  return 'Adjust strategy priority'
}

export function playerEventLabel(event: V3BattleEvent): string {
  const labels: Record<V3BattleEvent['type'], string> = {
    patch: 'Strategy adjustment',
    action: 'Action',
    action_rejected: 'Action correction',
    damage: 'Damage',
    heal: 'Heal',
    shield: 'Shield',
    status: 'Status change',
    move: 'Move',
    guard: 'Guard',
    result: 'Battle result',
  }
  return labels[event.type]
}

export function playerEventText(event: V3BattleEvent, battle: V3BattleState): string {
  const actor = actorName(event.actorId, battle)
  const target = targetName(event.targetId, battle)
  if (event.type === 'patch') {
    const parsedStatus = event.message.split(':')[0] as V3PatchStatus
    const reason = event.message.includes(':') ? event.message.slice(event.message.indexOf(':') + 1) : ''
    const label = playerPatchStatusText(event.patchStatus ?? parsedStatus)
    return reason ? `${label}: ${reason}` : label
  }
  if (event.type === 'action_rejected') {
    return `${actor}'s action was not executed: ${REJECTION_TEXT[event.rejectCode ?? ''] ?? 'action did not meet current conditions'}, switched to a safe action`
  }
  if (event.type === 'action') {
    if (event.actionKind === 'skill') return `${actor} casts ${skillName(event.skillId)}`
    if (event.actionKind === 'basic') return `${actor} performs a basic attack`
    if (event.actionKind === 'move') return `${actor} repositions`
    if (event.actionKind === 'guard') return `${actor} chooses to guard`
    return `${actor} waits for an opening`
  }
  if (event.type === 'damage') {
    const source = event.skillId ? `${skillName(event.skillId)} ` : ''
    return `${actor}'s ${source}deals ${event.amount ?? 0} damage to ${target}`
  }
  if (event.type === 'heal') return `${actor} restores ${event.amount ?? 0} HP`
  if (event.type === 'shield') return `${actor} gains ${event.amount ?? 0} shield`
  if (event.type === 'move') return `${actor} moves to ${event.position?.x ?? 0},${event.position?.y ?? 0}`
  if (event.type === 'guard') return `${actor} enters a defensive stance`
  if (event.type === 'status') {
    const status = event.skillId ? V3_CONTENT.skills[event.skillId]?.status : undefined
    const statusText = status === 'root' ? 'Root' : status === 'atk_down' ? 'Attack down' : status === 'def_down' ? 'Defense down' : 'Status change'
    return `${target} is affected by ${statusText}`
  }
  if (battle.result === 'left_win') return 'Our side wins the battle; the opponent has been reduced to zero HP'
  if (battle.result === 'right_win') return 'The opponent wins the battle; our side has been reduced to zero HP'
  if (battle.endReason === 'max_tick') return 'Maximum turn count reached; the battle ends in a draw'
  if (battle.result === 'draw') return 'Both sides fell simultaneously; the battle ends in a draw'
  return 'The battle ended due to an abnormal state'
}

export function playerNodeText(
  nodeId: string | undefined,
  actorId: V3ActorId,
  battle: V3BattleState,
): string {
  if (!nodeId) return 'Follow the safe strategy'
  const node = battle.trees[actorId].nodes[nodeId]
  if (!node) return 'Follow the safe strategy'
  if (node.kind === 'selector') return 'Find an available action by priority'
  if (node.kind === 'sequence') return 'Check action conditions in sequence'
  if (node.kind === 'condition') {
    if (node.metric === 'self_hp_ratio') return 'Check own health status'
    if (node.metric === 'enemy_hp_ratio') return 'Check opponent health status'
    if (node.metric === 'enemy_rooted') return 'Check whether the opponent is rooted'
    if (node.metric === 'distance') return 'Check the distance between both sides'
    return 'Check the current battle situation'
  }
  if (node.action === 'skill') return `Try to cast ${skillName(node.skillId)}`
  if (node.action === 'best_attack') return 'Pick the best current offense'
  if (node.action === 'move') return 'Move to a more advantageous position'
  if (node.action === 'guard') return 'Reduce incoming damage'
  return 'Wait for a more suitable moment to act'
}
