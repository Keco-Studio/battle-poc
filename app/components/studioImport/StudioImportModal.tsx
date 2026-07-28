'use client'

import { ArrowLeft, Download, X, ChevronRight } from 'lucide-react'
import type { GameState } from '@/app/hooks/useGameState'
import { SkillCatalogSourcesPanel } from '../skills/SkillCatalogSourcesPanel'
import { PocJobConfigPanel } from '../jobs/PocJobConfigPanel'
import { PocGameConfigPanel } from '../gameConfig/PocGameConfigPanel'
import { useBattleSkills } from '@/src/lib/skills/BattleSkillsProvider'
import { useBattleJobs } from '@/src/lib/jobs/BattleJobsProvider'
import { useBattleGameConfig } from '@/src/lib/gameConfig/BattleGameConfigProvider'
import { LocalModeNotice } from '../LocalModeNotice'
import {
  STUDIO_IMPORT_CATALOG,
  draftCountForCategory,
  type StudioImportCategoryId,
} from './studioImportCatalog'
import styles from '../skills/SkillSourcePanel.module.css'

type Props = {
  game: GameState
}

function activeModuleLabel(
  id: StudioImportCategoryId,
  skillLabel: string,
  jobLabel: string,
  configLabel: string,
): string {
  if (id === 'skills') return skillLabel
  if (id === 'job_classes') return jobLabel
  return configLabel
}

export default function StudioImportModal({ game }: Props) {
  const { showStudioImport, studioImportCategory, closeStudioImport, setStudioImportCategory } = game
  const { modules: skillModules, activeModuleId: activeSkillModuleId } = useBattleSkills()
  const { modules: jobModules, activeModuleId: activeJobModuleId } = useBattleJobs()
  const { modules: configModules, activeModuleId: activeConfigModuleId } = useBattleGameConfig()

  const skillModuleLabel =
    skillModules.find((m) => m.id === activeSkillModuleId)?.label ?? activeSkillModuleId
  const jobModuleLabel =
    jobModules.find((m) => m.id === activeJobModuleId)?.label ?? activeJobModuleId
  const configModuleLabel =
    configModules.find((m) => m.id === activeConfigModuleId)?.label ?? activeConfigModuleId

  const catalogRows = STUDIO_IMPORT_CATALOG.map((entry) => ({
    ...entry,
    draftCount: draftCountForCategory(entry.id),
    activeLabel: activeModuleLabel(
      entry.id,
      skillModuleLabel,
      jobModuleLabel,
      configModuleLabel,
    ),
  }))

  if (!showStudioImport) return null

  const activeEntry = studioImportCategory
    ? STUDIO_IMPORT_CATALOG.find((e) => e.id === studioImportCategory)
    : null

  return (
    <div className="oc-floating-panel oc-card" role="dialog" aria-modal="false">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-violet-600 shadow-sm ring-1 ring-slate-200">
            <Download size={18} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold text-slate-900">
              {activeEntry ? activeEntry.title : 'Import'}
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {activeEntry
                ? activeEntry.description
                : 'Skills, class stats, equipment, loadouts, and battle formulas — all from here.'}
            </div>
          </div>
          {activeEntry && (
            <button
              type="button"
              onClick={() => setStudioImportCategory(null)}
              aria-label="返回列表"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="返回"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={closeStudioImport}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3">
            <LocalModeNotice />
          </div>
          {!activeEntry ? (
            <ul className="space-y-2">
              {catalogRows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setStudioImportCategory(row.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-slate-900">{row.title}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                        {row.description}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-semibold">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                          Drafts {row.draftCount}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                          Active · {row.activeLabel}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          ) : activeEntry.id === 'skills' ? (
            <SkillCatalogSourcesPanel embedded />
          ) : activeEntry.id === 'job_classes' ? (
            <PocJobConfigPanel embedded />
          ) : (
            <PocGameConfigPanel embedded importKind={activeEntry.gameConfigKind} />
          )}
        </div>

        {!activeEntry && (
          <p className={`${styles.metaLine} border-t border-slate-100 px-4 py-2`}>
            Sign in with your Keco Studio account. Simulation skill sync is in the Skills panel.
          </p>
        )}
      </div>
    </div>
  )
}
