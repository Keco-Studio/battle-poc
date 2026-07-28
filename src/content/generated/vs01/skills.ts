import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'

export const VS01_SKILLS = [
  { id: 'relay_bolt', name: 'Relay Bolt', description: 'A fast teal signal bolt for maintaining pressure.', category: 'burst', ratio: 1.15, mpCost: 2, range: 7.2, cooldownTicks: 1 },
  { id: 'cinder_mark', name: 'Cinder Mark', description: 'Brands the target with an ember signal that burns over time.', category: 'sustain', ratio: 0.92, mpCost: 4, range: 6.5, cooldownTicks: 2, params: { dotDamage: 0.24, dotTicks: 3 } },
  { id: 'frost_lattice', name: 'Frost Lattice', description: 'Locks the target inside an ice-blue relay lattice.', category: 'control', ratio: 0.78, mpCost: 6, range: 6.8, cooldownTicks: 4, applyFreezeTicks: 2 },
  { id: 'shatter_lance', name: 'Shatter Lance', description: 'A focused lance that consumes freeze for a decisive rupture.', category: 'execute', ratio: 1.55, mpCost: 7, range: 7, cooldownTicks: 3, shatterBonusRatio: 0.65, consumeFreezeOnHit: true },
  { id: 'sunder_arc', name: 'Sunder Arc', description: "A close signal sweep that exposes the target's armor.", category: 'utility', ratio: 1, mpCost: 5, range: 4.8, cooldownTicks: 3, params: { specialEffect: 'def_debuff', specialEffectValue: 0.25, specialEffectDuration: 3 } },
  { id: 'mending_spark', name: 'Mending Spark', description: 'Reclaims relay energy to repair the Warden while striking.', category: 'sustain', ratio: 0.65, mpCost: 6, range: 5.5, cooldownTicks: 4, params: { specialEffect: 'heal', specialEffectValue: 0.22 } },
  { id: 'phase_needle', name: 'Phase Needle', description: 'A quick narrow strike used by mobile combatants to reset spacing.', category: 'mobility', ratio: 1.3, mpCost: 5, range: 3.5, cooldownTicks: 2, params: { specialEffect: 'atk_debuff', specialEffectValue: 0.15, specialEffectDuration: 2 } },
  { id: 'overload_crown', name: 'Overload Crown', description: 'Detonates a crown of relay nodes in a heavy finishing pulse.', category: 'burst', ratio: 1.85, mpCost: 10, range: 5.8, cooldownTicks: 5, shatterBonusRatio: 0.25 },
] as const satisfies readonly BattleSkillDefinition[]

