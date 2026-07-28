'use client'

import { useState } from 'react'
import { X, Swords, Shield, Heart, Zap, Target } from 'lucide-react'
import type { GameState } from '../hooks/useGameState'
import type { JobClassId } from '../constants'
import { calcPlayerStats } from '../constants'
import { useBattleJobs } from '@/src/lib/jobs/BattleJobsProvider'
import JobClassHoverDetail from './JobClassHoverDetail'

const JOB_ICONS: Record<string, string> = {
  relay_warden: 'R',
  hero: '⚔️',
  tank: '🛡️',
  archer: '🏹',
  mage: '🔮',
  healer: '✨',
  assassin: '🗡️',
}

const RANGE_LABELS: Record<string, string> = {
  melee: 'Melee',
  mid: 'Mid',
  ranged: 'Ranged',
}

function jobIcon(jobId: string): string {
  return JOB_ICONS[jobId] ?? '⚔️'
}

interface Props {
  game: GameState
  onClose: () => void
}

export default function JobSelectModal({ game, onClose }: Props) {
  const { jobClassIds, displayNames, descriptions, preferredRanges, roleStats } = useBattleJobs()
  const currentJob = game.jobClassId
  const level = game.playerLevel || 1
  const [hoveredJobId, setHoveredJobId] = useState<JobClassId | null>(currentJob)

  const detailJobId = hoveredJobId ?? currentJob

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <div className="oc-floating-panel oc-card !w-[680px] !h-[600px]" role="dialog" aria-modal="true">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
              <Target size={18} strokeWidth={2.4} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold text-slate-900">Choose Your Class</div>
              <div className="truncate text-[11px] text-slate-500">
                Hover to preview · click to switch class
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-3">
              {jobClassIds.map((jobId) => {
                const stats = roleStats[jobId]
                if (!stats) return null
                const isSelected = jobId === currentJob
                const lv1 = calcPlayerStats(1, jobId)
                const lv1Hp = lv1.maxHp
                const lv1Atk = lv1.atk
                const lv1Def = lv1.def
                const lv1Spd = lv1.spd
                const rangeKey = preferredRanges[jobId] ?? 'melee'

                return (
                  <button
                    key={jobId}
                    type="button"
                    onMouseEnter={() => setHoveredJobId(jobId)}
                    onFocus={() => setHoveredJobId(jobId)}
                    onClick={() => game.switchJob(jobId)}
                    className={`flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all ${
                      isSelected
                        ? 'border-fuchsia-400 bg-fuchsia-50 shadow-[0_0_12px_rgba(217,70,239,0.3)]'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{jobIcon(jobId)}</span>
                      <div>
                        <div className="text-[13px] font-bold text-slate-900">
                          {displayNames[jobId] ?? jobId}
                        </div>
                        <div className="text-[10px] font-medium text-slate-400">
                          {RANGE_LABELS[rangeKey] ?? rangeKey}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] leading-snug text-slate-500 line-clamp-2">
                      {descriptions[jobId] ?? ''}
                    </div>

                    <div className="mt-auto grid grid-cols-4 gap-1">
                      <div className="flex flex-col items-center rounded-md bg-slate-50 py-1">
                        <Heart size={10} className="text-emerald-500" />
                        <span className="text-[10px] font-bold text-slate-600">{lv1Hp}</span>
                      </div>
                      <div className="flex flex-col items-center rounded-md bg-slate-50 py-1">
                        <Swords size={10} className="text-rose-500" />
                        <span className="text-[10px] font-bold text-slate-600">{lv1Atk}</span>
                      </div>
                      <div className="flex flex-col items-center rounded-md bg-slate-50 py-1">
                        <Shield size={10} className="text-sky-500" />
                        <span className="text-[10px] font-bold text-slate-600">{lv1Def}</span>
                      </div>
                      <div className="flex flex-col items-center rounded-md bg-slate-50 py-1">
                        <Zap size={10} className="text-amber-500" />
                        <span className="text-[10px] font-bold text-slate-600">{lv1Spd}</span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="text-center text-[10px] font-bold text-fuchsia-600">
                        CURRENT CLASS
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <JobClassHoverDetail jobId={detailJobId} level={level} />
        </div>
      </div>
    </div>
  )
}
