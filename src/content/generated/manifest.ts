export type GeneratedDomainProvenance = {
  projectId: string
  projectName: string
  tableIds: readonly string[]
  tableNames: readonly string[]
  rowIds: readonly string[]
  syncedAt: string
  fingerprint: string
}

export const GENERATED_CONTENT_MANIFEST = {
  version: 1,
  domains: { skills: null, jobs: null, gameConfig: null },
} as const satisfies {
  version: 1
  domains: Record<'skills' | 'jobs' | 'gameConfig', GeneratedDomainProvenance | null>
}
