import type { JobRoleStats } from './jobConfigTypes'
import { getBuiltinJobCatalogSnapshot } from './builtinJobCatalog'
import { VS01_JOBS } from '@/src/content/generated/vs01/jobs'

const VS01_ROLE_STATS = Object.fromEntries(VS01_JOBS.map((job) => [job.id, { ...job.stats }]))

let activeRoleStats: Record<string, JobRoleStats> = {
  ...getBuiltinJobCatalogSnapshot().roleStats,
  ...VS01_ROLE_STATS,
}

export function getActiveRoleStats(jobClassId: string): JobRoleStats | undefined {
  return activeRoleStats[jobClassId] ?? activeRoleStats.relay_warden ?? activeRoleStats.hero
}

export function applyRoleStatsRegistry(roleStats: Record<string, JobRoleStats>): void {
  activeRoleStats = { ...roleStats }
}

export function resetRoleStatsRegistryToBuiltin(): void {
  activeRoleStats = { ...getBuiltinJobCatalogSnapshot().roleStats, ...VS01_ROLE_STATS }
}
