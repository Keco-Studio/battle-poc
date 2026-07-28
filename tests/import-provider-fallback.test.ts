// @vitest-environment jsdom

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BattleGameConfigProvider,
  useBattleGameConfig,
} from '@/src/lib/gameConfig/BattleGameConfigProvider'
import { BattleJobsProvider } from '@/src/lib/jobs/BattleJobsProvider'
import { BattleSkillsProvider } from '@/src/lib/skills/BattleSkillsProvider'
import { applyGameConfigBundle, getActiveGameConfig } from '@/src/lib/gameConfig/gameConfigRegistry'
import { createDefaultGameConfigBundle } from '@/src/lib/gameConfig/defaultGameConfig'
import { applyDefinitionsToRuntimeCatalog } from '@/src/lib/skills/pocSkillModulesStorage'
import { getBattleSkillDefinition } from '@/src/battle-core/content/skills/basic-skill-catalog'
import { getKecoSkillsRecord, setKecoSkillsRecord } from '@/src/lib/skills/kecoSkillRegistry'
import { getBuiltinJobClassConfigs } from '@/src/lib/jobs/builtinJobCatalog'
import {
  loadPocJobModulesState,
  savePocJobModulesState,
} from '@/src/lib/jobs/pocJobModulesStorage'

Object.assign(globalThis, { React })

const mocks = vi.hoisted(() => ({
  applyConfig: vi.fn(),
  hydrateConfig: vi.fn(),
  hydrateJobs: vi.fn(),
  hydrateSkills: vi.fn(),
  supabase: {},
}))

vi.mock('@/src/lib/SupabaseContext', () => ({ useSupabaseOptional: () => mocks.supabase }))
vi.mock('@/src/lib/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, userProfile: { id: 'user-1' } }),
}))
vi.mock('@/src/lib/gameConfig/pocGameConfigStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/lib/gameConfig/pocGameConfigStorage')>()
  return {
    ...actual,
    applyPocGameConfigDrafts: mocks.applyConfig,
    hydratePocGameConfig: mocks.hydrateConfig,
  }
})
vi.mock('@/src/lib/skills/pocSkillsStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/lib/skills/pocSkillsStorage')>()
  return { ...actual, hydratePocSkills: mocks.hydrateSkills }
})
vi.mock('@/src/lib/jobs/pocJobsStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/lib/jobs/pocJobsStorage')>()
  return { ...actual, hydratePocJobs: mocks.hydrateJobs }
})

function deferred<T>() {
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((_resolve, rejectPromise) => { reject = rejectPromise })
  return { promise, reject }
}

