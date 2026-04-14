import type { CombatActor } from '../combat/CombatTypes';
import type { BattleAction } from '../combat/CombatTypes';

export interface IBattleInput {
  /**
   * Get the next action for an actor given the current battle state.
   * Returns null if the input cannot provide an action (e.g., no valid targets).
   */
  getAction(actor: CombatActor): BattleAction | null;

  /** Called when battle starts */
  onBattleStart(): void;

  /** Called when battle ends */
  onBattleEnd(winner: 'player' | 'enemy'): void;
}
