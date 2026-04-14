import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../../rng/SeededRNG';
import { calcDamage } from '../CombatSystem';
import type { CombatActor } from '../CombatTypes';

function createActor(overrides: Partial<CombatActor> & { id: string; side: 'player' | 'enemy' }): CombatActor {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    side: overrides.side,
    stats: {
      hp: 30, maxHp: 30, mp: 0, maxMp: 0,
      attack: 10, defense: 3, speed: 5, luck: 0,
      ...overrides.stats,
    },
    statusEffects: [],
  };
}

describe('CombatSystem damage rules', () => {
  it('damage = max(1, attack - defense)', () => {
    const rng = new SeededRNG(42);
    const attacker = createActor({ id: 'p1', side: 'player', stats: { attack: 10 } });
    const defender = createActor({ id: 'e1', side: 'enemy', stats: { defense: 3 } });
    const result = calcDamage(attacker, defender, rng, { critChanceBase: 0, critLuckScale: 0, critChanceMax: 0 });
    expect(result.damage).toBe(7);
  });

  it('minimum damage is 1', () => {
    const rng = new SeededRNG(42);
    const attacker = createActor({ id: 'p1', side: 'player', stats: { attack: 3 } });
    const defender = createActor({ id: 'e1', side: 'enemy', stats: { defense: 10 } });
    const result = calcDamage(attacker, defender, rng, { critChanceBase: 0, critLuckScale: 0, critChanceMax: 0 });
    expect(result.damage).toBe(1);
  });

  it('critical hits deal 2x damage', () => {
    const attacker = createActor({
      id: 'hero', side: 'player',
      stats: { attack: 10, luck: 100 },
    });
    const defender = createActor({
      id: 'enemy', side: 'enemy',
      stats: { defense: 3 },
    });

    let foundCrit = false;
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRNG(seed);
      const result = calcDamage(attacker, defender, rng, { critChanceBase: 0.15, critLuckScale: 0.01, critChanceMax: 0.75 });
      if (result.isCritical && result.damage === 14) {
        foundCrit = true;
        break;
      }
    }
    expect(foundCrit).toBe(true);
  });
});
