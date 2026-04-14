import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../../rng/SeededRNG';
import { BattleStateMachine } from '../BattleStateMachine';
import type { CombatActor } from '../../combat/CombatTypes';
import { calcDamage } from '../../combat/CombatSystem';

function createActor(id: string, side: 'player' | 'enemy', hp: number, attack: number, defense: number = 3): CombatActor {
  return {
    id, name: id, side,
    stats: { hp, maxHp: hp, attack, defense, speed: 5, luck: 0, mp: 0, maxMp: 0 },
    statusEffects: [],
  };
}

describe('BattleStateMachine', () => {
  it('detects winner when one side eliminated', () => {
    const rng = new SeededRNG(42);
    const actors: CombatActor[] = [
      createActor('hero', 'player', 100, 50),
      createActor('enemy', 'enemy', 1, 10),  // Dies in one hit
    ];

    const sm = new BattleStateMachine(actors, rng);
    const result = sm.runToCompletion();

    expect(result.winner).toBe('player');
    expect(result.survivingActors.find(a => a.id === 'hero')).toBeDefined();
    expect(result.survivingActors.find(a => a.id === 'enemy')).toBeUndefined();
  });

  it('actors are never mutated', () => {
    const rng = new SeededRNG(42);
    const originalActor = createActor('hero', 'player', 100, 50);
    const actors: CombatActor[] = [originalActor, createActor('enemy', 'enemy', 100, 10)];

    const sm = new BattleStateMachine(actors, rng);
    sm.runToCompletion();

    // Original actor should be unchanged
    expect(originalActor.stats.hp).toBe(100);
  });
});