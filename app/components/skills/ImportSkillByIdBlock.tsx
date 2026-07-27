'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { cellValueToString } from '@/src/lib/studio/cellDisplayValue'
import type { PocSkillDraft, DraftImportReject } from '@/src/lib/skills/pocSkillDrafts'
import { partitionDraftsBySkillId } from '@/src/lib/skills/pocSkillDrafts'
import type { PocSkillColumnMappingKey } from '@/src/lib/skills/pocSkillFieldMapping'
import {
  buildDraftFromTableRow,
  detectIdColumnKey,
  extractIdOptionsFromRows,
  findRowByIdCell,
  planImportColumnMapping,
  type ImportAmbiguity,
} from '@/src/lib/skills/importPocSkillFromTable'
import { loadStudioTableRows, type SelectableStudioTable } from '@/src/lib/skills/studioSkillPicker'
import type { StudioTableColumn, StudioTableRow } from '@/src/lib/studio/studioLibraryService'
import {
  findDuplicateStudioRowIds,
  validateStudioTableForImport,
} from '@/src/lib/studio/validateStudioTableImport'
import { ImportSkillHeaderMappingModal } from './ImportSkillHeaderMappingModal'
import { SkillSourceSelect } from './SkillSourceSelect'
import styles from './SkillSourcePanel.module.css'

type LoadedTable = {
  columns: StudioTableColumn[]
  rows: StudioTableRow[]
}

type Props = {
  disabled?: boolean
  tables: SelectableStudioTable[]
  tablesLoading: boolean
  supabaseReady: boolean
  existingDrafts: PocSkillDraft[]
  onImportDraft: (draft: PocSkillDraft | PocSkillDraft[]) => void
  onError?: (message: string) => void
  onSuccess?: (message: string) => void
  showSectionTitle?: boolean
}

