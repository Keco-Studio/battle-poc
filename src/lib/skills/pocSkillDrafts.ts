/**
 * Skill drafts: Studio table cell bindings persisted in localStorage.
 * Adapted from keco-simulation battleSkillDrafts.ts for battle-poc fields.
 */

import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'
import type { Skill as KecoSkill } from '@keco/battle-engine'
import {
  emptyPocSkillFlatRow,
  flatRowToBattleSkillDefinition,
  POC_SKILL_MAPPING_FIELDS,
  resolveSkillId,
  type PocSkillColumnMappingKey,
  type PocSkillFlatRow,
  type PocSkillKecoExtraFields,
} from './pocSkillFieldMapping'
import { flatRowToKecoSkillFromRow } from './kecoSkillTableCodec'
import { parseStrengthKey } from './elementLabelCodec'

export const POC_SKILL_DRAFTS_STORAGE_KEY = 'battle-poc-skill-drafts-v1'

export type LocalTableCellRef = {
  tableId: string
  columnKey: string
  value: string
}

export type PocSkillDraft = {
  draftId: string
  sourceRowId?: string
  invalidReason?: string
  fields: Partial<Record<PocSkillColumnMappingKey, LocalTableCellRef>> &
    Partial<Record<keyof PocSkillKecoExtraFields, LocalTableCellRef>>
}

export type PocSkillDraftsPersisted = {
  version: 1
  drafts: PocSkillDraft[]
}

export type SkillDraftValidationResult = {
  ok: boolean
  definitions: BattleSkillDefinition[]
  kecoSkills: KecoSkill[]
  draftErrors: { draftId: string; label: string; error: string }[]
}

export function createEmptyDraft(): PocSkillDraft {
  return { draftId: crypto.randomUUID(), fields: {} }
}

