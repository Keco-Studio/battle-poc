import { describe, it, expect } from 'vitest';
import { ScriptedAI } from '../ScriptedAI';
import type { CombatActor } from '../../combat/CombatTypes';

function createActor(id: string, side: 'player' | 'enemy', hp: number = 50): CombatActor {
  return {
    id, name: id, side,
    stats: { hp, maxHp: hp, attack: 10, defense: 3, speed: 5, luck: 0, mp: 0, maxMp: 0 },
    statusEffects: [],
  };
}

describe('ScriptedAI', () => {
  it('always attacks first living enemy', () => {
    const ai = new ScriptedAI();
    const enemy = createActor('enemy', 'enemy');
    const player1 = createActor('player1', 'player', 100);
    const player2 = createActor('player2', 'player', 100);

    ai.setActors([player1, player2]);

    // Scripted AI controls the enemy
    const action = ai.getAction(enemy);

    expect(action).not.toBeNull();
    expect(action!.type).toBe('attack');
    // Should target one of the players
    expect(['player1', 'player2']).toContain(action!.targetId);
  });

  it('returns null when no living enemies', () => {
    const ai = new ScriptedAI();
    const enemy = createActor('enemy', 'enemy', 0); // dead

    const action = ai.getAction(enemy);

    expect(action).toBeNull();
  });

  it('returns null for player actors (not AI controlled)', () => {
    const ai = new ScriptedAI();
    const player = createActor('player', 'player');

    const action = ai.getAction(player);

    expect(action).toBeNull();
  });
});
