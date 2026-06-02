/**
 * Skill drafts: Studio table cell bindings persisted in localStorage.
 * Adapted from keco-simulation battleSkillDrafts.ts for battle-poc fields.
 */

import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'
import {
  emptyPocSkillFlatRow,
  flatRowToBattleSkillDefinition,
  POC_SKILL_MAPPING_FIELDS,
  resolveSkillId,
  type PocSkillColumnMappingKey,
  type PocSkillFlatRow,
} from './pocSkillFieldMapping'

export const POC_SKILL_DRAFTS_STORAGE_KEY = 'battle-poc-skill-drafts-v1'

export type LocalTableCellRef = {
  tableId: string
  columnKey: string
  value: string
}

export type PocSkillDraft = {
  draftId: string
  sourceRowId?: string
  fields: Partial<Record<PocSkillColumnMappingKey, LocalTableCellRef>>
}

export type PocSkillDraftsPersisted = {
  version: 1
  drafts: PocSkillDraft[]
}

export type SkillDraftValidationResult = {
  ok: boolean
  definitions: BattleSkillDefinition[]
  draftErrors: { draftId: string; label: string; error: string }[]
}

export function createEmptyDraft(): PocSkillDraft {
  return { draftId: crypto.randomUUID(), fields: {} }
}

function sanitizeFields(
  fields: unknown,
): Partial<Record<PocSkillColumnMappingKey, LocalTableCellRef>> {
  if (!fields || typeof fields !== 'object') return {}
  const out: Partial<Record<PocSkillColumnMappingKey, LocalTableCellRef>> = {}
  for (const f of POC_SKILL_MAPPING_FIELDS) {
    const ref = (fields as Record<string, unknown>)[f.key]
    if (!ref || typeof ref !== 'object') continue
    const r = ref as LocalTableCellRef
    if (
      typeof r.tableId === 'string' &&
      typeof r.columnKey === 'string' &&
      typeof r.value === 'string' &&
      r.tableId &&
      r.columnKey
    ) {
      out[f.key] = { tableId: r.tableId, columnKey: r.columnKey, value: r.value }
    }
  }
  return out
}

export function loadPocSkillDrafts(): PocSkillDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(POC_SKILL_DRAFTS_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return []
    const o = data as PocSkillDraftsPersisted
    if (!Array.isArray(o.drafts)) return []
    return o.drafts
      .filter((d) => d && typeof d === 'object' && typeof d.draftId === 'string')
      .map((d) => ({
        draftId: d.draftId,
        sourceRowId:
          typeof d.sourceRowId === 'string' && d.sourceRowId.trim() ? d.sourceRowId : undefined,
        fields: sanitizeFields(d.fields),
      }))
  } catch {
    return []
  }
}

export function savePocSkillDrafts(drafts: PocSkillDraft[]): void {
  if (typeof window === 'undefined') return
  const payload: PocSkillDraftsPersisted = { version: 1, drafts }
  localStorage.setItem(POC_SKILL_DRAFTS_STORAGE_KEY, JSON.stringify(payload))
}

export function resolvedDraftSkillId(draft: PocSkillDraft): string | null {
  const raw = draft.fields.id?.value?.trim()
  if (!raw) return null
  const resolved = resolveSkillId(raw)
  return 'error' in resolved ? null : resolved.id
}

export function draftImportDisplayId(draft: PocSkillDraft): string {
  return draft.fields.id?.value?.trim() || draft.fields.name?.value?.trim() || 'unknown'
}

export type DraftImportReject = {
  displayId: string
  resolvedId: string
  reason: string
}

export function partitionDraftsBySkillId(
  incoming: PocSkillDraft[],
  existing: PocSkillDraft[],
): { accepted: PocSkillDraft[]; rejected: DraftImportReject[] } {
  const seen = new Set<string>()
  for (const d of existing) {
    const id = resolvedDraftSkillId(d)
    if (id) seen.add(id)
  }

  const accepted: PocSkillDraft[] = []
  const rejected: DraftImportReject[] = []

  for (const draft of incoming) {
    const displayId = draftImportDisplayId(draft)
    const resolvedId = resolvedDraftSkillId(draft)
    if (!resolvedId) {
      accepted.push(draft)
      continue
    }
    if (seen.has(resolvedId)) {
      rejected.push({
        displayId,
        resolvedId,
        reason: `Skill id "${resolvedId}" already exists.`,
      })
      continue
    }
    seen.add(resolvedId)
    accepted.push(draft)
  }

  return { accepted, rejected }
}

export function draftToFlatRow(draft: PocSkillDraft): PocSkillFlatRow {
  const base = emptyPocSkillFlatRow()
  const pick = (key: PocSkillColumnMappingKey): string => draft.fields[key]?.value?.trim() ?? ''
  const rawId = pick('id')
  const idResolved = rawId ? resolveSkillId(rawId) : { error: 'Skill id cannot be empty' as const }
  return {
    ...base,
    id: 'id' in idResolved ? idResolved.id : rawId,
    name: pick('name'),
    description: pick('description'),
    category: pick('category') || base.category,
    power: pick('power') || base.power,
    mpCost: pick('mpCost') || base.mpCost,
    range: pick('range') || base.range,
    maxCooldown: pick('maxCooldown') || base.maxCooldown,
  }
}

export function validatePocSkillDrafts(drafts: PocSkillDraft[]): SkillDraftValidationResult {
  const definitions: BattleSkillDefinition[] = []
  const draftErrors: { draftId: string; label: string; error: string }[] = []
  const seenIds = new Set<string>()

  if (drafts.length === 0) {
    return {
      ok: false,
      definitions: [],
      draftErrors: [{ draftId: '', label: '', error: 'Add at least one skill draft.' }],
    }
  }

  drafts.forEach((draft, index) => {
    const label =
      draft.fields.name?.value?.trim() ||
      draft.fields.id?.value?.trim() ||
      `Skill ${index + 1}`
    const missingRequired = POC_SKILL_MAPPING_FIELDS.filter(
      (f) => f.required && !draft.fields[f.key]?.value?.trim(),
    )
    if (missingRequired.length > 0) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: `Missing: ${missingRequired.map((f) => f.label).join(', ')}`,
      })
      return
    }

    const flat = draftToFlatRow(draft)
    const def = flatRowToBattleSkillDefinition(flat)
    if (!def) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: 'Invalid skill id or field values.',
      })
      return
    }
    if (seenIds.has(def.id)) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: `Duplicate skill id "${def.id}".`,
      })
      return
    }
    seenIds.add(def.id)
    definitions.push(def)
  })

  return {
    ok: draftErrors.length === 0 && definitions.length > 0,
    definitions,
    draftErrors,
  }
}
