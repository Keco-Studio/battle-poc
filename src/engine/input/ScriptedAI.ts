import type { IBattleInput } from './IBattleInput';
import type { CombatActor } from '../combat/CombatTypes';
import type { BattleAction } from '../combat/CombatTypes';

export class ScriptedAI implements IBattleInput {
  private actors: CombatActor[] = [];

  setActors(actors: CombatActor[]): void {
    this.actors = actors;
  }

  getAction(actor: CombatActor): BattleAction | null {
    // Scripted AI only controls enemies
    if (actor.side !== 'enemy') {
      return null;
    }

    // Find first living player
    const target = this.actors.find(a => a.side === 'player' && a.stats.hp > 0);
    if (!target) {
      return null;
    }

    return { type: 'attack', targetId: target.id };
  }

  onBattleStart(): void {}

  onBattleEnd(winner: 'player' | 'enemy'): void {}
}
