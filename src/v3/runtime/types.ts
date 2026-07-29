import type { V3BehaviorTreeState, V3Map, V3Point } from '@/src/content/generated/v3'

export type V3ActorId = 'left' | 'right'
export type V3BattleResult = 'ongoing' | 'left_win' | 'right_win' | 'draw' | 'invalid'
export type V3BattleEndReason = null | 'hp_zero' | 'max_tick' | 'invariant_error'

export type V3StatModifiers = {
  hp: number
  energy: number
  atk: number
  def: number
  spd: number
}

export type V3BattleVersions = {
  content: string
  rules: string
  visual: string
  modelProvider: 'minimax' | 'deepseek'
  model: string
}

export type V3BattleSideConfig = {
  templateType: 'job' | 'enemy'
  templateId: string
  skillIds: string[]
  treeId: string
  modifiers: V3StatModifiers
}

export type V3BattleConfig = {
  seed: number
  mapId: string
  maxDecisionTicks: number
  left: V3BattleSideConfig
  right: V3BattleSideConfig
  versions: V3BattleVersions
}

export type V3BattleConfigInput = Omit<V3BattleConfig, 'left' | 'right' | 'versions'> & {
  left: Omit<V3BattleSideConfig, 'modifiers'> & { modifiers?: V3StatModifiers }
  right: Omit<V3BattleSideConfig, 'modifiers'> & { modifiers?: V3StatModifiers }
  versions?: V3BattleVersions
}

export type V3ActorStatus = {
  kind: 'root' | 'atk_down' | 'def_down'
  ticks: number
  value: number
}

export type V3ActorState = {
  id: V3ActorId
  templateId: string
  name: string
  visualAssetId: string
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
  shield: number
  atk: number
  def: number
  spd: number
  position: V3Point
  skillIds: string[]
  cooldowns: Record<string, number>
  statuses: V3ActorStatus[]
  guarding: boolean
  damageDealt: number
  damageTaken: number
  healingDone: number
  skillsUsed: number
}

export type V3SkillAction = {
  actorId: V3ActorId
  kind: 'skill'
  skillId: string
  targetId: V3ActorId
}

export type V3BattleAction =
  | V3SkillAction
  | { actorId: V3ActorId; kind: 'basic'; targetId: V3ActorId }
  | { actorId: V3ActorId; kind: 'move'; to: V3Point }
  | { actorId: V3ActorId; kind: 'guard' }
  | { actorId: V3ActorId; kind: 'wait' }

export type V3ActionValidation =
  | { ok: true }
  | {
      ok: false
      code:
        | 'battle_over'
        | 'actor_down'
        | 'target_down'
        | 'unknown_skill'
        | 'not_equipped'
        | 'cooldown'
        | 'insufficient_energy'
        | 'out_of_range'
        | 'rooted'
        | 'blocked_destination'
        | 'invalid_destination'
    }

export type V3BehaviorTreePatchOperation =
  | { kind: 'set_threshold'; nodeId: string; value: number }
  | { kind: 'set_action'; nodeId: string; skillId: string }
  | { kind: 'reorder'; nodeId: string; childIds: string[] }

export type V3BehaviorTreePatch = {
  actorId: V3ActorId
  decisionTick: number
  baseTreeVersion: number
  reason: string
  ops: V3BehaviorTreePatchOperation[]
}

export type V3PatchStatus = 'accepted' | 'rejected' | 'stale' | 'timeout' | 'none'

export type V3PatchRecord = {
  actorId: V3ActorId
  decisionTick: number
  baseTreeVersion: number
  resultingTreeVersion: number
  status: V3PatchStatus
  reason: string
  rejectCode?: string
  ops: V3BehaviorTreePatchOperation[]
}

export type V3BattleEvent = {
  id: string
  tick: number
  sequence: number
  type: 'patch' | 'action' | 'damage' | 'heal' | 'shield' | 'status' | 'move' | 'guard' | 'result'
  actorId?: V3ActorId
  targetId?: V3ActorId
  skillId?: string
  amount?: number
  position?: V3Point
  message: string
}

export type V3RecordedTick = {
  tick: number
  decisions: Record<V3ActorId, V3BehaviorTreePatch | null>
}

export type V3BattleState = {
  initialConfig: V3BattleConfig
  map: V3Map
  actors: Record<V3ActorId, V3ActorState>
  trees: Record<V3ActorId, V3BehaviorTreeState>
  tick: number
  maxDecisionTicks: number
  seed: number
  result: V3BattleResult
  endReason: V3BattleEndReason
  events: V3BattleEvent[]
  patchRecords: V3PatchRecord[]
  history: V3RecordedTick[]
}

export type V3BattleRecord = {
  initialConfig: V3BattleConfig
  ticks: V3RecordedTick[]
}
