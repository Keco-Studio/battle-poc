import {
  JOB_CLASS_IDS,
  JOB_DESCRIPTIONS,
  JOB_DISPLAY_NAMES,
  JOB_PREFERRED_RANGE,
  ROLE_STATS,
  type JobClassId,
} from './defaultJobClasses'
import type { JobCatalogSnapshot, JobClassConfig } from './jobConfigTypes'

function buildConfig(id: JobClassId): JobClassConfig {
  const stats = ROLE_STATS[id]
  return {
    id,
    name: JOB_DISPLAY_NAMES[id],
    description: JOB_DESCRIPTIONS[id],
    preferredRange: JOB_PREFERRED_RANGE[id],
    stats: { ...stats },
  }
}

export function getBuiltinJobClassConfigs(): JobClassConfig[] {
  return JOB_CLASS_IDS.map(buildConfig)
}

export function snapshotFromConfigs(configs: JobClassConfig[]): JobCatalogSnapshot {
  const jobClassIds: string[] = []
  const configsById: Record<string, JobClassConfig> = {}
  const displayNames: Record<string, string> = {}
  const descriptions: Record<string, string> = {}
  const preferredRanges: JobCatalogSnapshot['preferredRanges'] = {}
  const roleStats: JobCatalogSnapshot['roleStats'] = {}

  for (const c of configs) {
    if (!c.id.trim()) continue
    jobClassIds.push(c.id)
    configsById[c.id] = c
    displayNames[c.id] = c.name
    descriptions[c.id] = c.description
    preferredRanges[c.id] = c.preferredRange
    roleStats[c.id] = c.stats
  }

  return { jobClassIds, configs: configsById, displayNames, descriptions, preferredRanges, roleStats }
}

export function getBuiltinJobCatalogSnapshot(): JobCatalogSnapshot {
  return snapshotFromConfigs(getBuiltinJobClassConfigs())
}
