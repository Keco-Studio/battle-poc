import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBuiltinBattleSkillDefinitions } from '@/src/battle-core/content/skills/basic-skill-catalog'
import {
  SIMULATION_SYNC_MODULE_ID,
  savePocSkillModulesState,
} from '@/src/lib/skills/pocSkillModulesStorage'
import {
  getKecoSkillsRecord,
  setKecoSkillsRecord,
  setSimulationKecoSkillsRecord,
} from '@/src/lib/skills/kecoSkillRegistry'
import {
  clearSimulationSyncFromRuntime,
  syncSimulationSkillsFromRemote,
} from '@/src/lib/skills/simulationSkillSync'
import { hydratePocSkills } from '@/src/lib/skills/pocSkillsStorage'
import type { SimulationSkillDraft } from '@/src/lib/skills/simulationSkillDraftTypes'

const mocks = vi.hoisted(() => ({
  fetchDrafts: vi.fn(),
  refreshDrafts: vi.fn(),
}))

vi.mock('@/src/lib/db/simulation-skill-drafts', () => ({
  fetchSimulationSkillDraftsForUser: mocks.fetchDrafts,
}))

vi.mock('@/src/lib/skills/refreshSimulationSkillDrafts', () => ({
  refreshSimulationSkillDraftsWithSupabase: mocks.refreshDrafts,
}))

function installMemoryStorage() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    clear: () => { values.clear() },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
}

function draft(id: string, overrides?: Partial<Record<string, string>>): SimulationSkillDraft {
  const values = {
    id,
    name: id,
    type: 'attack',
    power: '1',
    mpCost: '0',
    maxCooldown: '0',
    ...overrides,
  }
  return {
    draftId: `draft-${id}`,
    fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      { tableId: 'studio:skills', columnKey: key, value },
    ])) as SimulationSkillDraft['fields'],
  }
}

function seedStaleRuntime() {
  const builtins = getBuiltinBattleSkillDefinitions()
  savePocSkillModulesState({
    activeModuleId: 'builtin',
    modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', definitions: builtins },
      {
        id: SIMULATION_SYNC_MODULE_ID,
        label: 'Stale sync',
        source: 'simulation-sync',
        definitions: [{ id: 'stale_sync', name: 'Stale', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }],
      },
    ],
  }, { notify: false })
  setSimulationKecoSkillsRecord({ stale_sync: { id: 'stale_sync' } } as unknown as Parameters<typeof setKecoSkillsRecord>[0])
}

function expectSyncStateCleared(result: Awaited<ReturnType<typeof syncSimulationSkillsFromRemote>>) {
  expect(result.state.modules.some((module) => module.id === SIMULATION_SYNC_MODULE_ID)).toBe(false)
  expect(result.skills.some((skill) => skill.id === 'stale_sync')).toBe(false)
  expect(getKecoSkillsRecord()).toBeNull()
}

describe('simulation sync fail-closed state', () => {
  beforeEach(() => {
    installMemoryStorage()
    mocks.fetchDrafts.mockReset()
    mocks.refreshDrafts.mockReset()
    mocks.refreshDrafts.mockImplementation(async (_client, drafts) => ({ drafts, warnings: [] }))
    seedStaleRuntime()
  })

  it.each([
    ['malformed live value', [draft('bad_number', { power: 'not-a-number' })]],
    ['unsupported live value', [draft('bad_special', { specialType: 'teleport' })]],
    ['duplicate live ids', [draft('duplicate'), draft('duplicate')]],
  ])('clears stale runtime and Keco cache for %s', async (_label, remoteDrafts) => {
    mocks.fetchDrafts.mockResolvedValue(remoteDrafts)

    const result = await syncSimulationSkillsFromRemote({} as never, 'user-1')

    expect(result.errors.length).toBeGreaterThan(0)
    expectSyncStateCleared(result)
  })

  it('clears stale runtime and Keco cache when the remote source is empty', async () => {
    mocks.fetchDrafts.mockResolvedValue([])

    const result = await syncSimulationSkillsFromRemote({} as never, 'user-1')

    expectSyncStateCleared(result)
  })

  it('clears stale runtime and Keco cache when the remote source cannot be read', async () => {
    mocks.fetchDrafts.mockRejectedValue(new Error('offline'))

    const result = await syncSimulationSkillsFromRemote({} as never, 'user-1')

    expect(result.errors[0]).toContain('offline')
    expectSyncStateCleared(result)
  })

  it('clears the Keco cache when simulation sync is explicitly removed', () => {
    const result = clearSimulationSyncFromRuntime()

    expect(result.state.modules.some((module) => module.id === SIMULATION_SYNC_MODULE_ID)).toBe(false)
    expect(getKecoSkillsRecord()).toBeNull()
  })

  it('preserves validated base Keco skills when simulation sync is removed', () => {
    setKecoSkillsRecord({ base_element: { id: 'base_element' } } as unknown as Parameters<typeof setKecoSkillsRecord>[0])

    clearSimulationSyncFromRuntime()

    expect(Object.keys(getKecoSkillsRecord() ?? {})).toEqual(['base_element'])
  })

  it('re-reads the current user simulation drafts during authenticated hydrate', async () => {
    mocks.fetchDrafts.mockResolvedValue([draft('hydrated_simulation')])

    const result = await hydratePocSkills({} as never, {
      includeSimulationSync: true,
      userId: 'user-1',
    })

    expect(mocks.fetchDrafts).toHaveBeenCalledWith(expect.anything(), 'user-1')
    expect(result.simulationSyncSkills.map((skill) => skill.id)).toContain('hydrated_simulation')
    expect(result.state.modules.some((module) => module.id === SIMULATION_SYNC_MODULE_ID)).toBe(true)
  })
})
