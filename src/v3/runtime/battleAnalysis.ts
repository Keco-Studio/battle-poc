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
  return skillId ? V3_CONTENT.skills[skillId]?.name ?? 'Unknown skill' : 'Basic attack'
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
        title: 'Core damage',
        detail: `${displaySkill(top.skillId)} landed ${top.hits} times for ${top.damage} total damage, the top damage source this battle.`,
      })
    }
    if (rejected.length === 0) {
      insights.push({
        kind: 'strength',
        title: 'Stable actions',
        detail: 'No actions were corrected by safety rules this battle; skill range and energy management stayed effective.',
      })
    }
    if (state.patchRecords.length > 0) {
      insights.push({
        kind: 'strength',
        title: 'Strategic response',
        detail: `The AI completed ${state.patchRecords.length} strategy validations and kept executing as the battle evolved.`,
      })
    }
  } else {
    if (outOfRange.length > 0) {
      const names = [...new Set(outOfRange.map((event) => displaySkill(event.skillId ?? null)))]
      insights.push({
        kind: 'adjustment',
        title: 'Manage distance earlier',
        detail: `${names.join(', ')} failed to execute ${outOfRange.length} times due to insufficient range; raise ranged skill priority or reposition sooner.`,
      })
    }
    const burst = incoming[0]
    if (burst) {
      insights.push({
        kind: 'adjustment',
        title: 'Counter burst damage',
        detail: `The opponent's ${displaySkill(burst.skillId ?? null)} dealt ${burst.amount ?? 0} damage in a single hit; hold a shield or guard action before that skill fires.`,
      })
    }
    if (totalDamage === 0) {
      insights.push({
        kind: 'adjustment',
        title: 'Establish effective damage',
        detail: 'No effective damage was recorded this battle; first make sure at least one ranged skill hits reliably, then set up a close-range finisher.',
      })
    } else if (damageBySkill[0]) {
      const top = damageBySkill[0]
      insights.push({
        kind: 'adjustment',
        title: 'Amplify effective damage',
        detail: `${displaySkill(top.skillId)} dealt ${top.damage} damage; adjust priorities around this skill and cut low-value actions.`,
      })
    }
    if (insights.length === 0) {
      insights.push({
        kind: 'adjustment',
        title: 'Improve action conversion',
        detail: `${rejected.length} actions were corrected this battle; check skill cooldowns, energy, and target conditions before your next fight.`,
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
