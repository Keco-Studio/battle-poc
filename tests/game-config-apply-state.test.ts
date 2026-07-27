import { beforeEach, describe, expect, it, vi } from 'vitest'
import { savePocGameConfigDrafts, type PocGameConfigDraft } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import { applyPocGameConfigDrafts } from '@/src/lib/gameConfig/pocGameConfigStorage'
import { getActiveGameConfig } from '@/src/lib/gameConfig/gameConfigRegistry'

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('@/src/lib/gameConfig/refreshPocGameConfigDrafts', () => ({
  refreshPocGameConfigDraftsFromLiveTables: mocks.refresh,
}))

function installMemoryStorage() {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    value: { dispatchEvent: vi.fn() },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size },
    },
  })
}

describe('game config Apply state', () => {
  beforeEach(() => {
    installMemoryStorage()
    mocks.refresh.mockReset()
    mocks.refresh.mockImplementation(async (_client, drafts) => ({ drafts }))
  })

  it('returns the freshly validated Studio bundle for the Provider to keep active', async () => {
    const draft: PocGameConfigDraft = {
      draftId: 'exp-live',
      kind: 'balance_scalar',
      fields: {
        id: { tableId: 'studio:config', columnKey: 'id', value: 'exp_per_level' },
        value: { tableId: 'studio:config', columnKey: 'value', value: '37' },
      },
    }
    savePocGameConfigDrafts([draft])

    const result = await applyPocGameConfigDrafts({} as never)

    expect(result.errors).toEqual([])
    expect(result.bundle.progression.expPerLevel).toBe(37)
    expect(getActiveGameConfig().progression.expPerLevel).toBe(37)
  })
})
