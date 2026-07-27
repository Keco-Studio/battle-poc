// @vitest-environment jsdom
// Uses React.createElement so this file can stay within the repository's *.test.ts include pattern.

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportGameConfigBlock } from '@/app/components/gameConfig/ImportGameConfigBlock'
import StudioImportModal from '@/app/components/studioImport/StudioImportModal'

Object.assign(globalThis, { React })

const mocks = vi.hoisted(() => ({
  loadTable: vi.fn(),
  supabase: {},
}))

vi.mock('@/src/lib/SupabaseContext', () => ({
  useSupabaseOptional: () => mocks.supabase,
}))

vi.mock('@/src/lib/jobs/studioJobPicker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/lib/jobs/studioJobPicker')>()
  return { ...actual, loadStudioTableRows: mocks.loadTable }
})
vi.mock('@/src/lib/skills/BattleSkillsProvider', () => ({
  useBattleSkills: () => ({ modules: [], activeModuleId: 'builtin' }),
}))
vi.mock('@/src/lib/jobs/BattleJobsProvider', () => ({
  useBattleJobs: () => ({ modules: [], activeModuleId: 'builtin' }),
}))
vi.mock('@/src/lib/gameConfig/BattleGameConfigProvider', () => ({
  useBattleGameConfig: () => ({ modules: [], activeModuleId: 'studio-drafts' }),
}))

const tables = [{
  id: 'studio:config',
  name: 'Config',
  libraryId: 'config',
  projectId: 'simulation',
}]

describe('Studio import UI integrity', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = false
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.loadTable.mockReset()
  })

  afterEach(() => {
    root.unmount()
    container.remove()
  })

  it('blocks a table with duplicate normalized ids before rows can be selected', async () => {
    mocks.loadTable.mockResolvedValue({
      columns: [
        { key: 'id', label: 'id' },
        { key: 'value', label: 'value' },
      ],
      rows: [
        { id: 'row-1', values: { id: 'enemy_base_hp', value: '100' } },
        { id: 'row-2', values: { id: ' ENEMY_BASE_HP ', value: '200' } },
        { id: 'row-3', values: { id: 'enemy_base_atk', value: '10' } },
      ],
    })
    const onError = vi.fn()

    root.render(React.createElement(ImportGameConfigBlock, {
      tables,
      tablesLoading: false,
      supabaseReady: true,
      existingDrafts: [],
      onImportDraft: vi.fn(),
      onError,
      fixedKind: 'balance_scalar',
    }))

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/duplicate.*enemy_base_hp/i))
    })
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
  })

  it('surfaces a rejected Studio table request instead of leaving an unhandled rejection', async () => {
    mocks.loadTable.mockRejectedValue(new Error('Studio offline'))
    const onError = vi.fn()

    root.render(React.createElement(ImportGameConfigBlock, {
      tables,
      tablesLoading: false,
      supabaseReady: true,
      existingDrafts: [],
      onImportDraft: vi.fn(),
      onError,
      fixedKind: 'balance_scalar',
    }))

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Studio offline')
    })
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
  })

  it('surfaces an empty Studio table response as a load failure', async () => {
    mocks.loadTable.mockResolvedValue(null)
    const onError = vi.fn()

    root.render(React.createElement(ImportGameConfigBlock, {
      tables,
      tablesLoading: false,
      supabaseReady: true,
      existingDrafts: [],
      onImportDraft: vi.fn(),
      onError,
      fixedKind: 'balance_scalar',
    }))

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Failed to load table')
    })
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
  })

  it('recomputes import catalog draft counts when storage changes under the same module label', async () => {
    const equipmentDraft = {
      draftId: 'equipment',
      kind: 'equipment',
      fields: { id: { tableId: 'table-1', columnKey: 'id', value: 'weapon' } },
    }
    const basicAttackDraft = {
      draftId: 'basic',
      kind: 'basic_attack',
      fields: { id: { tableId: 'table-2', columnKey: 'id', value: 'basic_attack' } },
    }
    const game = {
      showStudioImport: true,
      studioImportCategory: null,
      closeStudioImport: vi.fn(),
      setStudioImportCategory: vi.fn(),
    }
    localStorage.setItem(
      'battle-poc-game-config-drafts-v1',
      JSON.stringify({ version: 1, drafts: [equipmentDraft] }),
    )

    root.render(React.createElement(StudioImportModal, { game: game as never }))
    await vi.waitFor(() => {
      const row = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Basic attack'))
      expect(row?.textContent).toContain('Drafts 0')
    })

    localStorage.setItem(
      'battle-poc-game-config-drafts-v1',
      JSON.stringify({ version: 1, drafts: [equipmentDraft, basicAttackDraft] }),
    )
    root.render(React.createElement(StudioImportModal, { game: game as never }))

    await vi.waitFor(() => {
      const row = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Basic attack'))
      expect(row?.textContent).toContain('Drafts 1')
    })
  })
})
