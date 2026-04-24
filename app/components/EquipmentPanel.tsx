'use client'

import { X, Swords, ArrowLeft } from 'lucide-react'
import { GameState } from '../hooks/useGameState'
import { EquipmentType, equipmentTypes } from '../constants'

interface Props {
  game: GameState
}

export default function EquipmentPanel({ game }: Props) {
  const {
    playerLevel,
    equippedGear,
    inventory,
    setShowEquipment,
    setShowCharacter,
    equipItem,
    unequipItem,
    sellItem,
  } = game

  const hasAnyEquipment =
    equippedGear.weapon || equippedGear.ring || equippedGear.armor || equippedGear.shoes

  return (
    <div className="oc-floating-panel oc-card" role="dialog" aria-modal="false">
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
            <Swords size={18} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold text-slate-900">Equipment</div>
            <div className="truncate text-[11px] text-slate-500">
              Lv.{playerLevel} · Inventory {inventory.length} items
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowEquipment(false)
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
            onClick={() => setShowEquipment(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* 600x380: left column Equipped / right column Backpack */}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-hidden p-4">
          {/* Equipped */}
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Equipped {hasAnyEquipment ? '' : '(empty)'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['weapon', 'ring', 'armor', 'shoes'] as EquipmentType[]).map((type) => {
                const gear = equippedGear[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => gear && unequipItem(type)}
                    disabled={!gear}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${
                      gear
                        ? 'border-orange-300 bg-orange-50 hover:bg-orange-100'
                        : 'cursor-not-allowed border-dashed border-slate-300 bg-slate-50'
                    }`}
                  >
                    <div className="text-2xl">{gear ? gear.icon : equipmentTypes[type].icon}</div>
                    <div className="truncate text-[11px] font-bold text-slate-900">
                      {gear ? gear.name : equipmentTypes[type].name}
                    </div>
                    {gear ? (
                      <div className="text-[10px] font-bold text-emerald-600">
                        +{playerLevel * equipmentTypes[type].bonus}{' '}
                        {equipmentTypes[type].stat.toUpperCase()}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400">Empty</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Backpack */}
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Backpack ({inventory.length})
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {inventory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-[12px] text-slate-400">
                  No equipment
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {inventory.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-xl">{item.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-bold text-slate-900">
                            {item.name}
                          </div>
                          <div className="text-[10px] font-bold text-emerald-600">
                            +{playerLevel * equipmentTypes[item.type].bonus}{' '}
                            {equipmentTypes[item.type].stat.toUpperCase()}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => equipItem(item, idx)}
                          className="flex-1 rounded-md bg-emerald-500 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-400"
                        >
                          Equip
                        </button>
                        <button
                          type="button"
                          onClick={() => sellItem(idx)}
                          className="flex-1 rounded-md bg-amber-500 py-0.5 text-[10px] font-bold text-white hover:bg-amber-400"
                        >
                          Sell
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
