import { V3_CONTENT } from '@/src/content/generated/v3'

import type { V3ActorId, V3BattleState } from './types'

export type V3BattleInsight = {
  kind: 'strength' | 'adjustment'
  title: string
  detail: string
}

export type V3BattleAnalysis = {
  damageBySkill: Array<{ skillId: string | null; damage: number; hits: number }>
  rejectedActions: number
  decisiveTick: number | null
  insights: V3BattleInsight[]
}

function displaySkill(skillId: string | null): string {
  return skillId ? V3_CONTENT.skills[skillId]?.name ?? '未知技能' : '普通攻击'
}

function decisiveTick(state: V3BattleState): number | null {
  const loser: V3ActorId | null = state.result === 'left_win'
    ? 'right'
    : state.result === 'right_win'
      ? 'left'
      : null
  if (!loser) return null
  let hp = state.actors[loser].maxHp
  let tick: number | null = null
  for (const event of state.events) {
    if (event.type === 'heal' && event.actorId === loser) {
      hp = Math.min(state.actors[loser].maxHp, hp + (event.amount ?? 0))
    }
    if (event.type === 'damage' && event.targetId === loser) {
      hp -= event.amount ?? 0
      if (hp <= 0) tick = event.tick
    }
  }
  return tick
}

export function analyzeBattle(state: V3BattleState): V3BattleAnalysis {
  const damage = new Map<string | null, { skillId: string | null; damage: number; hits: number }>()
  const leftDamageEvents = state.events.filter((event) => event.type === 'damage' && event.actorId === 'left')
  for (const event of leftDamageEvents) {
    const skillId = event.skillId ?? null
    const current = damage.get(skillId) ?? { skillId, damage: 0, hits: 0 }
    current.damage += event.amount ?? 0
    current.hits += 1
    damage.set(skillId, current)
  }
  const damageBySkill = [...damage.values()].sort((left, right) => (
    right.damage - left.damage
    || (left.skillId ?? '').localeCompare(right.skillId ?? '')
  ))

  const rejected = state.events.filter((event) => event.type === 'action_rejected' && event.actorId === 'left')
  const outOfRange = rejected.filter((event) => event.rejectCode === 'out_of_range')
  const incoming = state.events
    .filter((event) => event.type === 'damage' && event.actorId === 'right' && event.targetId === 'left')
    .sort((left, right) => (right.amount ?? 0) - (left.amount ?? 0) || left.tick - right.tick)
  const totalDamage = damageBySkill.reduce((sum, entry) => sum + entry.damage, 0)
  const insights: V3BattleInsight[] = []

  if (state.result === 'left_win') {
    const top = damageBySkill[0]
    if (top) {
      insights.push({
        kind: 'strength',
        title: '核心输出',
        detail: `${displaySkill(top.skillId)}命中 ${top.hits} 次，累计造成 ${top.damage} 点伤害，是本场最高伤害来源。`,
      })
    }
    if (rejected.length === 0) {
      insights.push({
        kind: 'strength',
        title: '行动稳定',
        detail: '本场没有行动被安全规则修正，技能距离与能量安排保持有效。',
      })
    }
    if (state.patchRecords.length > 0) {
      insights.push({
        kind: 'strength',
        title: '策略响应',
        detail: `AI 共完成 ${state.patchRecords.length} 次策略校验，并在战况变化后继续执行。`,
      })
    }
  } else {
    if (outOfRange.length > 0) {
      const names = [...new Set(outOfRange.map((event) => displaySkill(event.skillId ?? null)))]
      insights.push({
        kind: 'adjustment',
        title: '提前处理距离',
        detail: `${names.join('、')}共有 ${outOfRange.length} 次因距离不足未执行；提高远程技能优先级或更早调整站位。`,
      })
    }
    const burst = incoming[0]
    if (burst) {
      insights.push({
        kind: 'adjustment',
        title: '应对爆发伤害',
        detail: `对手的${displaySkill(burst.skillId ?? null)}单次造成 ${burst.amount ?? 0} 点伤害；在该技能出手前保留护盾或防守行动。`,
      })
    }
    if (totalDamage === 0) {
      insights.push({
        kind: 'adjustment',
        title: '建立有效输出',
        detail: '本场记录的有效伤害为 0 点；先确保至少一个远程技能能稳定命中，再安排近距离终结技。',
      })
    } else if (damageBySkill[0]) {
      const top = damageBySkill[0]
      insights.push({
        kind: 'adjustment',
        title: '放大有效输出',
        detail: `${displaySkill(top.skillId)}已造成 ${top.damage} 点伤害；围绕这一技能调整优先级，减少低收益行动。`,
      })
    }
    if (insights.length === 0) {
      insights.push({
        kind: 'adjustment',
        title: '提高行动转化',
        detail: `本场共有 ${rejected.length} 次行动被修正；检查技能冷却、能量和目标条件后再战。`,
      })
    }
  }

  return {
    damageBySkill,
    rejectedActions: rejected.length,
    decisiveTick: decisiveTick(state),
    insights: insights.slice(0, 3),
  }
}
