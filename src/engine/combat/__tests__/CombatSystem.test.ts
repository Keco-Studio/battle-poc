import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../../rng/SeededRNG';
import { calcDamage } from '../CombatSystem';
import { tickStatus, applyPoison, applyBurn } from '../StatusEffects';
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
    statusEffects: overrides.statusEffects ?? [],
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

describe('Status effects', () => {
  it('poison deals 10% maxHp per turn', () => {
    const actor = createActor({
      id: 'poisoned', side: 'player',
      stats: { hp: 50, maxHp: 50 },
      statusEffects: [{ type: 'poison', duration: 1 }],
    });

    const { tickResult } = applyPoison(actor);

    expect(tickResult.damage).toBe(5); // 10% of 50 maxHp
    expect(tickResult.updatedActor.statusEffects).toHaveLength(0); // duration expired
  });

  it('stun causes skip turn', () => {
    const actor = createActor({
      id: 'stunned', side: 'player',
      stats: { hp: 50, maxHp: 50 },
      statusEffects: [{ type: 'stun', duration: 1 }],
    });

    const { skippedTurn } = tickStatus(actor);

    expect(skippedTurn).toBe(true);
  });

  it('burn deals 5% maxHp per turn', () => {
    const actor = createActor({
      id: 'burning', side: 'player',
      stats: { hp: 100, maxHp: 100 },
      statusEffects: [{ type: 'burn', duration: 1 }],
    });

    const { tickResult } = applyBurn(actor);

    expect(tickResult.damage).toBe(5); // 5% of 100 maxHp
  });
});