export function ImportSkillByIdBlock({
  disabled = false,
  tables,
  tablesLoading,
  supabaseReady,
  existingDrafts,
  onImportDraft,
  onError,
  onSuccess,
  showSectionTitle = true,
}: Props) {
  const supabase = useSupabaseOptional()
  const loadSeqRef = useRef(0)
  const [tableId, setTableId] = useState<string>('')
  const [loadedTable, setLoadedTable] = useState<LoadedTable | null>(null)
  const [idColumnKey, setIdColumnKey] = useState<string>('')
  const [skillIdValues, setSkillIdValues] = useState<string[]>([])
  const [tableLoading, setTableLoading] = useState(false)
  const [tableLoadError, setTableLoadError] = useState<string | null>(null)
  const [pendingAmbiguities, setPendingAmbiguities] = useState<ImportAmbiguity[] | null>(null)
  const [pendingResolutions, setPendingResolutions] = useState<
    Record<string, PocSkillColumnMappingKey>
  >({})

  useEffect(() => {
    if (!tableId && tables.length > 0) {
      setTableId(tables[0]!.id)
    }
  }, [tables, tableId])

  useEffect(() => {
    if (!tableId || !supabaseReady || !supabase) {
      setLoadedTable(null)
      setIdColumnKey('')
      setTableLoading(false)
      setTableLoadError(null)
      return
    }

    const seq = ++loadSeqRef.current
    setTableLoading(true)
    setTableLoadError(null)
    setLoadedTable(null)
    setIdColumnKey('')
    setSkillIdValues([])

    void loadStudioTableRows(supabase, tableId)
      .then((res) => {
        if (seq !== loadSeqRef.current) return
        if (!res || res.columns.length === 0) {
          setLoadedTable(null)
          setIdColumnKey('')
          setTableLoadError('Failed to load table or table has no columns')
          return
        }
        setLoadedTable(res)
        const validation = validateStudioTableForImport(res.columns, 'skills')
        if (!validation.ok) {
          setIdColumnKey('')
          setTableLoadError(validation.errors.join(' '))
          return
        }
        const detected = detectIdColumnKey(res.columns)
        const duplicateIds = detected
          ? findDuplicateStudioRowIds(res.rows, detected, 'skills')
          : []
        if (duplicateIds.length > 0) {
          setIdColumnKey('')
          setTableLoadError(`Duplicate skill id(s) in Studio table: ${duplicateIds.join(', ')}`)
          return
        }
        setIdColumnKey(detected ?? '')
      })
      .catch((err) => {
        if (seq !== loadSeqRef.current) return
        setLoadedTable(null)
        setIdColumnKey('')
        setTableLoadError(err instanceof Error ? err.message : 'Failed to load table')
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setTableLoading(false)
      })
  }, [tableId, supabase, supabaseReady])

  const columns = useMemo(() => loadedTable?.columns ?? [], [loadedTable])

  const idOptions = useMemo(() => {
    if (!loadedTable || !idColumnKey || tableLoading) return []
    return extractIdOptionsFromRows(loadedTable.rows, idColumnKey)
  }, [loadedTable, idColumnKey, tableLoading])

  const selectedIds = useMemo(
    () => [...new Set(skillIdValues.map((v) => v.trim()).filter(Boolean))],
    [skillIdValues],
  )

  const tableOptions = useMemo(
    () => tables.map((t) => ({ value: t.id, label: t.name })),
    [tables],
  )

  const columnOptions = useMemo(
    () => columns.map((c) => ({ value: c.key, label: c.label })),
    [columns],
  )

  const reportImportRejections = useCallback(
    (rejected: DraftImportReject[]) => {
      if (rejected.length === 0) return
      if (rejected.length === 1) {
        onError?.(`Failed to import "${rejected[0]!.displayId}": ${rejected[0]!.reason}`)
        return
      }
      onError?.(`Failed to import ${rejected.length} skill(s) (duplicate ids).`)
    },
    [onError],
  )

  const finishImport = useCallback(
    async (resolutions: Record<string, PocSkillColumnMappingKey>) => {
      if (!tableId || !idColumnKey || selectedIds.length === 0) return
      const loaded =
        loadedTable ??
        (await loadStudioTableRows(supabaseReady ? supabase : null, tableId))
      if (!loaded) {
        onError?.('Failed to load table')
        return
      }
      const validation = validateStudioTableForImport(loaded.columns, 'skills')
      if (!validation.ok) {
        onError?.(validation.errors.join(' '))
        return
      }
      const duplicateIds = findDuplicateStudioRowIds(loaded.rows, idColumnKey, 'skills')
      if (duplicateIds.length > 0) {
        onError?.(`Duplicate skill id(s) in Studio table: ${duplicateIds.join(', ')}`)
        return
      }
      const plan = planImportColumnMapping(loaded.columns, resolutions)
      if (plan.ambiguities.length > 0) {
        setPendingAmbiguities(plan.ambiguities)
        setPendingResolutions(resolutions)
        return
      }

      const drafts: PocSkillDraft[] = []
      const missing: string[] = []
      const ambiguous: string[] = []
      for (const skillId of selectedIds) {
        const row = findRowByIdCell(loaded.rows, idColumnKey, skillId)
        if (!row) {
          if (loaded.rows.some((candidate) => cellValueToString(candidate.values[idColumnKey]).trim().toLowerCase() === skillId.trim().toLowerCase())) {
            ambiguous.push(skillId)
          } else {
            missing.push(skillId)
          }
          continue
        }
        drafts.push(
          buildDraftFromTableRow({
            tableId,
            row,
            columnToField: plan.columnToField,
            idColumnKey,
            skillIdValue: skillId,
            columns,
          }),
        )
      }

      if (ambiguous.length > 0) {
        onError?.(`Duplicate skill id(s) in Studio table: ${ambiguous.join(', ')}`)
        return
      }

      if (missing.length > 0) {
        onError?.(`Skipped ${missing.length} id(s) not found in table`)
      }
      if (drafts.length === 0) {
        onError?.('No rows imported')
        return
      }

      const { accepted, rejected, updated } = partitionDraftsBySkillId(drafts, existingDrafts)
      reportImportRejections(rejected)

      if (accepted.length === 0) return

      onImportDraft(accepted.length === 1 ? accepted[0]! : accepted)
      const addedCount = accepted.length - updated.length
      onSuccess?.(updated.length > 0
        ? `Updated ${updated.length} and imported ${addedCount} skill draft(s)`
        : accepted.length === 1
          ? `Imported draft "${accepted[0]!.fields.id?.value ?? selectedIds[0]}"`
          : `Imported ${accepted.length} skill drafts`)
      setSkillIdValues([])
      setPendingAmbiguities(null)
    },
    [
      tableId,
      idColumnKey,
      selectedIds,
      columns,
      loadedTable,
      supabase,
      supabaseReady,
      existingDrafts,
      onImportDraft,
      reportImportRejections,
      onError,
      onSuccess,
    ],
  )

  const handleImportClick = useCallback(() => {
    if (!tableId || !idColumnKey || selectedIds.length === 0) {
      onError?.('Select table, id column, and at least one skill id')
      return
    }
    const plan = planImportColumnMapping(columns, {})
    if (plan.ambiguities.length > 0) {
      setPendingAmbiguities(plan.ambiguities)
      setPendingResolutions({})
      return
    }
    void finishImport({})
  }, [tableId, idColumnKey, selectedIds.length, columns, finishImport, onError])

  const handleMappingConfirm = useCallback(
    (resolutions: Record<string, PocSkillColumnMappingKey>) => {
      const merged = { ...pendingResolutions, ...resolutions }
      setPendingAmbiguities(null)
      void finishImport(merged)
    },
    [finishImport, pendingResolutions],
  )

  const toggleSkillId = (value: string) => {
    setSkillIdValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  const idsAreaLoading = tableLoading || (Boolean(idColumnKey) && !loadedTable)

  return (
    <>
      <div className={styles.sectionCard}>
        {showSectionTitle ? (
          <>
            <div className={styles.sectionTitle}>Import by id</div>
            <p className={styles.sectionHint}>
              Pick one or more rows by their id column. Headers map to battle fields (ratio,
              mpCost, range, cooldownTicks, etc.). Apply to catalog normalizes skill ids.
            </p>
          </>
        ) : (
          <p className={styles.sectionHint}>
            Select a Studio library, id column, and skill rows to add as drafts.
          </p>
        )}

        <div className="mb-2 grid gap-2">
          <SkillSourceSelect
            value={tableId}
            onChange={(v) => {
              setTableId(v)
            }}
            options={tableOptions}
            disabled={disabled}
            loading={tablesLoading && tableOptions.length === 0}
            placeholder="Studio library"
            aria-label="Studio library table"
          />

          <SkillSourceSelect
            value={idColumnKey}
            onChange={(v) => {
              setIdColumnKey(v)
              setSkillIdValues([])
            }}
            options={columnOptions}
            disabled={disabled || !tableId}
            loading={tableLoading && columnOptions.length === 0}
            placeholder="Id column"
            aria-label="Id column"
          />
        </div>

        {!supabaseReady ? (
          <p className={styles.warnLine}>Sign in to load Studio columns and ids.</p>
        ) : tableLoadError ? (
          <p className={styles.errorLine}>{tableLoadError}</p>
        ) : idsAreaLoading ? (
          <p className={styles.metaLine}>Loading skill ids…</p>
        ) : idOptions.length === 0 ? (
          <p className={styles.metaLine}>
            No ids in this column. Try another id column or fill rows in Studio.
          </p>
        ) : (
          <div className={`${styles.checkboxList} mb-2`}>
            {idOptions.map((opt) => (
              <label key={opt.value} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={skillIdValues.includes(opt.value)}
                  onChange={() => toggleSkillId(opt.value)}
                  disabled={disabled}
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleImportClick}
          disabled={disabled || !tableId || !idColumnKey || selectedIds.length === 0}
          className={styles.importBtn}
        >
          <Download size={14} />
          {selectedIds.length > 1
            ? `Import selected (${selectedIds.length})`
            : 'Import selected'}
        </button>
      </div>

      <ImportSkillHeaderMappingModal
        open={pendingAmbiguities !== null && pendingAmbiguities.length > 0}
        ambiguities={pendingAmbiguities ?? []}
        onCancel={() => setPendingAmbiguities(null)}
        onConfirm={handleMappingConfirm}
      />
    </>
  )
}
