import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadStudioTableRows } = vi.hoisted(() => ({ loadStudioTableRows: vi.fn() }))
vi.mock('@/src/lib/jobs/studioJobPicker', () => ({ loadStudioTableRows }))

import { refreshPocGameConfigDraftsFromLiveTables } from '@/src/lib/gameConfig/refreshPocGameConfigDrafts'
import { hydratePocGameConfig } from '@/src/lib/gameConfig/pocGameConfigStorage'
import { savePocGameConfigDrafts } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import { savePocGameConfigModulesState } from '@/src/lib/gameConfig/pocGameConfigModulesStorage'
import { createDefaultGameConfigBundle } from '@/src/lib/gameConfig/defaultGameConfig'

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
  return storage
}

describe('game config draft refresh', () => {
  beforeEach(() => {
    loadStudioTableRows.mockReset()
    installMemoryStorage().clear()
  })

  it('marks a draft invalid when its bound source row is deleted', async () => {
    loadStudioTableRows.mockResolvedValue({ columns: [], rows: [] })
    const result = await refreshPocGameConfigDraftsFromLiveTables({} as never, [{
      draftId: 'deleted-row',
      kind: 'balance_scalar',
      sourceRowId: 'row-1',
      fields: {
        id: { tableId: 'table-1', columnKey: 'id', value: 'exp_per_level' },
        value: { tableId: 'table-1', columnKey: 'value', value: '999' },
      },
    }])
    expect(result.drafts[0]?.invalidReason).toContain('rebind')
  })

  it('marks a draft invalid when the live table loader throws', async () => {
    loadStudioTableRows.mockRejectedValue(new Error('network down'))
    const result = await refreshPocGameConfigDraftsFromLiveTables({} as never, [{
      draftId: 'network',
      kind: 'balance_scalar',
      fields: { id: { tableId: 'table-1', columnKey: 'id', value: 'exp_per_level' } },
    }])
    expect(result.drafts[0]?.invalidReason).toContain('unavailable')
  })

  it('marks a bound draft invalid when no live client is available', async () => {
    const result = await refreshPocGameConfigDraftsFromLiveTables(null, [{
      draftId: 'offline',
      kind: 'balance_scalar',
      fields: { id: { tableId: 'table-1', columnKey: 'id', value: 'exp_per_level' } },
    }])
    expect(result.drafts[0]?.invalidReason).toContain('Live table unavailable')
  })

  it('starts distinct Studio table refreshes concurrently', async () => {
    const resolvers = new Map<
      string,
      (value: { columns: never[]; rows: Array<{ id: string; values: Record<string, string> }> }) => void
    >()
    const loadTable = vi.fn((_client: unknown, tableId: string) =>
      new Promise<{ columns: never[]; rows: Array<{ id: string; values: Record<string, string> }> }>(
        (resolve) => resolvers.set(tableId, resolve),
      ),
    )
    const refresh = refreshPocGameConfigDraftsFromLiveTables({} as never, [
      {
        draftId: 'equipment-row',
        kind: 'equipment',
        sourceRowId: 'row-1',
        fields: { id: { tableId: 'studio:equipment', columnKey: 'id-field', value: 'weapon' } },
      },
      {
        draftId: 'loadout-row',
        kind: 'loadout',
        sourceRowId: 'row-2',
        fields: { id: { tableId: 'studio:loadouts', columnKey: 'id-field', value: 'hero' } },
      },
    ], loadTable as never)

    await vi.waitFor(() => expect(loadTable).toHaveBeenCalledTimes(2))
    resolvers.get('studio:equipment')?.({
      columns: [],
      rows: [{ id: 'row-1', values: { 'id-field': 'weapon' } }],
    })
    resolvers.get('studio:loadouts')?.({
      columns: [],
      rows: [{ id: 'row-2', values: { 'id-field': 'hero' } }],
    })

    const result = await refresh
    expect(result.drafts.every((draft) => draft.invalidReason === undefined)).toBe(true)
  })

  it('does not hydrate a stale game-config module after live refresh is unavailable', async () => {
    const bundle = createDefaultGameConfigBundle()
    savePocGameConfigModulesState({
      activeModuleId: 'studio-drafts',
      modules: [
        { id: 'builtin', label: 'Default', source: 'builtin', bundle },
        { id: 'studio-drafts', label: 'Stale', source: 'drafts', bundle },
      ],
    }, { notify: false })
    savePocGameConfigDrafts([{
      draftId: 'offline',
      kind: 'balance_scalar',
      fields: { id: { tableId: 'table-1', columnKey: 'id', value: 'exp_per_level' } },
    }])

    const result = await hydratePocGameConfig(null)

    expect(result.state.activeModuleId).toBe('builtin')
    expect(result.state.modules.some((m) => m.id === 'studio-drafts')).toBe(false)
  })
})
