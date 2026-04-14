'use client'

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

  const hasAnyEquipment = equippedGear.weapon || equippedGear.ring || equippedGear.armor || equippedGear.shoes

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 装备面板 - 800x600 */}
      <div className="relative w-[800px] h-[600px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-12 flex items-center justify-center shrink-0">
          <span className="text-orange-900 font-bold text-lg">装 备 系 统</span>
        </div>

        <div className="flex-1 flex">
          {/* 左侧: 已装备 */}
          <div className="w-1/2 p-4 flex flex-col gap-4">
            <div className="text-white font-bold text-center mb-2">
              已装备 {hasAnyEquipment ? '' : '(空)'}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(['weapon', 'ring', 'armor', 'shoes'] as EquipmentType[]).map(type => (
                <button
                  key={type}
                  onClick={() => unequipItem(type)}
                  className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 ${equippedGear[type]
                      ? 'bg-yellow-900/50 border-yellow-400 hover:bg-yellow-800/50 cursor-pointer'
                      : 'bg-gray-800/50 border-gray-600 border-dashed'
                    }`}
                >
                  <div className="text-3xl">{equippedGear[type] ? equippedGear[type]!.icon : ''}</div>
                  <div className="text-white text-xs font-bold">
                    {equippedGear[type] ? equippedGear[type]!.name : equipmentTypes[type].name}
                  </div>
                  {equippedGear[type] && (
                    <>
                      <div className="text-yellow-400 text-[10px]">点击卸下</div>
                      <div className="text-green-400 text-[10px]">
                        +{playerLevel * equipmentTypes[type].bonus} {equipmentTypes[type].stat.toUpperCase()}
                      </div>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧: 背包 */}
          <div className="w-1/2 p-4 flex flex-col gap-4">
            <div className="text-white font-bold text-center mb-2">
              背包 ({inventory.length})
            </div>
            <div className="grid grid-cols-4 gap-2 flex-1 content-start">
              {inventory.length === 0 && (
                <div className="col-span-4 text-gray-500 text-center text-sm">暂无装备</div>
              )}
              {inventory.map((item, idx) => (
                <div key={idx} className="relative p-2 rounded-lg bg-blue-900/50 border border-blue-500 flex flex-col items-center gap-1">
                  <div className="text-2xl">{item.icon}</div>
                  <div className="text-white text-[10px]">{item.name}</div>
                  <div className="text-green-400 text-[8px]">
                    +{playerLevel * equipmentTypes[item.type].bonus} {equipmentTypes[item.type].stat.toUpperCase()}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={() => equipItem(item, idx)}
                      className="px-2 py-0.5 bg-green-600 hover:bg-green-500 rounded text-white text-[10px]"
                    >
                      装备
                    </button>
                    <button
                      onClick={() => sellItem(idx)}
                      className="px-2 py-0.5 bg-yellow-600 hover:bg-yellow-500 rounded text-white text-[10px]"
                    >
                      出售
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 返回按钮 */}
        <button
          onClick={() => { setShowEquipment(false); setShowCharacter(true); }}
          className="absolute bottom-3 right-3 px-4 py-1.5 bg-blue-500 hover:bg-blue-400 rounded-lg text-white font-bold text-sm border-2 border-blue-300"
        >
          返回
        </button>
      </div>
    </div>
  )
}
