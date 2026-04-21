'use client'

import { X, User, Swords, Shield, Heart, Zap, Sparkles } from 'lucide-react'
import { GameState } from '../hooks/useGameState'
import { EquipmentType, equipmentTypes, expForLevel } from '../constants'

interface Props {
  game: GameState
}

export default function CharacterPanel({ game }: Props) {
  const {
    playerLevel,
    playerExp,
    playerGold,
    playerHP,
    totalStats,
    equippedGear,
    setShowCharacter,
    setShowEquipment,
    setShowSkills,
    healWithGold,
  } = game

  const nextLevelExp = expForLevel(playerLevel)
  const canHeal = playerHP < totalStats.maxHp

  const statCards: {
    key: keyof typeof totalStats
    label: string
    Icon: typeof Swords
    accent: string
  }[] = [
      { key: 'atk', label: 'ATK', Icon: Swords, accent: 'text-rose-500' },
      { key: 'def', label: 'DEF', Icon: Shield, accent: 'text-sky-500' },
      { key: 'maxHp', label: 'HP', Icon: Heart, accent: 'text-emerald-500' },
      { key: 'spd', label: 'SPD', Icon: Zap, accent: 'text-amber-500' },
    ]

  return (
    <div className="oc-floating-panel oc-card" role="dialog" aria-modal="false">
      <div className="flex h-full min-h-0 flex-col">
        {/* 头部 */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
            <User size={18} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold text-slate-900">Profile</div>
            <div className="truncate text-[11px] text-slate-500">
              Lv.{playerLevel} Warrior · 金币 {playerGold}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCharacter(false)}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* 600x380 横向布局：左列 头像+属性，右列 装备+操作 */}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto p-4">
          {/* 左列 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200">
                <img src="/player/idle/south.png" alt="Player" className="h-12 w-12 object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center justify-between text-[12px] font-bold text-slate-700">
                  <span>Lv.{playerLevel} 战士</span>
                  <span className="text-slate-400">{playerExp}/{nextLevelExp}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all"
                    style={{ width: `${Math.min(100, (playerExp / Math.max(1, nextLevelExp)) * 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px] font-bold text-slate-700">
                  <span>HP</span>
                  <span className="text-slate-400">{playerHP}/{totalStats.maxHp}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${(playerHP / totalStats.maxHp) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {statCards.map(({ key, label, Icon, accent }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-0.5 rounded-xl border border-slate-200 bg-white py-1.5"
                >
                  <Icon size={14} className={accent} />
                  <div className="text-[10px] font-bold text-slate-400">{label}</div>
                  <div className="text-[13px] font-bold text-slate-900">{totalStats[key]}</div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={healWithGold}
              disabled={!canHeal}
              className={`mt-auto rounded-xl py-2 text-[12px] font-bold transition-colors ${!canHeal
                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                : 'bg-emerald-500 text-white hover:bg-emerald-400'
              }`}
            >
              {!canHeal ? '满血状态' : '回复满血（消耗金币）'}
            </button>
          </div>

          {/* 右列 */}
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Equipment
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['weapon', 'ring', 'armor', 'shoes'] as EquipmentType[]).map((type) => {
                  const gear = equippedGear[type]
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => gear && game.unequipItem(type)}
                      className={`flex h-12 w-full items-center justify-center rounded-xl border text-xl transition-colors ${gear
                        ? 'border-orange-300 bg-orange-50 hover:bg-orange-100'
                        : 'border-dashed border-slate-300 bg-slate-50 text-slate-300'
                      }`}
                      title={
                        gear
                          ? `${equipmentTypes[type].name}（点击卸下）`
                          : `${equipmentTypes[type].name}：空`
                      }
                    >
                      {gear ? gear.icon : equipmentTypes[type].icon}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCharacter(false)
                  setShowEquipment(true)
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
              >
                <Swords size={14} className="text-rose-500" /> 装备
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCharacter(false)
                  setShowSkills(true)
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50"
              >
                <Sparkles size={14} className="text-violet-500" /> 技能
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
