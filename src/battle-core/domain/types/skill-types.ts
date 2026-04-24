export type BattleSkillDefinition = {
  id: string
  name: string
  description?: string
  category?: 'burst' | 'control' | 'sustain' | 'mobility' | 'utility' | 'execute'
  ratio: number
  mpCost: number
  range: number
  cooldownTicks: number
  applyFreezeTicks?: number
  shatterBonusRatio?: number
  consumeFreezeOnHit?: boolean
  /** Extra numeric flags (DoT, slow, dash, etc.) read by skill-specific logic. */
  params?: Record<string, number | string | boolean>
}

