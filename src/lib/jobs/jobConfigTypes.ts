/** Runtime job / class config (Studio-importable, mirrors job_classes table). */

export type PreferredRange = 'melee' | 'mid' | 'ranged'

export type JobRoleStats = {
  baseHp: number
  baseAtk: number
  baseDef: number
  baseSpd: number
  growthHp: number
  growthAtk: number
  growthDef: number
  growthSpd: number
  hpMult: number
}

export type JobClassConfig = {
  id: string
  name: string
  description: string
  preferredRange: PreferredRange
  stats: JobRoleStats
}

export type JobCatalogSnapshot = {
  jobClassIds: string[]
  configs: Record<string, JobClassConfig>
  displayNames: Record<string, string>
  descriptions: Record<string, string>
  preferredRanges: Record<string, PreferredRange>
  roleStats: Record<string, JobRoleStats>
}
