import {
  emptyPocJobFlatRow,
  parseJobClassRow,
  POC_JOB_MAPPING_FIELDS,
  resolveJobId,
  type PocJobColumnMappingKey,
  type PocJobFlatRow,
} from './pocJobFieldMapping'
import type { JobClassConfig } from './jobConfigTypes'

export const POC_JOB_DRAFTS_STORAGE_KEY = 'battle-poc-job-drafts-v1'

export type LocalTableCellRef = {
  tableId: string
  columnKey: string
  value: string
}

export type PocJobDraft = {
  draftId: string
  sourceRowId?: string
  invalidReason?: string
  fields: Partial<Record<PocJobColumnMappingKey, LocalTableCellRef>>
}

export type PocJobDraftsPersisted = {
  version: 1
  drafts: PocJobDraft[]
}

export type JobDraftValidationResult = {
  ok: boolean
  configs: JobClassConfig[]
  draftErrors: { draftId: string; label: string; error: string }[]
}

export function createEmptyJobDraft(): PocJobDraft {
  return { draftId: crypto.randomUUID(), fields: {} }
}

const LEGACY_DRAFT_FIELD_KEYS: Record<string, PocJobColumnMappingKey> = {
  baseHp: 'hp',
  baseAtk: 'atk',
  baseDef: 'def',
  baseSpd: 'spd',
}

function sanitizeFields(
  fields: unknown,
): Partial<Record<PocJobColumnMappingKey, LocalTableCellRef>> {
  if (!fields || typeof fields !== 'object') return {}
  const out: Partial<Record<PocJobColumnMappingKey, LocalTableCellRef>> = {}
  const source = fields as Record<string, unknown>
  for (const f of POC_JOB_MAPPING_FIELDS) {
    let ref = source[f.key]
    if (!ref) {
      for (const [legacyKey, mappedKey] of Object.entries(LEGACY_DRAFT_FIELD_KEYS)) {
        if (mappedKey === f.key) {
          ref = source[legacyKey]
          break
        }
      }
    }
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

export function loadPocJobDrafts(): PocJobDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(POC_JOB_DRAFTS_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return []
    const o = data as PocJobDraftsPersisted
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

export function savePocJobDrafts(drafts: PocJobDraft[]): void {
  if (typeof window === 'undefined') return
  const payload: PocJobDraftsPersisted = { version: 1, drafts }
  localStorage.setItem(POC_JOB_DRAFTS_STORAGE_KEY, JSON.stringify(payload))
}

export function resolvedDraftJobId(draft: PocJobDraft): string | null {
  const raw = draft.fields.id?.value?.trim()
  if (!raw) return null
  const resolved = resolveJobId(raw)
  return 'error' in resolved ? null : resolved.id
}

export function draftImportDisplayId(draft: PocJobDraft): string {
  return (
    draft.fields.name?.value?.trim() ||
    draft.fields.id?.value?.trim() ||
    draft.draftId.slice(0, 8)
  )
}

function flatFromDraftFields(draft: PocJobDraft): PocJobFlatRow {
  const flat = emptyPocJobFlatRow()
  for (const f of POC_JOB_MAPPING_FIELDS) {
    const v = draft.fields[f.key]?.value?.trim()
    if (v) flat[f.key] = v
  }
  return flat
}

export function validatePocJobDrafts(drafts: PocJobDraft[]): JobDraftValidationResult {
  const configs: JobClassConfig[] = []
  const draftErrors: JobDraftValidationResult['draftErrors'] = []
  const seen = new Set<string>()

  drafts.forEach((draft, index) => {
    const label = draftImportDisplayId(draft)
    if (draft.invalidReason) {
      draftErrors.push({ draftId: draft.draftId, label, error: draft.invalidReason })
      return
    }
    const flat = flatFromDraftFields(draft)
    const parsed = parseJobClassRow(flat)
    if (!parsed.config) {
      draftErrors.push({ draftId: draft.draftId, label, error: parsed.error ?? 'Invalid or missing class id' })
      return
    }
    const def = parsed.config
    if (seen.has(def.id)) {
      draftErrors.push({ draftId: draft.draftId, label, error: `Duplicate class id "${def.id}"` })
      return
    }
    seen.add(def.id)
    configs.push(def)
  })

  return { ok: draftErrors.length === 0 && configs.length > 0, configs, draftErrors }
}

export type DraftImportReject = { draftId: string; reason: string }

export function partitionDraftsByJobId(
  incoming: PocJobDraft | PocJobDraft[],
  existing: PocJobDraft[],
): { accepted: PocJobDraft[]; rejected: DraftImportReject[]; updated: PocJobDraft[] } {
  const list = Array.isArray(incoming) ? incoming : [incoming]
  const rejected: DraftImportReject[] = []
  const accepted: PocJobDraft[] = []
  const updated: PocJobDraft[] = []
  const existingIds = new Set(
    existing.map((d) => resolvedDraftJobId(d)).filter((id): id is string => Boolean(id)),
  )
  const seenIncoming = new Set<string>()

  for (const draft of list) {
    const id = resolvedDraftJobId(draft)
    if (!id) {
      rejected.push({ draftId: draft.draftId, reason: 'Missing valid class id' })
      continue
    }
    if (seenIncoming.has(id)) {
      rejected.push({ draftId: draft.draftId, reason: `Duplicate class id "${id}" in this import` })
      continue
    }
    seenIncoming.add(id)
    accepted.push(draft)
    if (existingIds.has(id)) updated.push(draft)
  }

  return { accepted, rejected, updated }
}

export function upsertPocJobDrafts(
  existing: PocJobDraft[],
  incoming: PocJobDraft[],
): PocJobDraft[] {
  const next = [...existing]
  for (const draft of incoming) {
    const id = resolvedDraftJobId(draft)
    const index = id ? next.findIndex((item) => resolvedDraftJobId(item) === id) : -1
    if (index >= 0) next[index] = draft
    else next.push(draft)
  }
  return next
}
