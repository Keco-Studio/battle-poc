'use client'

import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Trash2 } from 'lucide-react'
import { useAuth } from '@/src/lib/contexts/AuthContext'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { useBattleGameConfig } from '@/src/lib/gameConfig/BattleGameConfigProvider'
import {
  DEFAULT_POC_GAME_CONFIG_MODULE_ID,
  DRAFT_GAME_CONFIG_MODULE_ID,
} from '@/src/lib/gameConfig/pocGameConfigModulesStorage'
import {
  draftLabel,
  loadPocGameConfigDrafts,
  savePocGameConfigDrafts,
  type PocGameConfigDraft,
} from '@/src/lib/gameConfig/pocGameConfigDrafts'
import type { GameConfigImportKind } from '@/src/lib/gameConfig/gameConfigTypes'
import { BALANCE_SCALAR_KEYS } from '@/src/lib/gameConfig/defaultGameConfig'
import { listSelectableStudioTables } from '@/src/lib/jobs/studioJobPicker'
import { ImportGameConfigBlock } from './ImportGameConfigBlock'
import { SkillSourceSelect } from '../skills/SkillSourceSelect'
import styles from '../skills/SkillSourcePanel.module.css'

type Props = {
  /** When set (import hub), lock import kind and hide type picker. */
  importKind?: GameConfigImportKind
}

export function PocGameConfigPanel({ importKind }: Props) {
  const supabase = useSupabaseOptional()
  const { userProfile, isAuthenticated, isLoading: authLoading } = useAuth()
  const {
    modules,
    activeModuleId,
    selectModule,
    applyConfigDrafts,
    isHydrating,
    hydrateError,
  } = useBattleGameConfig()

  const supabaseReady = Boolean(supabase && isAuthenticated && userProfile?.id)
  const [drafts, setDrafts] = useState<PocGameConfigDraft[]>(() => loadPocGameConfigDrafts())
  const [importError, setImportError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  const { data: studioTables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ['pocGameConfigTables', userProfile?.id],
    queryFn: () => listSelectableStudioTables(supabase!, userProfile!.id),
    enabled: supabaseReady,
  })

  const moduleOptions = modules.map((m) => ({ value: m.id, label: m.label }))

  const persistDrafts = useCallback((next: PocGameConfigDraft[]) => {
    setDrafts(next)
    savePocGameConfigDrafts(next)
  }, [])

  const handleValidateApply = useCallback(async () => {
    setValidating(true)
    setImportError(null)
    setStatusMessage(null)
    try {
      const result = await applyConfigDrafts()
      if (result.errors.length > 0) setImportError(result.errors.join('; '))
      else setStatusMessage('Applied game config from Studio drafts')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Validate failed')
    } finally {
      setValidating(false)
    }
  }, [applyConfigDrafts])

  if (authLoading) return <p className={styles.metaLine}>Checking sign-in…</p>

  return (
    <div className={`${styles.panel} mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3`}>
      {!importKind && (
        <>
          <div>
            <div className={styles.sectionTitle}>Game config source</div>
            <p className={styles.sectionHint}>
              Equipment, class skill loadouts, basic attack, exp/rewards, enemy growth, and battle
              formula scalars. Defaults apply when module is &quot;Default game config&quot;.
            </p>
          </div>

          <div>
            <span className={styles.fieldLabel}>Active module</span>
            <SkillSourceSelect
              value={activeModuleId}
              onChange={selectModule}
              options={
                moduleOptions.some((m) => m.value === DEFAULT_POC_GAME_CONFIG_MODULE_ID)
                  ? moduleOptions
                  : [...moduleOptions, { value: DEFAULT_POC_GAME_CONFIG_MODULE_ID, label: 'Default game config' }]
              }
              aria-label="Active game config module"
            />
          </div>

          <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600">Balance scalar keys</summary>
            <p className="mt-1">{BALANCE_SCALAR_KEYS.join(', ')}</p>
          </details>
        </>
      )}

      {!supabaseReady ? (
        <p className={styles.warnLine}>Sign in to import from Keco Studio.</p>
      ) : (
        <>
          <ImportGameConfigBlock
            disabled={validating}
            tables={studioTables}
            tablesLoading={tablesLoading}
            supabaseReady={supabaseReady}
            existingDrafts={drafts}
            onImportDraft={(d) => persistDrafts([...drafts, ...(Array.isArray(d) ? d : [d])])}
            onError={setImportError}
            onSuccess={setStatusMessage}
            fixedKind={importKind}
          />
          <div className={styles.sectionCard}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={styles.sectionTitle}>Config drafts ({drafts.length})</span>
              <button
                type="button"
                className={styles.applyBtn}
                disabled={validating || drafts.length === 0 || isHydrating}
                onClick={() => void handleValidateApply()}
              >
                <CheckCircle size={12} />
                {validating ? 'Applying…' : 'Validate & apply'}
              </button>
            </div>
            {drafts.length === 0 ? (
              <p className={styles.metaLine}>No drafts yet.</p>
            ) : (
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {drafts.map((d) => (
                  <li key={d.draftId} className={styles.draftRow}>
                    <span className="truncate">{draftLabel(d)}</span>
                    <button
                      type="button"
                      aria-label="Remove draft"
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600"
                      onClick={() => persistDrafts(drafts.filter((x) => x.draftId !== d.draftId))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {activeModuleId === DRAFT_GAME_CONFIG_MODULE_ID && (
              <p className={`${styles.okLine} mt-2`}>Draft module active — overrides listed config.</p>
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
