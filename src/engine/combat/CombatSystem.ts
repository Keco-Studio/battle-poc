import type { SeededRNG } from '../rng/SeededRNG';
import type { CombatActor } from './CombatTypes';

export function calcDamage(
  attacker: CombatActor,
  defender: CombatActor,
  rng: SeededRNG,
  config?: { critChanceBase: number; critLuckScale: number; critChanceMax: number },
): { damage: number; isCritical: boolean } {
  const merged = {
    critChanceBase: config?.critChanceBase ?? 0.15,
    critLuckScale: config?.critLuckScale ?? 0.01,
    critChanceMax: config?.critChanceMax ?? 0.75,
  };
  const baseDamage = Math.max(1, attacker.stats.attack - defender.stats.defense);
  const critChance = Math.min(
    merged.critChanceMax,
    Math.max(0, merged.critChanceBase + attacker.stats.luck * merged.critLuckScale),
  );
  const isCritical = rng.stream('combat').next() < critChance;
  return { damage: isCritical ? baseDamage * 2 : baseDamage, isCritical };
}