function sanitizeFields(
  fields: unknown,
): Partial<Record<PocSkillColumnMappingKey, LocalTableCellRef>> {
  if (!fields || typeof fields !== 'object') return {}
  const out: PocSkillDraft['fields'] = {}
  const keys = [
    ...POC_SKILL_MAPPING_FIELDS.map((f) => f.key),
    'skillType', 'attachElement', 'attachStrength', 'attachTurns', 'dotDamage', 'dotTurns',
    'freezeTurns', 'specialEffect', 'specialEffectValue', 'specialEffectDuration', 'reactionTriggersJson',
  ] as string[]
  for (const key of keys) {
    const ref = (fields as Record<string, unknown>)[key]
    if (!ref || typeof ref !== 'object') continue
    const r = ref as LocalTableCellRef
    if (
      typeof r.tableId === 'string' &&
      typeof r.columnKey === 'string' &&
      typeof r.value === 'string' &&
      r.tableId &&
      r.columnKey
    ) {
      ;(out as Record<string, LocalTableCellRef>)[key] = { tableId: r.tableId, columnKey: r.columnKey, value: r.value }
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
        invalidReason:
          typeof d.invalidReason === 'string' && d.invalidReason.trim() ? d.invalidReason : undefined,
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
): { accepted: PocSkillDraft[]; rejected: DraftImportReject[]; updated: PocSkillDraft[] } {
  const existingIds = new Set<string>()
  for (const d of existing) {
    const id = resolvedDraftSkillId(d)
    if (id) existingIds.add(id)
  }

  const seenIncoming = new Set<string>()
  const accepted: PocSkillDraft[] = []
  const rejected: DraftImportReject[] = []
  const updated: PocSkillDraft[] = []

  for (const draft of incoming) {
    const displayId = draftImportDisplayId(draft)
    const resolvedId = resolvedDraftSkillId(draft)
    if (!resolvedId) {
      accepted.push(draft)
      continue
    }
    if (seenIncoming.has(resolvedId)) {
      rejected.push({
        displayId,
        resolvedId,
        reason: `Duplicate skill id "${resolvedId}" in this import.`,
      })
      continue
    }
    seenIncoming.add(resolvedId)
    accepted.push(draft)
    if (existingIds.has(resolvedId)) updated.push(draft)
  }

  return { accepted, rejected, updated }
}

export function upsertPocSkillDrafts(
  existing: PocSkillDraft[],
  incoming: PocSkillDraft[],
): PocSkillDraft[] {
  const next = [...existing]
  for (const draft of incoming) {
    const id = resolvedDraftSkillId(draft)
    const index = id ? next.findIndex((item) => resolvedDraftSkillId(item) === id) : -1
    if (index >= 0) next[index] = draft
    else next.push(draft)
  }
  return next
}

export function draftToFlatRow(draft: PocSkillDraft): PocSkillFlatRow {
  const base = emptyPocSkillFlatRow()
  const pick = (key: PocSkillColumnMappingKey): string => draft.fields[key]?.value?.trim() ?? ''
  const rawId = pick('id')
  const idResolved = rawId ? resolveSkillId(rawId) : { error: 'Skill id cannot be empty' as const }
  const flat: PocSkillFlatRow = {
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
  const extraKeys: Array<keyof PocSkillKecoExtraFields> = [
    'skillType', 'attachElement', 'attachStrength', 'attachTurns', 'dotDamage', 'dotTurns',
    'freezeTurns', 'specialEffect', 'specialEffectValue', 'specialEffectDuration', 'reactionTriggersJson',
  ]
  for (const key of extraKeys) {
    const value = draft.fields[key]?.value?.trim()
    if (value) flat[key] = value
  }
  return flat
}

export function validatePocSkillDrafts(drafts: PocSkillDraft[]): SkillDraftValidationResult {
  const definitions: BattleSkillDefinition[] = []
  const kecoSkills: KecoSkill[] = []
  const draftErrors: { draftId: string; label: string; error: string }[] = []
  const seenIds = new Set<string>()

  if (drafts.length === 0) {
    return {
      ok: false,
      definitions: [],
      kecoSkills: [],
      draftErrors: [{ draftId: '', label: '', error: 'Add at least one skill draft.' }],
    }
  }

  drafts.forEach((draft, index) => {
    const label =
      draft.fields.name?.value?.trim() ||
      draft.fields.id?.value?.trim() ||
      `Skill ${index + 1}`
    if (draft.invalidReason) {
      draftErrors.push({ draftId: draft.draftId, label, error: draft.invalidReason })
      return
    }
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
    const skillType = flat.skillType.trim().toLowerCase()
    if (skillType && skillType !== 'attack' && skillType !== 'heal') {
      draftErrors.push({ draftId: draft.draftId, label, error: `skillType "${flat.skillType}" is not supported.` })
      return
    }
    if (flat.attachElement.trim() && flat.attachStrength.trim() && !parseStrengthKey(flat.attachStrength)) {
      draftErrors.push({ draftId: draft.draftId, label, error: `attachStrength "${flat.attachStrength}" is invalid.` })
      return
    }
    const def = flatRowToBattleSkillDefinition(flat)
    if (!def) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: 'Invalid skill id or field values.',
      })
      return
    }
    const unsupported: string[] = []
    const special = String(def.params?.specialEffect ?? '').trim()
    if (special && !['atk_debuff', 'def_debuff', 'heal'].includes(special)) unsupported.push('specialEffect')
    if (unsupported.length > 0) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: 'Unsupported runtime fields: ' + unsupported.join(', '),
      })
      return
    }
    const keco = flatRowToKecoSkillFromRow(flat)
    if (!keco) {
      draftErrors.push({ draftId: draft.draftId, label, error: 'Could not convert draft to Keco skill.' })
      return
    }
    if (flat.attachElement.trim() && !keco.attachElement) {
      draftErrors.push({ draftId: draft.draftId, label, error: 'attachElement is invalid.' })
      return
    }
    if (flat.reactionTriggersJson.trim() && !keco.reactionTrigger?.length) {
      draftErrors.push({ draftId: draft.draftId, label, error: 'reactionTriggersJson contains no valid reaction trigger.' })
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
    kecoSkills.push(keco)
  })

  return {
    ok: draftErrors.length === 0 && definitions.length > 0,
    definitions,
    kecoSkills,
    draftErrors,
  }
}
