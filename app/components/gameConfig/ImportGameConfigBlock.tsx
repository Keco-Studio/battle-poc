'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import type { PocGameConfigDraft } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import { draftLabel, pocGameConfigDraftIdentity } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import type { GameConfigImportKind } from '@/src/lib/gameConfig/gameConfigTypes'
import {
  buildDraftFromTableRow,
  detectIdColumnKey,
  extractIdOptionsFromRows,
  findRowByIdCell,
} from '@/src/lib/gameConfig/importPocGameConfig'
import { loadStudioTableRows, type SelectableStudioTable } from '@/src/lib/jobs/studioJobPicker'
import { SkillSourceSelect } from '../skills/SkillSourceSelect'
import {
  findDuplicateStudioRowIds,
  validateStudioTableForImport,
} from '@/src/lib/studio/validateStudioTableImport'
import styles from '../skills/SkillSourcePanel.module.css'

const KIND_OPTIONS: { value: GameConfigImportKind; label: string }[] = [
  { value: 'equipment', label: 'Equipment slot (weapon/ring/armor/shoes)' },
  { value: 'loadout', label: 'Class default skills (job id + skill ids)' },
  { value: 'balance_scalar', label: 'Balance key (exp, enemy formula, damage mult…)' },
  { value: 'basic_attack', label: 'Basic attack (id=basic_attack)' },
]

type Props = {
  disabled?: boolean
  tables: SelectableStudioTable[]
  tablesLoading: boolean
  supabaseReady: boolean
  existingDrafts: PocGameConfigDraft[]
  onImportDraft: (draft: PocGameConfigDraft | PocGameConfigDraft[]) => void
  onError?: (message: string) => void
  onSuccess?: (message: string) => void
  /** When set (import hub), hide type picker and lock import kind. */
  fixedKind?: GameConfigImportKind
}

