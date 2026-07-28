export type EnemyKind = 'cinder' | 'husk' | 'revenant' | 'boss'

export type Tactic = 'pressure' | 'flank' | 'zone' | 'recover'

export type ControlMode = 'human' | 'llm'

export type PilotIntent = 'engage' | 'kite' | 'evade' | 'combo' | 'overload'

export type PilotMovement = 'toward' | 'away' | 'orbit-left' | 'orbit-right' | 'hold'

export type PilotAction = 'fire' | 'cinder' | 'frost' | 'dash' | 'overload'

export type PilotTarget = 'nearest' | 'weakest' | 'boss'

export type PlayerDirective = {
  intent: PilotIntent
  movement: PilotMovement
  action: PilotAction
  target: PilotTarget
  reason: string
}

export type RunPhase = 'briefing' | 'combat' | 'victory' | 'defeat'

export type SkillId = 'cinder' | 'frost' | 'dash' | 'overload'

export type EmberHudState = {
  phase: RunPhase
  hp: number
  maxHp: number
  overload: number
  wave: number
  waveLabel: string
  enemies: number
  score: number
  combo: number
  tactic: Tactic
  tacticReason: string
  tacticSource: 'minimax' | 'fallback' | 'connecting'
  controlMode: ControlMode
  pilot: PlayerDirective
  pilotSource: 'minimax' | 'fallback' | 'connecting'
  cooldowns: Record<SkillId, number>
}

export type TacticalSnapshot = {
  wave: number
  playerHp: number
  overload: number
  enemyCount: number
  bossHp: number | null
  recentDamage: number
  currentTactic: Tactic
  availableSkills: SkillId[]
  burnedEnemies: number
  frozenEnemies: number
}

export const EMBER_HUD_EVENT = 'ember-null:hud'
