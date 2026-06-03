import type { JobRoleStats } from './jobConfigTypes'
import { getBuiltinJobCatalogSnapshot } from './builtinJobCatalog'

let activeRoleStats: Record<string, JobRoleStats> = {
  ...getBuiltinJobCatalogSnapshot().roleStats,
}

export function getActiveRoleStats(jobClassId: string): JobRoleStats | undefined {
  return activeRoleStats[jobClassId] ?? activeRoleStats.hero
}

export function applyRoleStatsRegistry(roleStats: Record<string, JobRoleStats>): void {
  activeRoleStats = { ...roleStats }
}

export function resetRoleStatsRegistryToBuiltin(): void {
  activeRoleStats = { ...getBuiltinJobCatalogSnapshot().roleStats }
}
