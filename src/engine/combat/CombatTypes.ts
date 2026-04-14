// battle-poc/src/engine/combat/CombatTypes.ts

export type CombatSide = 'player' | 'enemy';

export type StatusEffectType = 'poison' | 'stun' | 'burn';

export interface StatusEffect {
  type: StatusEffectType;
  duration: number;
}

export interface CombatStats {
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  attack: number;
  defense: number;
  speed: number;
  luck: number;
}

export interface CombatSkill {
  id: string;
  name: string;
  mpCost: number;
  power: number;
  applyStatus?: {
    type: StatusEffectType;
    duration: number;
  };
}

export interface CombatActor {
  id: string;
  name: string;
  side: CombatSide;
  stats: CombatStats;
  statusEffects: StatusEffect[];
}

export type BattleAction =
  | { type: 'attack'; targetId: string }
  | { type: 'skill'; skillId: string; targetId: string }
  | { type: 'flee' };

export interface TurnRecord {
  actorId: string;
  action: 'attack' | 'skip' | 'skill' | 'flee';
  targetId?: string;
  damage?: number;
  isCritical?: boolean;
  statusApplied?: StatusEffectType;
  skillId?: string;
}

export interface BattleResult {
  winner: CombatSide;
  turns: ReadonlyArray<Readonly<TurnRecord>>;
  survivingActors: ReadonlyArray<Readonly<CombatActor>>;
}
