import { V3_CONTENT } from '@/src/content/generated/v3'
import type {
  V3ActorId,
  V3BattleEvent,
  V3BattleState,
  V3BehaviorTreePatchOperation,
  V3PatchStatus,
} from '@/src/v3/runtime/types'

const REJECTION_TEXT: Record<string, string> = {
  battle_over: '战斗已经结束',
  actor_down: '行动者已经倒下',
  target_down: '目标已经倒下',
  unknown_skill: '无法识别该技能',
  not_equipped: '未装备该技能',
  cooldown: '技能仍在冷却',
  insufficient_energy: '能量不足',
  out_of_range: '目标超出范围',
  rooted: '受到束缚，无法移动',
  blocked_destination: '目标位置被阻挡',
  invalid_destination: '目标位置不可到达',
}

function actorName(actorId: V3ActorId | undefined, battle: V3BattleState): string {
  return actorId ? battle.actors[actorId].name : '战斗'
}

function targetName(actorId: V3ActorId | undefined, battle: V3BattleState): string {
  return actorId ? battle.actors[actorId].name : '目标'
}

function skillName(skillId: string | undefined): string {
  return skillId ? V3_CONTENT.skills[skillId]?.name ?? '未知技能' : '技能'
}

export function playerPatchStatusText(status: V3PatchStatus | undefined): string {
  if (status === 'accepted') return '策略已调整'
  if (status === 'rejected') return '策略未通过校验'
  if (status === 'stale') return '策略版本已过期'
  if (status === 'timeout') return '策略计算超时'
  return '本回合未调整策略'
}

export function playerPatchOperationText(operation: V3BehaviorTreePatchOperation): string {
  if (operation.kind === 'set_threshold') return '调整判断阈值'
  if (operation.kind === 'set_action') return `更换行动为${skillName(operation.skillId)}`
  return '调整策略优先级'
}

export function playerEventLabel(event: V3BattleEvent): string {
  const labels: Record<V3BattleEvent['type'], string> = {
    patch: '策略调整',
    action: '行动',
    action_rejected: '行动修正',
    damage: '伤害',
    heal: '治疗',
    shield: '护盾',
    status: '状态变化',
    move: '移动',
    guard: '防守',
    result: '战斗结果',
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
    return reason ? `${label}：${reason}` : label
  }
  if (event.type === 'action_rejected') {
    return `${actor}的行动未执行：${REJECTION_TEXT[event.rejectCode ?? ''] ?? '行动不符合当前条件'}，已改用安全行动`
  }
  if (event.type === 'action') {
    if (event.actionKind === 'skill') return `${actor}施放${skillName(event.skillId)}`
    if (event.actionKind === 'basic') return `${actor}进行普通攻击`
    if (event.actionKind === 'move') return `${actor}调整站位`
    if (event.actionKind === 'guard') return `${actor}选择防守`
    return `${actor}等待时机`
  }
  if (event.type === 'damage') {
    const source = event.skillId ? `${skillName(event.skillId)}对` : ''
    return `${actor}的${source}${target}造成 ${event.amount ?? 0} 点伤害`
  }
  if (event.type === 'heal') return `${actor}恢复 ${event.amount ?? 0} 点生命`
  if (event.type === 'shield') return `${actor}获得 ${event.amount ?? 0} 点护盾`
  if (event.type === 'move') return `${actor}移动到 ${event.position?.x ?? 0},${event.position?.y ?? 0}`
  if (event.type === 'guard') return `${actor}进入防守姿态`
  if (event.type === 'status') {
    const status = event.skillId ? V3_CONTENT.skills[event.skillId]?.status : undefined
    const statusText = status === 'root' ? '束缚' : status === 'atk_down' ? '攻击降低' : status === 'def_down' ? '防御降低' : '状态变化'
    return `${target}受到${statusText}`
  }
  if (battle.result === 'left_win') return '我方赢得战斗，对手生命值归零'
  if (battle.result === 'right_win') return '对手赢得战斗，我方生命值归零'
  if (battle.endReason === 'max_tick') return '达到最大回合数，战斗以平局结束'
  if (battle.result === 'draw') return '双方同时倒下，战斗以平局结束'
  return '战斗因状态异常结束'
}

export function playerNodeText(
  nodeId: string | undefined,
  actorId: V3ActorId,
  battle: V3BattleState,
): string {
  if (!nodeId) return '沿用安全策略'
  const node = battle.trees[actorId].nodes[nodeId]
  if (!node) return '沿用安全策略'
  if (node.kind === 'selector') return '按优先级寻找可用行动'
  if (node.kind === 'sequence') return '连续检查行动条件'
  if (node.kind === 'condition') {
    if (node.metric === 'self_hp_ratio') return '检查自身生命状态'
    if (node.metric === 'enemy_hp_ratio') return '检查对手生命状态'
    if (node.metric === 'enemy_rooted') return '检查对手是否受到束缚'
    if (node.metric === 'distance') return '检查双方距离'
    return '检查当前战况'
  }
  if (node.action === 'skill') return `尝试施放${skillName(node.skillId)}`
  if (node.action === 'best_attack') return '选择当前最佳进攻'
  if (node.action === 'move') return '调整到更有利的位置'
  if (node.action === 'guard') return '降低即将受到的伤害'
  return '等待更合适的行动时机'
}
