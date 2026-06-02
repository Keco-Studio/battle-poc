'use client'

import type { ReactNode } from 'react'
import { Swords, Shield, Heart, Zap, Sparkles } from 'lucide-react'
import { calcPlayerStats, getDefaultCarriedSkillIds, getSkillById } from '../constants'
import type { JobClassId } from '../constants'
import { useBattleJobs } from '@/src/lib/jobs/BattleJobsProvider'

const RANGE_LABELS: Record<string, string> = {
  melee: 'Melee',
  mid: 'Mid',
  ranged: 'Ranged',
}

interface Props {
  jobId: JobClassId
  level: number
}

export default function JobClassHoverDetail({ jobId, level }: Props) {
  const { displayNames, descriptions, preferredRanges, roleStats } = useBattleJobs()
  const role = roleStats[jobId]
  const stats = calcPlayerStats(level, jobId)
  const skillIds = getDefaultCarriedSkillIds(jobId, 6)
  const skills = skillIds
    .map((id) => getSkillById(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))

  if (!role) {
    return (
      <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-[12px] text-slate-500">
        Unknown class &quot;{jobId}&quot;
      </div>
    )
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <span className="text-[13px] font-bold text-slate-900">
            {displayNames[jobId] ?? jobId}
          </span>
          <span className="ml-2 text-[11px] text-slate-500">
            {RANGE_LABELS[preferredRanges[jobId] ?? 'melee'] ?? 'Melee'} · Lv.{level}
          </span>
        </div>
      </div>

      <p className="mb-2 text-[11px] leading-snug text-slate-600">
        {descriptions[jobId] ?? ''}
      </p>

      <div className="mb-2 grid grid-cols-4 gap-2">
        <StatChip label="HP" value={stats.maxHp} Icon={Heart} accent="text-emerald-500" />
        <StatChip label="ATK" value={stats.atk} Icon={Swords} accent="text-rose-500" />
        <StatChip label="DEF" value={stats.def} Icon={Shield} accent="text-sky-500" />
        <StatChip label="SPD" value={stats.spd} Icon={Zap} accent="text-amber-500" />
      </div>

      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        Default skills
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {skills.length === 0 ? (
          <span className="text-[11px] text-slate-400">—</span>
        ) : (
          skills.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
            >
              <Sparkles size={10} className="text-violet-400" />
              {s.name}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function StatChip({
  label,
  value,
  Icon,
  accent,
}: {
  label: string
  value: number
  Icon: typeof Swords
  accent: string
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-slate-200 bg-white py-1.5">
      <Icon size={12} className={accent} />
      <div className="text-[9px] font-bold text-slate-400">{label}</div>
      <div className="text-[12px] font-bold text-slate-900">{value}</div>
    </div>
  )
}
