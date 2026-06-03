import type { GameConfigImportKind } from './gameConfigTypes'
import { mergeDraftsIntoBundle } from './importPocGameConfig'
import { createDefaultGameConfigBundle } from './defaultGameConfig'
import type { GameConfigBundle } from './gameConfigTypes'

export const POC_GAME_CONFIG_DRAFTS_STORAGE_KEY = 'battle-poc-game-config-drafts-v1'

export type LocalTableCellRef = {
  tableId: string
  columnKey: string
  value: string
}

export type PocGameConfigDraft = {
  draftId: string
  kind: GameConfigImportKind
  sourceRowId?: string
  fields: Record<string, LocalTableCellRef>
}

export function loadPocGameConfigDrafts(): PocGameConfigDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(POC_GAME_CONFIG_DRAFTS_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as { drafts?: unknown }
    if (!Array.isArray(data.drafts)) return []
    return data.drafts.filter(isDraft)
  } catch {
    return []
  }
}

function isDraft(x: unknown): x is PocGameConfigDraft {
  if (!x || typeof x !== 'object') return false
  const d = x as PocGameConfigDraft
  return (
    typeof d.draftId === 'string' &&
    (d.kind === 'equipment' ||
      d.kind === 'loadout' ||
      d.kind === 'balance_scalar' ||
      d.kind === 'basic_attack') &&
    typeof d.fields === 'object'
  )
}

export function savePocGameConfigDrafts(drafts: PocGameConfigDraft[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(POC_GAME_CONFIG_DRAFTS_STORAGE_KEY, JSON.stringify({ version: 1, drafts }))
}

export function draftLabel(draft: PocGameConfigDraft): string {
  const id = draft.fields.id?.value?.trim() || draft.draftId.slice(0, 8)
  return `${draft.kind}: ${id}`
}

export function validateDraftsToBundle(drafts: PocGameConfigDraft[]): {
  ok: boolean
  bundle: GameConfigBundle
  draftErrors: { draftId: string; label: string; error: string }[]
} {
  const { bundle, errors } = mergeDraftsIntoBundle(drafts, createDefaultGameConfigBundle())
  const draftErrors = errors.map((e) => {
    const draft = drafts.find((d) => d.draftId === e.draftId)
    return {
      draftId: e.draftId,
      label: draft ? draftLabel(draft) : e.draftId,
      error: e.error,
    }
  })
  return { ok: draftErrors.length === 0 && drafts.length > 0, bundle, draftErrors }
}
