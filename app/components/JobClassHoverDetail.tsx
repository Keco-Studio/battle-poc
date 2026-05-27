'use client'

import type { ReactNode } from 'react'
import { Swords, Shield, Heart, Zap, Sparkles } from 'lucide-react'
import {
  JOB_DISPLAY_NAMES,
  JOB_DESCRIPTIONS,
  JOB_PREFERRED_RANGE,
  ROLE_STATS,
  calcPlayerStats,
  getDefaultCarriedSkillIds,
  getSkillById,
} from '../constants'
import type { JobClassId } from '../constants'

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
  const role = ROLE_STATS[jobId]
  const stats = calcPlayerStats(level, jobId)
  const skillIds = getDefaultCarriedSkillIds(jobId, 6)
  const skills = skillIds
    .map((id) => getSkillById(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))

  return (
    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <span className="text-[13px] font-bold text-slate-900">
            {JOB_DISPLAY_NAMES[jobId]}
          </span>
          <span className="ml-2 text-[11px] font-medium text-slate-400">
            {RANGE_LABELS[JOB_PREFERRED_RANGE[jobId]]} · Lv.{level}
          </span>
        </div>
        <span className="text-[10px] text-slate-400">Hover another class to compare</span>
      </div>

      <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
        {JOB_DESCRIPTIONS[jobId]}
      </p>

      <div className="mb-3 grid grid-cols-4 gap-2">
        <StatBlock icon={<Heart size={12} className="text-emerald-500" />} label="HP" value={stats.maxHp} growth={`+${role.growthHp * role.hpMult}/lv`} />
        <StatBlock icon={<Swords size={12} className="text-rose-500" />} label="ATK" value={stats.atk} growth={`+${role.growthAtk}/lv`} />
        <StatBlock icon={<Shield size={12} className="text-sky-500" />} label="DEF" value={stats.def} growth={`+${role.growthDef}/lv`} />
        <StatBlock icon={<Zap size={12} className="text-amber-500" />} label="SPD" value={stats.spd} growth={`+${role.growthSpd}/lv`} />
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <Sparkles size={10} className="text-violet-500" />
          Default skills (6)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <span
              key={skill.id}
              title={skill.desc}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700"
            >
              <span>{skill.icon}</span>
              {skill.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatBlock({
  icon,
  label,
  value,
  growth,
}: {
  icon: ReactNode
  label: string
  value: number
  growth: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-slate-500">
        {icon}
        {label}
      </div>
      <div className="text-[14px] font-bold text-slate-900">{value}</div>
      <div className="text-[9px] font-medium text-emerald-600">{growth}</div>
    </div>
  )
}
