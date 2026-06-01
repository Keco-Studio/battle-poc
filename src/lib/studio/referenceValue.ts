/** Normalize Studio reference cell values for picker display. */

export type ReferenceSelection = {
  assetId: string
  fieldId?: string | null
  fieldLabel?: string | null
  displayValue?: string | null
}

export function normalizeReferenceSelections(value: unknown): ReferenceSelection[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) {
    if (typeof value === 'string' && value.trim() !== '') {
      return [{ assetId: value.trim() }]
    }
    return []
  }

  const normalized = value
    .map((item): ReferenceSelection | null => {
      if (typeof item === 'string' && item.trim()) {
        return { assetId: item.trim() }
      }
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        const assetId =
          (typeof o.assetId === 'string' && o.assetId.trim()) ||
          (typeof o.id === 'string' && o.id.trim()) ||
          ''
        if (!assetId) return null
        return {
          assetId,
          fieldId: typeof o.fieldId === 'string' ? o.fieldId : null,
          fieldLabel: typeof o.fieldLabel === 'string' ? o.fieldLabel : null,
          displayValue: typeof o.displayValue === 'string' ? o.displayValue : null,
        }
      }
      return null
    })
    .filter((x): x is ReferenceSelection => x !== null)

  return normalized
}
