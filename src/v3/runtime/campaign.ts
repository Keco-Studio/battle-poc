import { z } from 'zod'

import { V3_CONTENT, type V3Point } from '@/src/content/generated/v3'

import type { V3BattleResult, V3StatModifiers } from './types'

export type V3BattleMode = 'standard' | 'sandbox'
export type V3Phase = 'explore' | 'prepare' | 'battle' | 'report'

export type V3OutcomeSummary = {
  encounterId: string
  result: V3BattleResult
  seed: number
  ticks: number
}

export type V3Progress = {
  schemaVersion: 1
  clearedEncounterIds: string[]
  unlockedEncounterIds: string[]
  exp: number
  starlight: number
  drops: string[]
  playerPosition: V3Point
  battleRecords: Array<V3OutcomeSummary & { mode: V3BattleMode }>
}

export type V3PhaseState = {
  phase: V3Phase
  encounterId: string | null
  battleId: string | null
}

export type V3PhaseEvent =
  | { type: 'encounter'; encounterId: string }
  | { type: 'cancel_prepare' }
  | { type: 'start_battle'; battleId: string }
  | { type: 'battle_complete' }
  | { type: 'replay'; battleId: string }
  | { type: 'return_to_map' }

export const V3_PROGRESS_STORAGE_KEY = 'ai-battle-v3-progress'
export const EMPTY_V3_STAT_MODIFIERS: V3StatModifiers = { hp: 0, energy: 0, atk: 0, def: 0, spd: 0 }

const safeBeacon = V3_CONTENT.maps[V3_CONTENT.game.defaultExplorationMapId].safeBeacon ?? { x: 3, y: 16 }
const initialUnlocked = Object.values(V3_CONTENT.encounters)
  .filter((encounter) => encounter.unlockAfterIds.length === 0)
  .map((encounter) => encounter.id)

export const EMPTY_V3_PROGRESS: V3Progress = {
  schemaVersion: 1,
  clearedEncounterIds: [],
  unlockedEncounterIds: initialUnlocked,
  exp: 0,
  starlight: 0,
  drops: [],
  playerPosition: { ...safeBeacon },
  battleRecords: [],
}

const outcomeSchema = z.object({
  encounterId: z.string(),
  result: z.enum(['ongoing', 'left_win', 'right_win', 'draw', 'invalid']),
  seed: z.number().int(),
  ticks: z.number().int().nonnegative(),
  mode: z.enum(['standard', 'sandbox']),
}).strict()

const progressSchema = z.object({
  schemaVersion: z.literal(1),
  clearedEncounterIds: z.array(z.string()),
  unlockedEncounterIds: z.array(z.string()),
  exp: z.number().nonnegative(),
  starlight: z.number().nonnegative(),
  drops: z.array(z.string()),
  playerPosition: z.object({ x: z.number(), y: z.number() }).strict(),
  battleRecords: z.array(outcomeSchema),
}).strict()

export function initialV3PhaseState(): V3PhaseState {
  return { phase: 'explore', encounterId: null, battleId: null }
}

export function transitionV3Phase(state: V3PhaseState, event: V3PhaseEvent): V3PhaseState {
  if (state.phase === 'explore' && event.type === 'encounter' && V3_CONTENT.encounters[event.encounterId]) {
    return { phase: 'prepare', encounterId: event.encounterId, battleId: null }
  }
  if (state.phase === 'prepare' && event.type === 'cancel_prepare') return initialV3PhaseState()
  if (state.phase === 'prepare' && event.type === 'start_battle') {
    return { ...state, phase: 'battle', battleId: event.battleId }
  }
  if (state.phase === 'battle' && event.type === 'battle_complete') return { ...state, phase: 'report' }
  if (state.phase === 'report' && event.type === 'replay') return { ...state, phase: 'battle', battleId: event.battleId }
  if (state.phase === 'report' && event.type === 'return_to_map') return initialV3PhaseState()
  return state
}

function deriveUnlocked(clearedEncounterIds: string[]): string[] {
  const cleared = new Set(clearedEncounterIds)
  return Object.values(V3_CONTENT.encounters)
    .filter((encounter) => encounter.unlockAfterIds.every((id) => cleared.has(id)))
    .map((encounter) => encounter.id)
}

export function recordV3Outcome(
  progress: V3Progress,
  outcome: V3OutcomeSummary,
  mode: V3BattleMode,
): V3Progress {
  if (mode === 'sandbox') return progress
  const encounter = V3_CONTENT.encounters[outcome.encounterId]
  if (!encounter) return progress
  const battleRecords = [...progress.battleRecords, { ...outcome, mode }]
  if (outcome.result !== 'left_win') {
    return { ...progress, playerPosition: { ...safeBeacon }, battleRecords }
  }

  const alreadyCleared = progress.clearedEncounterIds.includes(encounter.id)
  const clearedEncounterIds = alreadyCleared
    ? [...progress.clearedEncounterIds]
    : [...progress.clearedEncounterIds, encounter.id]
  const reward = V3_CONTENT.rewards[encounter.rewardId]
  return {
    ...progress,
    clearedEncounterIds,
    unlockedEncounterIds: deriveUnlocked(clearedEncounterIds),
    exp: progress.exp + (alreadyCleared ? 0 : reward.exp),
    starlight: progress.starlight + (alreadyCleared ? 0 : reward.starlight),
    drops: alreadyCleared ? [...progress.drops] : [...progress.drops, reward.dropId],
    playerPosition: { x: encounter.x, y: encounter.y },
    battleRecords,
  }
}

export function progressionModifiers(progress: Pick<V3Progress, 'drops'>): V3StatModifiers {
  const earned = new Set(progress.drops)
  return Object.values(V3_CONTENT.progression).reduce<V3StatModifiers>((total, bonus) => {
    if (!earned.has(bonus.dropId)) return total
    return {
      hp: total.hp + bonus.hp,
      energy: total.energy + bonus.energy,
      atk: total.atk + bonus.atk,
      def: total.def + bonus.def,
      spd: total.spd + bonus.spd,
    }
  }, { ...EMPTY_V3_STAT_MODIFIERS })
}

export function parseV3Progress(value: unknown): V3Progress {
  const parsed = progressSchema.safeParse(value)
  if (!parsed.success) return { ...EMPTY_V3_PROGRESS, playerPosition: { ...EMPTY_V3_PROGRESS.playerPosition } }
  return parsed.data
}

export function loadV3Progress(storage: Pick<Storage, 'getItem'> | null): V3Progress {
  if (!storage) return parseV3Progress(EMPTY_V3_PROGRESS)
  try {
    const raw = storage.getItem(V3_PROGRESS_STORAGE_KEY)
    return raw ? parseV3Progress(JSON.parse(raw)) : parseV3Progress(EMPTY_V3_PROGRESS)
  } catch {
    return parseV3Progress(EMPTY_V3_PROGRESS)
  }
}

export function saveV3Progress(storage: Pick<Storage, 'setItem'> | null, progress: V3Progress): void {
  if (!storage) return
  storage.setItem(V3_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
}
