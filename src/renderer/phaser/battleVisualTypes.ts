/** React 战斗面板每帧注入 Phaser 的只读快照（逻辑仍在 React） */

/** player-skill-offense：对敌伤害类技能；player-skill-support：治疗/防御等自身演出 */
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
  autoFleeAnimating: boolean
  isGameOver: boolean
  battleResult: 'win' | 'lose' | null
  floatTexts: ReadonlyArray<{ id: number; text: string; side: 'left' | 'right' }>
}

export interface BattleSceneInitData {
  getState: () => BattleVisualState
}
