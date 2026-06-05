'use client'

import { useCallback, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/src/lib/contexts/AuthContext'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { useBattleSkills } from '@/src/lib/skills/BattleSkillsProvider'
import styles from './SkillSourcePanel.module.css'

export function SimulationSkillSyncPanel() {
  const supabase = useSupabaseOptional()
  const { userProfile, isAuthenticated, isLoading: authLoading } = useAuth()
  const { simulationSyncSkills, syncSimulationSkills, isHydrating } = useBattleSkills()
  const [syncing, setSyncing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const supabaseReady = Boolean(supabase && isAuthenticated && userProfile?.id)

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const result = await syncSimulationSkills()
      if (result.errors.length > 0) {
        setErrorMessage(result.errors.join('; '))
      } else if (result.syncedCount > 0) {
        setStatusMessage(`Synced ${result.syncedCount} skill(s) from keco-simulation`)
      } else if (result.warnings.length > 0) {
        setStatusMessage(result.warnings[0] ?? 'No simulation drafts found')
      } else {
        setStatusMessage('Sync complete')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [syncSimulationSkills])

  if (authLoading) {
    return null
  }

  return (
    <div className={`${styles.syncShell} mb-4`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className={styles.sectionTitle}>Simulation sync</div>
          <p className={styles.sectionHint}>
            Pull Studio import drafts from keco-simulation. Re-sync after Studio table changes.
          </p>
        </div>
        {!supabaseReady ? null : (
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || isHydrating}
            className={styles.applyBtn}
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : undefined} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        )}
      </div>

      {!supabaseReady ? (
        <p className={styles.warnLine}>Sign in to sync skills from keco-simulation.</p>
      ) : simulationSyncSkills.length > 0 ? (
        <p className={styles.metaLine}>
          {simulationSyncSkills.length} simulation skill
          {simulationSyncSkills.length === 1 ? '' : 's'} loaded — see list below.
        </p>
      ) : (
        <p className={styles.metaLine}>
          No simulation skills synced yet. Import in keco-simulation first, then tap Sync.
        </p>
      )}

      {errorMessage && <p className={`${styles.errorLine} mt-2`}>{errorMessage}</p>}
      {statusMessage && !errorMessage && (
        <p className={`${styles.okLine} mt-2`}>{statusMessage}</p>
      )}
    </div>
  )
}
