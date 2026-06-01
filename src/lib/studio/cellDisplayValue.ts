import { normalizeReferenceSelections } from './referenceValue'

export type PickerValueOption = {
  value: string
  label: string
}

function trimStr(s: string): string {
  return s.trim()
}

function fromPrimitive(v: string | number | boolean): PickerValueOption {
  const s = trimStr(String(v))
  return { value: s, label: s }
}

function tryParseJsonString(s: string): unknown {
  const t = s.trim()
  if (!t || (t[0] !== '{' && t[0] !== '[' && t[0] !== '"')) return s
  try {
    return JSON.parse(t) as unknown
  } catch {
    return s
  }
}

export function cellToPickerOption(raw: unknown): PickerValueOption | null {
  if (raw === null || raw === undefined) return null

  let v: unknown = raw
  if (typeof v === 'string') {
    const t = trimStr(v)
    if (!t) return null
    v = tryParseJsonString(t)
    if (typeof v === 'string') return fromPrimitive(v)
  }

  if (typeof v === 'number' || typeof v === 'boolean') {
    return fromPrimitive(v)
  }

  if (Array.isArray(v)) {
    const parts = v
      .map((item) => cellToPickerOption(item)?.label)
      .filter((x): x is string => Boolean(x))
    if (parts.length === 0) return null
    const label = parts.join(', ')
    return { value: label, label }
  }

  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.assetId === 'string' && trimStr(o.assetId)) {
      const label =
        (typeof o.displayValue === 'string' && trimStr(o.displayValue)) ||
        (typeof o.fieldLabel === 'string' && trimStr(o.fieldLabel)) ||
        trimStr(o.assetId)
      return fromPrimitive(label)
    }
    if (typeof o.name === 'string' && trimStr(o.name)) return fromPrimitive(o.name)
    if (typeof o.label === 'string' && trimStr(o.label)) return fromPrimitive(o.label)
    if (o.value !== null && o.value !== undefined && typeof o.value !== 'object') {
      return cellToPickerOption(o.value)
    }
  }

  return null
}

export function cellToPickerOptions(
  raw: unknown,
  assetNameById?: ReadonlyMap<string, string>,
): PickerValueOption[] {
  const refs = normalizeReferenceSelections(raw)
  if (refs.length > 0) {
    const out: PickerValueOption[] = []
    for (const sel of refs) {
      const label =
        (sel.displayValue && trimStr(sel.displayValue)) ||
        (sel.fieldLabel && trimStr(sel.fieldLabel)) ||
        (assetNameById?.get(sel.assetId) && trimStr(assetNameById.get(sel.assetId)!)) ||
        trimStr(sel.assetId)
      if (!label) continue
      out.push({ value: label, label })
    }
    return out
  }
  const single = cellToPickerOption(raw)
  return single ? [single] : []
}

export function cellValueToString(
  raw: unknown,
  assetNameById?: ReadonlyMap<string, string>,
): string {
  const opts = cellToPickerOptions(raw, assetNameById)
  if (opts.length > 0) return opts[0]!.value
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'string') return trimStr(raw)
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  return ''
}

export function dedupePickerOptions(options: PickerValueOption[]): PickerValueOption[] {
  const byValue = new Map<string, PickerValueOption>()
  for (const opt of options) {
    if (!opt.value) continue
    if (!byValue.has(opt.value)) byValue.set(opt.value, opt)
  }
  return [...byValue.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}
