export type TacticalMode = 'finish' | 'kite' | 'retreat' | 'trade'

export function strategyLabel(strategy: unknown): string | null {
  if (typeof strategy !== 'string') return null
  const map: Record<string, string> = {
    finish: 'Aggressive finish',
    kite: 'Kite and cast',
    retreat: 'Retreat and regroup',
    trade: 'Steady trade',
    aggressive_finish: 'Aggressive finish',
    kite_and_cast: 'Kite and cast',
    flee_and_reset: 'Retreat and regroup',
    steady_trade: 'Steady trade',
  }
  return map[strategy] ?? null
}

export function reasonLabel(reason: unknown): string | null {
  if (typeof reason !== 'string') return null
  const map: Record<string, string> = {
    manual_flee: 'Manual flee',
    auto_flee: 'Auto flee',
    enemy_cast_control: 'Enemy control cast',
    enemy_cast_burst: 'Enemy burst cast',
    enemy_dodge_retreat: 'Enemy dodge retreat',
    enemy_dash_retreat: 'Enemy dash retreat',
    enemy_dash_approach: 'Enemy approach',
    enemy_dash_kite: 'Enemy kite retreat',
    enemy_basic_attack: 'Enemy basic attack',
    player_dash_approach: 'Skill approach',
    player_dash_kite: 'Skill kite retreat',
    player_dodge_retreat: 'Player dodge retreat',
    player_basic_attack: 'Player basic attack',
    player_basic_attack_fallback: 'Skill unavailable, fallback to basic attack',
    player_defend: 'Player defend',
    player_cast_skill: 'Player cast skill',
    player_dash_approach_retry: 'Chase compensation step',
    player_noop: 'Player idle',
    enemy_noop: 'Enemy idle',
    basic_attack_out_of_range: 'Basic attack out of range → move',
    basic_attack_out_of_range_no_dash: 'Basic attack out of range → idle',
    skill_on_cooldown: 'Skill on cooldown → switch skill',
    skill_on_cooldown_fallback_basic: 'Skill on cooldown → basic attack',
    skill_on_cooldown_no_fallback: 'Skill on cooldown → idle',
    insufficient_mp: 'MP insufficient → basic attack',
    insufficient_mp_no_fallback: 'MP insufficient → idle',
    skill_out_of_range: 'Skill out of range → move',
    skill_out_of_range_no_dash: 'Skill out of range → idle',
    insufficient_stamina: 'Stamina insufficient → basic attack',
    insufficient_stamina_no_fallback: 'Stamina insufficient → idle',
    skill_not_found: 'Skill unknown → idle',
  }
  return map[reason] ?? reason
}

export function rejectReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    battle_ended: 'Battle already ended',
    actor_not_found: 'Actor not found',
    actor_dead: 'Actor is dead',
    actor_controlled: 'In controlled state',
    target_not_found: 'Target not found',
    target_out_of_range: 'Out of range',
    not_enough_stamina: 'Stamina insufficient',
    not_enough_mp: 'MP insufficient',
    missing_skill_id: 'Skill parameter missing',
    skill_not_found: 'Skill not found',
    skill_not_equipped: 'Skill not equipped',
    skill_on_cooldown: 'Skill on cooldown',
    flee_failed: 'Flee probability check failed',
    action_not_implemented: 'Action not implemented',
  }
  return map[reason] ?? reason
}

export function actionLabel(action: unknown): string {
  if (typeof action !== 'string') return 'Action'
  if (action === 'basic_attack') return 'Basic Attack'
  if (action === 'cast_skill') return 'Cast Skill'
  if (action === 'defend') return 'Defend'
  if (action === 'dash') return 'Dash'
  if (action === 'dodge') return 'Dodge'
  if (action === 'flee') return 'Flee'
  return action
}

export const ENEMY_MESSAGES = [
  'I am the Demon King, I am strong!',
  'Look at me again and I will eat you!',
  'You should flee early...',
  'This area is mine!',
  'Hmph, foolish human',
  'Do not provoke me, I am dangerous!',
  'You have caught my attention',
  'Stupid adventurer...',
] as const
