'use client'

import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Trash2 } from 'lucide-react'
import { useAuth } from '@/src/lib/contexts/AuthContext'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import {
  DEFAULT_POC_SKILL_MODULE_ID,
  DRAFT_SKILL_MODULE_ID,
} from '@/src/lib/skills/pocSkillModulesStorage'
import { useBattleSkills } from '@/src/lib/skills/BattleSkillsProvider'
import {
  loadPocSkillDrafts,
  savePocSkillDrafts,
  type PocSkillDraft,
  draftImportDisplayId,
} from '@/src/lib/skills/pocSkillDrafts'
import { listSelectableStudioTables } from '@/src/lib/skills/studioSkillPicker'
import { ImportSkillByIdBlock } from './ImportSkillByIdBlock'
import { SkillSourceSelect } from './SkillSourceSelect'
import styles from './SkillSourcePanel.module.css'

type Props = {
  /** When true, omit outer card chrome (inside Import modal). */
  embedded?: boolean
}

/** Studio skill import + catalog — used in Import hub only. */
export function SkillCatalogSourcesPanel({ embedded = false }: Props) {
  const supabase = useSupabaseOptional()
  const { userProfile, isAuthenticated, isLoading: authLoading } = useAuth()
  const {
    modules,
    activeModuleId,
    selectModule,
    applySkillDrafts,
    isHydrating,
    hydrateError,
  } = useBattleSkills()

  const supabaseReady = Boolean(supabase && isAuthenticated && userProfile?.id)
  const [drafts, setDrafts] = useState<PocSkillDraft[]>(() => loadPocSkillDrafts())
  const [importError, setImportError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  const { data: studioTables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ['pocSkillSelectableTables', userProfile?.id],
    queryFn: () => listSelectableStudioTables(supabase!, userProfile!.id),
    enabled: supabaseReady,
  })

  const moduleOptions = useMemo(() => {
    const opts = modules
      .filter((m) => m.source !== 'studio' || m.id === activeModuleId)
      .map((m) => ({ value: m.id, label: m.label }))
    if (!opts.some((m) => m.value === DEFAULT_POC_SKILL_MODULE_ID)) {
      opts.push({ value: DEFAULT_POC_SKILL_MODULE_ID, label: 'Default skills' })
    }
    return opts
  }, [modules, activeModuleId])

  const persistDrafts = useCallback((next: PocSkillDraft[]) => {
    setDrafts(next)
    savePocSkillDrafts(next)
  }, [])

  const handleImportDraft = useCallback(
    (incoming: PocSkillDraft | PocSkillDraft[]) => {
      const list = Array.isArray(incoming) ? incoming : [incoming]
      persistDrafts([...drafts, ...list])
    },
    [drafts, persistDrafts],
  )

  const handleRemoveDraft = useCallback(
    (draftId: string) => {
      persistDrafts(drafts.filter((d) => d.draftId !== draftId))
    },
    [drafts, persistDrafts],
  )

  const handleValidateApply = useCallback(async () => {
    setValidating(true)
    setImportError(null)
    setStatusMessage(null)
    try {
      const result = await applySkillDrafts()
      if (result.errors.length > 0) {
        setImportError(result.errors.join('; '))
      } else {
        setStatusMessage(`Applied ${result.skills.length} skill(s) from Studio drafts`)
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Validate failed')
    } finally {
      setValidating(false)
    }
  }, [applySkillDrafts])

  if (authLoading) {
    return <p className={styles.metaLine}>Checking sign-in…</p>
  }

  const shellClass = embedded
    ? `${styles.panel} space-y-3`
    : `${styles.panel} ${styles.unifiedShell}`

  return (
    <div className={shellClass}>
      <div>
        <div className={styles.sectionTitle}>Active catalog</div>
        <p className={styles.sectionHint}>
          Base skill set for battles. Simulation-synced skills are managed in the Skills panel.
        </p>
        <SkillSourceSelect
          value={activeModuleId}
          onChange={selectModule}
          options={moduleOptions}
          aria-label="Active skill catalog"
        />
        {activeModuleId === DRAFT_SKILL_MODULE_ID && (
          <p className={`${styles.okLine} mt-2`}>Studio draft catalog is active.</p>
        )}
      </div>

      {!supabaseReady ? (
        <p className={styles.warnLine}>
          Sign in with the same account as Keco Studio to import skills.
        </p>
      ) : (
        <div className="space-y-3">
          <ImportSkillByIdBlock
            disabled={validating}
            tables={studioTables}
            tablesLoading={tablesLoading}
            supabaseReady={supabaseReady}
            existingDrafts={drafts}
            onImportDraft={handleImportDraft}
            onError={setImportError}
            onSuccess={setStatusMessage}
          />

          <div className={styles.sectionCard}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={styles.sectionTitle}>Pending drafts ({drafts.length})</span>
              <button
                type="button"
                onClick={() => void handleValidateApply()}
                disabled={validating || drafts.length === 0 || isHydrating}
                className={styles.applyBtn}
              >
                <CheckCircle size={12} />
                {validating ? 'Applying…' : 'Apply to catalog'}
              </button>
            </div>

            {drafts.length === 0 ? (
              <p className={styles.metaLine}>
                Import rows above, then apply to replace the active catalog with draft skills.
              </p>
            ) : (
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {drafts.map((d) => (
                  <li key={d.draftId} className={styles.draftRow}>
                    <span className="truncate">{draftImportDisplayId(d)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDraft(d.draftId)}
                      aria-label="Remove draft"
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-rose-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {(hydrateError || importError) && (
        <p className={styles.errorLine}>{importError ?? hydrateError}</p>
      )}
      {statusMessage && !importError && <p className={styles.okLine}>{statusMessage}</p>}
    </div>
  )
}

/** @deprecated Use SkillCatalogSourcesPanel */
export const PocSkillDraftPanel = SkillCatalogSourcesPanel
