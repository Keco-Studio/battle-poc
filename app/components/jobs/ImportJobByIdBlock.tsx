'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import type { PocJobDraft } from '@/src/lib/jobs/pocJobDrafts'
import { partitionDraftsByJobId, type DraftImportReject } from '@/src/lib/jobs/pocJobDrafts'
import type { PocJobColumnMappingKey } from '@/src/lib/jobs/pocJobFieldMapping'
import {
  buildDraftFromTableRow,
  detectIdColumnKey,
  extractIdOptionsFromRows,
  findRowByIdCell,
  planImportColumnMapping,
  type ImportAmbiguity,
} from '@/src/lib/jobs/importPocJobFromTable'
import { loadStudioTableRows, type SelectableStudioTable } from '@/src/lib/jobs/studioJobPicker'
import type { StudioTableColumn, StudioTableRow } from '@/src/lib/studio/studioLibraryService'
import { ImportJobHeaderMappingModal } from './ImportJobHeaderMappingModal'
import { SkillSourceSelect } from '../skills/SkillSourceSelect'
import styles from '../skills/SkillSourcePanel.module.css'

type LoadedTable = {
  columns: StudioTableColumn[]
  rows: StudioTableRow[]
}

type Props = {
  disabled?: boolean
  tables: SelectableStudioTable[]
  tablesLoading: boolean
  supabaseReady: boolean
  existingDrafts: PocJobDraft[]
  onImportDraft: (draft: PocJobDraft | PocJobDraft[]) => void
  onError?: (message: string) => void
  onSuccess?: (message: string) => void
}

export function ImportJobByIdBlock({
  disabled = false,
  tables,
  tablesLoading,
  supabaseReady,
  existingDrafts,
  onImportDraft,
  onError,
  onSuccess,
}: Props) {
  const supabase = useSupabaseOptional()
  const loadSeqRef = useRef(0)
  const [tableId, setTableId] = useState<string>('')
  const [loadedTable, setLoadedTable] = useState<LoadedTable | null>(null)
  const [idColumnKey, setIdColumnKey] = useState<string>('')
  const [jobIdValues, setJobIdValues] = useState<string[]>([])
  const [tableLoading, setTableLoading] = useState(false)
  const [tableLoadError, setTableLoadError] = useState<string | null>(null)
  const [pendingAmbiguities, setPendingAmbiguities] = useState<ImportAmbiguity[] | null>(null)
  const [pendingResolutions, setPendingResolutions] = useState<
    Record<string, PocJobColumnMappingKey>
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
    setJobIdValues([])

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
        const detected = detectIdColumnKey(res.columns)
        setIdColumnKey(detected ?? res.columns[0]!.key)
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

  const columns = loadedTable?.columns ?? []

  const idOptions = useMemo(() => {
    if (!loadedTable || !idColumnKey || tableLoading) return []
    return extractIdOptionsFromRows(loadedTable.rows, idColumnKey)
  }, [loadedTable, idColumnKey, tableLoading])

  const selectedIds = useMemo(
    () => [...new Set(jobIdValues.map((v) => v.trim()).filter(Boolean))],
    [jobIdValues],
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
        onError?.(`Failed to import "${rejected[0]!.draftId}": ${rejected[0]!.reason}`)
        return
      }
      onError?.(`Failed to import ${rejected.length} class(es) (duplicate ids).`)
    },
    [onError],
  )

  const finishImport = useCallback(
    async (resolutions: Record<string, PocJobColumnMappingKey>) => {
      if (!tableId || !idColumnKey || selectedIds.length === 0) return
      const loaded =
        loadedTable ?? (await loadStudioTableRows(supabaseReady ? supabase : null, tableId))
      if (!loaded) {
        onError?.('Failed to load table')
        return
      }
      const plan = planImportColumnMapping(loaded.columns, resolutions)
      if (plan.ambiguities.length > 0) {
        setPendingAmbiguities(plan.ambiguities)
        setPendingResolutions(resolutions)
        return
      }

      const drafts: PocJobDraft[] = []
      const missing: string[] = []
      for (const jobId of selectedIds) {
        const row = findRowByIdCell(loaded.rows, idColumnKey, jobId)
        if (!row) {
          missing.push(jobId)
          continue
        }
        drafts.push(
          buildDraftFromTableRow({
            tableId,
            row,
            columnToField: plan.columnToField,
            idColumnKey,
            jobIdValue: jobId,
          }),
        )
      }

      if (missing.length > 0) {
        onError?.(`Skipped ${missing.length} id(s) not found in table`)
      }
      if (drafts.length === 0) {
        onError?.('No rows imported')
        return
      }

      const { accepted, rejected } = partitionDraftsByJobId(drafts, existingDrafts)
      reportImportRejections(rejected)

      if (accepted.length === 0) return

      onImportDraft(accepted.length === 1 ? accepted[0]! : accepted)
      onSuccess?.(
        accepted.length === 1
          ? `Imported draft "${accepted[0]!.fields.id?.value ?? selectedIds[0]}"`
          : `Imported ${accepted.length} class drafts`,
      )
      setJobIdValues([])
      setPendingAmbiguities(null)
    },
    [
      tableId,
      idColumnKey,
      selectedIds,
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
      onError?.('Select table, id column, and at least one class id')
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
    (resolutions: Record<string, PocJobColumnMappingKey>) => {
      const merged = { ...pendingResolutions, ...resolutions }
      setPendingAmbiguities(null)
      void finishImport(merged)
    },
    [finishImport, pendingResolutions],
  )

  const toggleJobId = (value: string) => {
    setJobIdValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  const idsAreaLoading = tableLoading || (Boolean(idColumnKey) && !loadedTable)

  return (
    <>
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>Import class by id</div>
        <p className={styles.sectionHint}>
          Map Studio columns to Lv.1 stats and per-level growth (hp, growthHp, hpMult, etc.).
          Max HP in battle = hp + growthHp × (level − 1). {/* hpMult temporarily disabled */}
          Validate &amp; apply to refresh live values.
        </p>

        <div className="mb-2 grid gap-2">
          <SkillSourceSelect
            value={tableId}
            onChange={(v) => setTableId(v)}
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
              setJobIdValues([])
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
          <p className={styles.metaLine}>Loading class ids…</p>
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
                  checked={jobIdValues.includes(opt.value)}
                  onChange={() => toggleJobId(opt.value)}
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

      <ImportJobHeaderMappingModal
        open={pendingAmbiguities !== null && pendingAmbiguities.length > 0}
        ambiguities={pendingAmbiguities ?? []}
        onCancel={() => setPendingAmbiguities(null)}
        onConfirm={handleMappingConfirm}
      />
    </>
  )
}
