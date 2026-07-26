/** Runtime job / class config (Studio-importable, mirrors job_classes table). */

export type PreferredRange = 'melee' | 'mid' | 'ranged'

export type JobRoleStats = {
  hp: number
  atk: number
  def: number
  spd: number
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

/** Accept persisted stats that still use legacy base* field names. */
export function normalizeRoleStats(raw: Record<string, unknown>): JobRoleStats | null {
  const hp = raw.hp ?? raw.baseHp
  const atk = raw.atk ?? raw.baseAtk
  const def = raw.def ?? raw.baseDef
  const spd = raw.spd ?? raw.baseSpd
  const growthHp = raw.growthHp
  const growthAtk = raw.growthAtk
  const growthDef = raw.growthDef
  const growthSpd = raw.growthSpd
  const hpMult = raw.hpMult

  if (
    !Number.isFinite(hp) ||
    !Number.isFinite(atk) ||
    !Number.isFinite(def) ||
    !Number.isFinite(spd) ||
    !Number.isFinite(growthHp) ||
    !Number.isFinite(growthAtk) ||
    !Number.isFinite(growthDef) ||
    !Number.isFinite(growthSpd) ||
    !Number.isFinite(hpMult)
  ) {
    return null
  }

  return {
    hp: Number(hp),
    atk: Number(atk),
    def: Number(def),
    spd: Number(spd),
    growthHp: Number(growthHp),
    growthAtk: Number(growthAtk),
    growthDef: Number(growthDef),
    growthSpd: Number(growthSpd),
    hpMult: Number(hpMult),
  }
}
