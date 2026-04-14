import type { CombatActor, StatusEffectType } from './CombatTypes';

export interface StatusTickResult {
  updatedActor: CombatActor;
  events: Array<{ effect: StatusEffectType; duration: number }>;
  actorDied: boolean;
  skippedTurn: boolean;
  damage?: number;
}

export function tickStatus(actor: CombatActor): StatusTickResult {
  const events: Array<{ effect: StatusEffectType; duration: number }> = [];
  let skippedTurn = false;
  let actorDied = false;
  let damage: number | undefined;

  const updatedStatusEffects = actor.statusEffects
    .map((effect) => {
      let effectDamage = 0;

      if (effect.type === 'poison') {
        effectDamage = Math.floor(actor.stats.maxHp * 0.1);
        damage = effectDamage;
      } else if (effect.type === 'burn') {
        effectDamage = Math.floor(actor.stats.maxHp * 0.05);
        damage = effectDamage;
      } else if (effect.type === 'stun') {
        skippedTurn = true;
      }

      if (effectDamage > 0) {
        actor.stats.hp = Math.max(0, actor.stats.hp - effectDamage);
        if (actor.stats.hp <= 0) actorDied = true;
      }

      events.push({ effect: effect.type, duration: effect.duration - 1 });
      return { ...effect, duration: effect.duration - 1 };
    })
    .filter((effect) => effect.duration > 0);

  return {
    updatedActor: { ...actor, statusEffects: updatedStatusEffects },
    events,
    actorDied,
    skippedTurn,
    damage,
  };
}

export function applyPoison(actor: CombatActor): { tickResult: StatusTickResult } {
  return { tickResult: tickStatus(actor) };
}

export function applyBurn(actor: CombatActor): { tickResult: StatusTickResult } {
  return { tickResult: tickStatus(actor) };
}
