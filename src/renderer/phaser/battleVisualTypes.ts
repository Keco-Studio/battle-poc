/** React battle panel injects read-only snapshot to Phaser every frame (logic still in React) */

/** player-skill-offense: damage skills targeting enemy; player-skill-support: self-cast like heal/defense */
export type BattleFxKind =
  | 'none'
  | 'player-hit'
  | 'enemy-hit'
  | 'player-skill-offense'
  | 'player-skill-support'

export interface BattleVisualState {
  playerName: string
  enemyName: string
  playerHP: number
  playerMaxHp: number
  enemyHP: number
  enemyMaxHp: number
  isDefending: boolean
  battleFx: BattleFxKind
  heavyStrikePlaying: boolean
  isGameOver: boolean
  battleResult: 'win' | 'lose' | null
  floatTexts: ReadonlyArray<{ id: number; text: string; side: 'left' | 'right' }>
}

/** Map battle: Phaser sprite pixel coordinates (consistent with GameMap gridToScreen) */
export interface MapBattleLayout {
  playerX: number
  playerY: number
  enemyX: number
  enemyY: number
}

export type MapBattleVisualState = BattleVisualState & {
  mapLayout: MapBattleLayout
}

export interface BattleSceneInitData {
  getState: () => BattleVisualState
}

export interface MapBattleSceneInitData {
  getState: () => MapBattleVisualState
}
