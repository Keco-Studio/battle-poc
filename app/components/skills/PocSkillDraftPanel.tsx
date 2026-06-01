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

export function PocSkillDraftPanel() {
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

  const moduleOptions = useMemo(
    () =>
      modules
        .filter((m) => m.source !== 'studio' || m.id === activeModuleId)
        .map((m) => ({ value: m.id, label: m.label })),
    [modules, activeModuleId],
  )

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
        setStatusMessage(`Applied ${result.skills.length} skills from drafts`)
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

  const allModuleOptions =
    moduleOptions.some((m) => m.value === DEFAULT_POC_SKILL_MODULE_ID)
      ? moduleOptions
      : [...moduleOptions, { value: DEFAULT_POC_SKILL_MODULE_ID, label: 'Default skills' }]

  return (
    <div className={`${styles.panel} mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3`}>
      <div>
        <div className={styles.sectionTitle}>Skill source</div>
        <p className={styles.sectionHint}>
          Default skills or Studio draft import by id. Drafts refresh from Studio on Validate
          &amp; apply.
        </p>
      </div>

      <div>
        <span className={styles.fieldLabel}>Active module</span>
        <SkillSourceSelect
          value={activeModuleId}
          onChange={selectModule}
          options={allModuleOptions}
          aria-label="Active skill module"
        />
      </div>

      {!supabaseReady ? (
        <p className={styles.warnLine}>
          Sign in with the same Supabase account as Keco Studio to import skills.
        </p>
      ) : (
        <>
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
              <span className={styles.sectionTitle}>Skill drafts ({drafts.length})</span>
              <button
                type="button"
                onClick={() => void handleValidateApply()}
                disabled={validating || drafts.length === 0 || isHydrating}
                className={styles.applyBtn}
              >
                <CheckCircle size={12} />
                {validating ? 'Applying…' : 'Validate & apply'}
              </button>
            </div>

            {drafts.length === 0 ? (
              <p className={styles.metaLine}>
                No drafts yet. Use Import by id above, then Validate &amp; apply.
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

            {activeModuleId === DRAFT_SKILL_MODULE_ID && (
              <p className={`${styles.okLine} mt-2`}>
                Draft module is active — battle uses validated draft skills.
              </p>
            )}
          </div>
        </>
      )}

      {(hydrateError || importError) && (
        <p className={styles.errorLine}>{importError ?? hydrateError}</p>
      )}
      {statusMessage && !importError && <p className={styles.okLine}>{statusMessage}</p>}
    </div>
  )
}