describe.skip('legacy Supabase import Provider hydrate fallback', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = false
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.hydrateConfig.mockReset()
    mocks.applyConfig.mockReset()
    mocks.hydrateJobs.mockReset()
    mocks.hydrateSkills.mockReset()
  })

  afterEach(async () => {
    root.unmount()
    container.remove()
  })

  it('resets the game-config registry when hydrate throws unexpectedly', async () => {
    const hydrate = deferred<never>()
    mocks.hydrateConfig.mockReturnValue(hydrate.promise)
    root.render(React.createElement(BattleGameConfigProvider, null, React.createElement('div')))
    await vi.waitFor(() => expect(mocks.hydrateConfig).toHaveBeenCalledTimes(1))
    const stale = createDefaultGameConfigBundle()
    stale.progression.expPerLevel = 999
    applyGameConfigBundle(stale)

    hydrate.reject(new Error('unexpected config failure'))

    await vi.waitFor(() => {
      expect(getActiveGameConfig().progression.expPerLevel).toBe(
        createDefaultGameConfigBundle().progression.expPerLevel,
      )
    })
  })

  it('does not rehydrate in response to the Provider own game-config Apply event', async () => {
    const bundle = createDefaultGameConfigBundle()
    const state = {
      activeModuleId: 'studio-drafts',
      modules: [
        { id: 'builtin', label: 'Default', source: 'builtin' as const, bundle },
        { id: 'studio-drafts', label: 'Drafts', source: 'drafts' as const, bundle },
      ],
    }
    mocks.hydrateConfig.mockResolvedValue({ state, bundle })
    mocks.applyConfig.mockImplementation(async () => {
      window.dispatchEvent(new CustomEvent('battle-poc-game-config-updated'))
      return { state, bundle, errors: [] }
    })

    function ApplyProbe() {
      const { applyConfigDrafts } = useBattleGameConfig()
      return React.createElement('button', { onClick: () => void applyConfigDrafts() }, 'Apply')
    }

    root.render(
      React.createElement(BattleGameConfigProvider, null, React.createElement(ApplyProbe)),
    )
    await vi.waitFor(() => expect(mocks.hydrateConfig).toHaveBeenCalledTimes(1))

    container.querySelector('button')!.click()
    await vi.waitFor(() => expect(mocks.applyConfig).toHaveBeenCalledTimes(1))

    expect(mocks.hydrateConfig).toHaveBeenCalledTimes(1)
  })

  it('resets the skill catalog and Keco cache when hydrate throws unexpectedly', async () => {
    const hydrate = deferred<never>()
    mocks.hydrateSkills.mockReturnValue(hydrate.promise)
    root.render(React.createElement(BattleSkillsProvider, null, React.createElement('div')))
    await vi.waitFor(() => expect(mocks.hydrateSkills).toHaveBeenCalledTimes(1))
    applyDefinitionsToRuntimeCatalog([{
      id: 'stale_provider_skill',
      name: 'Stale Provider Skill',
      ratio: 1,
      mpCost: 0,
      range: 3,
      cooldownTicks: 0,
    }])
    setKecoSkillsRecord({ stale_provider_skill: { id: 'stale_provider_skill' } } as never)

    hydrate.reject(new Error('unexpected skill failure'))

    await vi.waitFor(() => {
      expect(getBattleSkillDefinition('stale_provider_skill')).toBeUndefined()
      expect(getKecoSkillsRecord()).toBeNull()
    })
  })

  it('resets persisted job modules when hydrate throws unexpectedly', async () => {
    const hydrate = deferred<never>()
    mocks.hydrateJobs.mockReturnValue(hydrate.promise)
    const builtins = getBuiltinJobClassConfigs()
    savePocJobModulesState({
      activeModuleId: 'studio:stale-jobs',
      modules: [
        { id: 'builtin', label: 'Default', source: 'builtin', configs: builtins },
        {
          id: 'studio:stale-jobs',
          label: 'Stale Studio jobs',
          source: 'studio',
          studioLibraryId: 'stale-jobs',
          configs: [{ ...builtins[0]!, id: 'stale_job' }],
        },
      ],
    }, { notify: false })

    root.render(React.createElement(BattleJobsProvider, null, React.createElement('div')))
    await vi.waitFor(() => expect(mocks.hydrateJobs).toHaveBeenCalledTimes(1))
    hydrate.reject(new Error('unexpected job failure'))

    await vi.waitFor(() => {
      const state = loadPocJobModulesState()
      expect(state.activeModuleId).toBe('builtin')
      expect(state.modules.some((module) => module.source === 'studio')).toBe(false)
    })
  })

  it('does not reset an installed skill runtime during an ordinary Provider rerender', async () => {
    const hydrate = deferred<never>()
    mocks.hydrateSkills.mockReturnValue(hydrate.promise)
    root.render(React.createElement(BattleSkillsProvider, null, React.createElement('div')))
    await vi.waitFor(() => expect(mocks.hydrateSkills).toHaveBeenCalledTimes(1))
    applyDefinitionsToRuntimeCatalog([{
      id: 'live_provider_skill',
      name: 'Live Provider Skill',
      ratio: 1,
      mpCost: 0,
      range: 3,
      cooldownTicks: 0,
    }])
    setKecoSkillsRecord({ live_provider_skill: { id: 'live_provider_skill' } } as never)

    root.render(React.createElement(BattleSkillsProvider, null, React.createElement('span')))
    await vi.waitFor(() => expect(container.querySelector('span')).not.toBeNull())

    expect(getBattleSkillDefinition('live_provider_skill')).toBeDefined()
    expect(getKecoSkillsRecord()).not.toBeNull()
  })
})
