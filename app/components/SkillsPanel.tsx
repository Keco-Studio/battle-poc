'use client'

import { X, Sparkles, ArrowLeft, Lock } from 'lucide-react'
import { GameState } from '../hooks/useGameState'
import { allSkills } from '../constants'

interface Props {
  game: GameState
}

export default function SkillsPanel({ game }: Props) {
  const {
    playerLevel,
    setShowSkills,
    setShowCharacter,
    getAvailableSkills,
    carriedSkillIds,
    setCarriedSkillIds,
  } = game

  const carriedSkills = getAvailableSkills()
  const unlockedSkills = allSkills.filter((skill) => skill.unlockLevel <= playerLevel)

  const toggleCarry = (skillId: string) => {
    const exists = carriedSkillIds.includes(skillId)
    if (exists) {
      setCarriedSkillIds(carriedSkillIds.filter((id) => id !== skillId))
      return
    }
    if (carriedSkillIds.length >= 6) return
    setCarriedSkillIds([...carriedSkillIds, skillId])
  }

  return (
    <div className="oc-floating-panel oc-card" role="dialog" aria-modal="false">
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
            <Sparkles size={18} strokeWidth={2.4} className="text-violet-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold text-slate-900">Skills</div>
            <div className="truncate text-[11px] text-slate-500">
              Carried {carriedSkills.length}/6 · Unlocked {unlockedSkills.length}/{allSkills.length}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowSkills(false)
              setShowCharacter(true)
            }}
            aria-label="Back to character"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowSkills(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            {allSkills.map((skill) => {
              const unlocked = skill.unlockLevel <= playerLevel
              const checked = carriedSkillIds.includes(skill.id)
              const disabledByLimit = !checked && carriedSkillIds.length >= 6
              return (
                <div
                  key={skill.id}
                  className={`relative flex flex-col gap-1.5 rounded-xl border p-3 transition-colors ${
                    !unlocked
                      ? 'border-slate-200 bg-slate-50 opacity-70'
                      : checked
                        ? 'border-orange-300 bg-orange-50'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl ${
                        unlocked ? 'bg-white ring-1 ring-slate-200' : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      {unlocked ? skill.icon : <Lock size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-slate-900">
                        {skill.name}
                      </div>
                      {!unlocked && (
                        <div className="text-[10px] font-bold text-rose-500">
                          Requires Lv.{skill.unlockLevel}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] leading-snug text-slate-500">{skill.desc}</div>
                  {unlocked && (
                    <button
                      type="button"
                      onClick={() => toggleCarry(skill.id)}
                      disabled={disabledByLimit}
                      className={`mt-1 rounded-md py-1 text-[11px] font-bold transition-colors ${
                        checked
                          ? 'bg-orange-500 text-white hover:bg-orange-400'
                          : disabledByLimit
                            ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                            : 'bg-slate-900 text-white hover:bg-slate-700'
                      }`}
                    >
                      {checked ? 'Equipped' : disabledByLimit ? 'Slot full (6)' : 'Equip'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
