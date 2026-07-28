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
  domains: {
    skills: {
      projectId: 'fc3376fb-b6b8-42b0-8a16-459916e41da2',
      projectName: 'battle-poc',
      tableIds: ['9d361db5-a5b8-45a3-be92-9ce9febcde2d'],
      tableNames: ['VS01_Skills'],
      rowIds: ['db3ad58d-6805-4ba3-b5a3-3c08ab1d1e72', '2bd7f18d-6899-4773-a7c3-bc0c174da7e0', '5f1e8d37-acd9-4a86-b37b-c2e76316c69a', '3eca5b21-c888-4562-aef5-8ca2853610ac', '3c9b82b5-1845-4f1a-bf2d-aef11f35f35e', '0bc73cc4-883b-44bb-b398-923e24bdc15d', '403ec2d1-bb16-4c05-b087-2a9a86517fce', '10af59a6-b5c0-4ac2-b614-18b429d7d750'],
      syncedAt: '2026-07-28T19:12:17+08:00',
      fingerprint: 'sha256:d45cb6b6c9acee0bd0a9580ff4f9af999a0eed8278e62389ce7661a72608ab8d',
    },
    jobs: {
      projectId: 'fc3376fb-b6b8-42b0-8a16-459916e41da2',
      projectName: 'battle-poc',
      tableIds: ['d7304e8e-a65f-471f-b7c4-176ea622b50e'],
      tableNames: ['VS01_Jobs'],
      rowIds: ['1b837b05-5bd0-4569-971b-82565d80f1b2'],
      syncedAt: '2026-07-28T19:12:17+08:00',
      fingerprint: 'sha256:5283afe46b3eebec7776d7cfdd339c7568517702e15ea60903c8a1b17e1bc7d0',
    },
    gameConfig: {
      projectId: 'fc3376fb-b6b8-42b0-8a16-459916e41da2',
      projectName: 'battle-poc',
      tableIds: ['d43108ca-d3e8-41bf-bd3e-f6e85740d434'],
      tableNames: ['VS01_Game'],
      rowIds: ['e426e365-a019-4435-a872-fd2b9abead27'],
      syncedAt: '2026-07-28T19:12:17+08:00',
      fingerprint: 'sha256:edcad7e4f7a316fd48dd9b6519f671eba190e61365cffe4b129992a72c6152e3',
    },
  },
} as const satisfies {
  version: 1
  domains: Record<'skills' | 'jobs' | 'gameConfig', GeneratedDomainProvenance | null>
}