export function ImportGameConfigBlock({
  disabled = false,
  tables,
  tablesLoading,
  supabaseReady,
  existingDrafts,
  onImportDraft,
  onError,
  onSuccess,
  fixedKind,
}: Props) {
  const supabase = useSupabaseOptional()
  const [kind, setKind] = useState<GameConfigImportKind>(fixedKind ?? 'balance_scalar')
  const [tableId, setTableId] = useState('')
  const [loaded, setLoaded] = useState<{ columns: import('@/src/lib/studio/studioLibraryService').StudioTableColumn[]; rows: import('@/src/lib/studio/studioLibraryService').StudioTableRow[] } | null>(null)
  const [idColumnKey, setIdColumnKey] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const loadSeq = useRef(0)
  const effectiveKind = fixedKind ?? kind

  useEffect(() => {
    if (!tableId && tables.length > 0) setTableId(tables[0]!.id)
  }, [tables, tableId])

  useEffect(() => {
    if (!tableId || !supabaseReady || !supabase) {
      setLoaded(null)
      return
    }
    const seq = ++loadSeq.current
    setLoading(true)
    setLoaded(null)
    setIdColumnKey('')
    setSelectedIds([])
    void loadStudioTableRows(supabase, tableId)
      .then((res) => {
        if (seq !== loadSeq.current) return
        if (!res || res.columns.length === 0) {
          setLoaded(null)
          setIdColumnKey('')
          onError?.('Failed to load table')
          return
        }
        setLoaded(res)
        const validation = validateStudioTableForImport(res.columns, effectiveKind)
        const detected = validation.ok
          ? detectIdColumnKey(res.columns, effectiveKind)
          : undefined
        const duplicateIds = detected
          ? findDuplicateStudioRowIds(res.rows, detected, effectiveKind)
          : []
        if (duplicateIds.length > 0) {
          setIdColumnKey('')
          onError?.(`Duplicate config id(s) in Studio table: ${duplicateIds.join(', ')}`)
          return
        }
        setIdColumnKey(detected ?? '')
        if (!validation.ok) onError?.(validation.errors.join(' '))
        setSelectedIds([])
      })
      .catch((error) => {
        if (seq !== loadSeq.current) return
        setLoaded(null)
        setIdColumnKey('')
        setSelectedIds([])
        onError?.(error instanceof Error ? error.message : 'Failed to load table')
      })
      .finally(() => {
        if (seq === loadSeq.current) setLoading(false)
      })
  }, [tableId, supabase, supabaseReady, effectiveKind, onError])

  const idOptions = useMemo(() => {
    if (!loaded || !idColumnKey) return []
    return extractIdOptionsFromRows(loaded.rows, idColumnKey)
  }, [loaded, idColumnKey])

  const handleImport = useCallback(() => {
    if (!loaded || !idColumnKey || selectedIds.length === 0) {
      onError?.('Select table, id column, and at least one row id')
      return
    }
    const validation = validateStudioTableForImport(loaded.columns, effectiveKind)
    if (!validation.ok) {
      onError?.(validation.errors.join(' '))
      return
    }
    const duplicateIds = findDuplicateStudioRowIds(loaded.rows, idColumnKey, effectiveKind)
    if (duplicateIds.length > 0) {
      onError?.(`Duplicate config id(s) in Studio table: ${duplicateIds.join(', ')}`)
      return
    }
    const drafts: PocGameConfigDraft[] = []
    const ambiguous: string[] = []
    for (const id of selectedIds) {
      const row = findRowByIdCell(loaded.rows, idColumnKey, id)
      if (!row) {
        if (loaded.rows.some((candidate) => cellValueToString(candidate.values[idColumnKey]).trim().toLowerCase() === id.trim().toLowerCase())) {
          ambiguous.push(id)
        }
        continue
      }
      drafts.push(
        buildDraftFromTableRow({
          kind: effectiveKind,
          tableId,
          row,
          columns: loaded.columns,
          idColumnKey,
          idValue: id,
        }),
      )
    }
    if (ambiguous.length > 0) {
      onError?.(`Duplicate config id(s) in Studio table: ${ambiguous.join(', ')}`)
      return
    }
    if (drafts.length === 0) {
      onError?.('No matching rows')
      return
    }
    const seenIncoming = new Set<string>()
    const accepted = drafts.filter((draft) => {
      const identity = pocGameConfigDraftIdentity(draft)
      if (!identity || !seenIncoming.has(identity)) {
        if (identity) seenIncoming.add(identity)
        return true
      }
      return false
    })
    if (accepted.length !== drafts.length) {
      onError?.('Duplicate config id in this import')
    }
    if (accepted.length === 0) {
      return
    }
    const existingIdentities = new Set(existingDrafts.map(pocGameConfigDraftIdentity))
    const updatedCount = accepted.filter((draft) => existingIdentities.has(pocGameConfigDraftIdentity(draft))).length
    onImportDraft(accepted.length === 1 ? accepted[0]! : accepted)
    onSuccess?.(updatedCount > 0
      ? `Updated ${updatedCount} and imported ${accepted.length - updatedCount} config draft(s)`
      : `Imported ${accepted.length} config draft(s)`)
    setSelectedIds([])
  }, [loaded, idColumnKey, selectedIds, effectiveKind, tableId, existingDrafts, onImportDraft, onError, onSuccess])

  const tableOptions = tables.map((t) => ({ value: t.id, label: t.name }))
  const columnOptions = (loaded?.columns ?? []).map((c) => ({ value: c.key, label: c.label }))

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionTitle}>Import game config</div>
      <p className={styles.sectionHint}>
        Pick import type, Studio library, and row ids. Multiple balance_scalar rows can be imported
        (one key per row). Loadout row: id=hero, skillIds=skill_a,skill_b,…
      </p>
      <div className="mb-2 grid gap-2">
        {!fixedKind && (
          <SkillSourceSelect
            value={kind}
            onChange={(v) => setKind(v as GameConfigImportKind)}
            options={KIND_OPTIONS}
            aria-label="Config import type"
          />
        )}
        <SkillSourceSelect
          value={tableId}
          onChange={setTableId}
          options={tableOptions}
          loading={tablesLoading}
          placeholder="Studio library"
          aria-label="Studio library"
        />
        <SkillSourceSelect
          value={idColumnKey}
          onChange={(v) => {
            setIdColumnKey(v)
            setSelectedIds([])
          }}
          options={columnOptions}
          disabled={!tableId}
          placeholder="Id column"
          aria-label="Id column"
        />
      </div>
      {!supabaseReady ? (
        <p className={styles.warnLine}>Sign in to load Studio tables.</p>
      ) : loading ? (
        <p className={styles.metaLine}>Loading rows…</p>
      ) : (
        <div className={`${styles.checkboxList} mb-2 max-h-32`}>
          {idOptions.map((opt) => (
            <label key={opt.value} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={selectedIds.includes(opt.value)}
                onChange={() =>
                  setSelectedIds((prev) =>
                    prev.includes(opt.value) ? prev.filter((x) => x !== opt.value) : [...prev, opt.value],
                  )
                }
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
      <button
        type="button"
        className={styles.importBtn}
        disabled={disabled || selectedIds.length === 0}
        onClick={handleImport}
      >
        <Download size={14} />
        Import selected ({selectedIds.length})
      </button>
      {existingDrafts.length > 0 && (
        <p className={`${styles.metaLine} mt-2`}>
          Drafts: {existingDrafts.map(draftLabel).join(', ')}
        </p>
      )}
    </div>
  )
}
