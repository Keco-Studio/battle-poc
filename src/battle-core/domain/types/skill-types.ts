export type BattleSkillDefinition = {
  id: string
  name: string
  description?: string
  category?: 'burst' | 'control' | 'sustain' | 'mobility' | 'utility' | 'execute'
  ratio: number
  mpCost: number
  range: number
  cooldownTicks: number
  /** Boundary unit for cooldownTicks; runtime registrations normalize to ticks. */
  cooldownUnit?: 'turns' | 'ticks'
  applyFreezeTicks?: number
  shatterBonusRatio?: number
  consumeFreezeOnHit?: boolean
  params?: Record<string, unknown>
}
