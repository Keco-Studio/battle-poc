export const VS01_PROGRESS_STORAGE_KEY = 'battle-poc:vs01-progress'
export const VS01_CAUSEWAY_ENEMY_IDS = ['cinder_wisp', 'iron_husk', 'frost_revenant'] as const
export const VS01_BOSS_ID = 'null_custodian'

export type Vs01Progress = {
  defeatedEnemyIds: string[]
  completed: boolean
}

export const EMPTY_VS01_PROGRESS: Vs01Progress = { defeatedEnemyIds: [], completed: false }

export function normalizeVs01Progress(value: unknown): Vs01Progress {
  if (!value || typeof value !== 'object') return { ...EMPTY_VS01_PROGRESS }
  const raw = value as Partial<Vs01Progress>
  const defeatedEnemyIds = Array.isArray(raw.defeatedEnemyIds)
    ? Array.from(new Set(raw.defeatedEnemyIds.filter((id): id is string => typeof id === 'string')))
    : []
  return { defeatedEnemyIds, completed: raw.completed === true || defeatedEnemyIds.includes(VS01_BOSS_ID) }
}

export function recordVs01Victory(progress: Vs01Progress, enemyId: string): Vs01Progress {
  return normalizeVs01Progress({
    defeatedEnemyIds: [...progress.defeatedEnemyIds, enemyId],
    completed: progress.completed || enemyId === VS01_BOSS_ID,
  })
}

export function isVs01CoreUnlocked(progress: Vs01Progress): boolean {
  const defeated = new Set(progress.defeatedEnemyIds)
  return VS01_CAUSEWAY_ENEMY_IDS.every((id) => defeated.has(id))
}

export function getVs01Objective(progress: Vs01Progress): string {
  if (progress.completed) return 'Relay restored. Vertical slice complete.'
  if (isVs01CoreUnlocked(progress)) return 'Enter the Ashen Relay Core and defeat the Null Custodian.'
  const remaining = VS01_CAUSEWAY_ENEMY_IDS.filter((id) => !progress.defeatedEnemyIds.includes(id)).length
  return `Stabilize Emberwatch Causeway: ${remaining} relay threat${remaining === 1 ? '' : 's'} remaining.`
}

