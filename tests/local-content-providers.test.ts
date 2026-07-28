import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const providerContracts = [
  {
    file: 'src/lib/skills/BattleSkillsProvider.tsx',
    reset: 'resetPocSkillsRuntimeToBuiltin()',
    legacyHydrate: 'hydratePocSkills(',
  },
  {
    file: 'src/lib/jobs/BattleJobsProvider.tsx',
    reset: 'resetPocJobsRuntimeToBuiltin()',
    legacyHydrate: 'hydratePocJobs(',
  },
  {
    file: 'src/lib/gameConfig/BattleGameConfigProvider.tsx',
    reset: 'resetPocGameConfigRuntimeToBuiltin()',
    legacyHydrate: 'hydratePocGameConfig(',
  },
] as const

describe('local content providers', () => {
  it.each(providerContracts)('$file resets to static content before legacy hydrate', ({ file, reset, legacyHydrate }) => {
    const source = readFileSync(file, 'utf8')
    const localBranch = source.indexOf('if (LOCAL_WEB_MODE)')
    expect(localBranch).toBeGreaterThanOrEqual(0)
    expect(source.indexOf(reset, localBranch)).toBeGreaterThan(localBranch)
    expect(source.indexOf(legacyHydrate, localBranch)).toBeGreaterThan(source.indexOf(reset, localBranch))
  })

  it('returns the stable local-mode error from disabled provider actions', () => {
    const sources = providerContracts.map(({ file }) => readFileSync(file, 'utf8')).join('\n')
    expect(sources.match(/LOCAL_MODE_ERROR/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sources).toContain('syncedCount: 0')
  })
})
