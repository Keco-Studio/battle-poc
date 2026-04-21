import type { CombatActor } from '../combat/CombatTypes';
import type { BattleResult } from '../combat/CombatTypes';
import type { SeededRNG } from '../rng/SeededRNG';
import { calcDamage } from '../combat/CombatSystem';

export class BattleStateMachine {
  private readonly actors: CombatActor[];
  private readonly rng: SeededRNG;

  constructor(actors: CombatActor[], rng: SeededRNG) {
    // Deep clone to avoid mutation
    this.actors = actors.map(a => ({
      ...a,
      stats: { ...a.stats },
      statusEffects: [...a.statusEffects],
    }));
    this.rng = rng;
  }

  runToCompletion(): BattleResult {
    while (this.isBattleActive()) {
      this.processTurn();
    }

    const winner = this.actors.some(a => a.side === 'enemy' && a.stats.hp > 0) ? 'enemy' : 'player';
    return {
      winner,
      turns: [],
      survivingActors: this.actors.filter(a => a.stats.hp > 0),
    };
  }

  private isBattleActive(): boolean {
    const playersAlive = this.actors.some(a => a.side === 'player' && a.stats.hp > 0);
    const enemiesAlive = this.actors.some(a => a.side === 'enemy' && a.stats.hp > 0);
    return playersAlive && enemiesAlive;
  }

  private processTurn(): void {
    for (const actor of this.actors) {
      if (actor.stats.hp <= 0) continue;

      const targetSide = actor.side === 'player' ? 'enemy' : 'player';
      const target = this.actors.find(a => a.side === targetSide && a.stats.hp > 0);
      if (!target) continue;

      const { damage } = calcDamage(actor, target, this.rng, undefined);
      target.stats.hp = Math.max(0, target.stats.hp - damage);
    }
  }
}