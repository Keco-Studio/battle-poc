'use client'

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
    autoFleeHpPercent,
    setAutoFleeHpPercent,
  } = game

  const nextLevelExp = expForLevel(playerLevel)
  const healCost = playerLevel * 3
  const canHeal = playerGold >= healCost && playerHP < totalStats.maxHp

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 角色面板 - 800x600 */}
      <div className="relative w-[800px] h-[600px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-12 flex items-center justify-center shrink-0">
          <span className="text-orange-900 font-bold text-lg">角 色 信 息</span>
        </div>

        {/* 等级和经验 */}
        <div className="bg-blue-900/50 px-4 py-2 border-b-2 border-blue-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white font-bold">等级 Lv.{playerLevel}</span>
            <span className="text-yellow-400 text-sm">{playerExp}/{nextLevelExp} EXP</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 transition-all"
              style={{ width: `${(playerExp / nextLevelExp) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-end mt-1">
            <span className="text-yellow-300 text-sm">💰 {playerGold} 金币</span>
          </div>
        </div>

        {/* 主体内容 */}
        <div className="flex-1 flex">
          {/* 左侧立绘和装备栏 */}
          <div className="w-2/5 flex flex-col items-center justify-center p-2 gap-2">
            <img src="/player.png" alt="Player" className="w-32 h-32 object-contain" />
            <div className="text-white font-bold">战士</div>
            <div className="text-yellow-400 text-sm">Lv.{playerLevel}</div>
            {/* 已装备栏 */}
            <div className="grid grid-cols-4 gap-1 mt-2">
              {(['weapon', 'ring', 'armor', 'shoes'] as EquipmentType[]).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    if (equippedGear[type]) {
                      game.unequipItem(type)
                    }
                  }}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center border-2 ${
                    equippedGear[type]
                      ? 'bg-yellow-900/50 border-yellow-400 hover:bg-yellow-800/50 cursor-pointer'
                      : 'bg-gray-800/50 border-gray-600'
                  }`}
                  title={equippedGear[type] ? `${equipmentTypes[type].name}: +${playerLevel * equipmentTypes[type].bonus} ${equipmentTypes[type].stat.toUpperCase()} (点击卸下)` : equipmentTypes[type].name}
                >
                  {equippedGear[type] ? equippedGear[type]!.icon : ''}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧属性和技能 */}
          <div className="flex-1 p-3 flex flex-col gap-2">
            {/* HP条 */}
            <div className="bg-blue-900/50 rounded-lg p-2">
              <div className="flex justify-between text-xs text-white mb-1">
                <span>HP</span>
                <span>{playerHP}/{totalStats.maxHp}</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
                  style={{ width: `${(playerHP / totalStats.maxHp) * 100}%` }}
                />
              </div>
              <button
                onClick={healWithGold}
                disabled={!canHeal}
                className={`mt-2 w-full py-1 rounded text-xs font-bold ${
                  playerHP >= totalStats.maxHp
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : canHeal
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                {playerHP >= totalStats.maxHp ? '满血状态' : `💰 ${healCost} 金币回复满血`}
              </button>
              <div className="mt-3 pt-2 border-t border-blue-700/80">
                <div className="flex justify-between items-center text-[10px] text-gray-300 mb-1">
                  <span>自动逃跑血量</span>
                  <span className="text-amber-200 font-mono">
                    {autoFleeHpPercent === 0 ? '关闭' : `≤ ${autoFleeHpPercent}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={autoFleeHpPercent}
                  onChange={(e) => setAutoFleeHpPercent(Number(e.target.value))}
                  className="w-full h-1.5 accent-amber-400 cursor-pointer"
                />
                <p className="text-[9px] text-gray-500 mt-1 leading-snug">
                  战斗中当前生命百分比不高于该值时自动逃跑（0 为关闭）
                </p>
              </div>
            </div>

            {/* 属性 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-red-900/50 rounded-lg p-2 text-center">
                <div className="text-red-400 text-xs">攻击 ATK</div>
                <div className="text-white font-bold text-lg">{totalStats.atk}</div>
              </div>
              <div className="bg-blue-900/50 rounded-lg p-2 text-center">
                <div className="text-blue-400 text-xs">防御 DEF</div>
                <div className="text-white font-bold text-lg">{totalStats.def}</div>
              </div>
              <div className="bg-green-900/50 rounded-lg p-2 text-center">
                <div className="text-green-400 text-xs">血量 HP</div>
                <div className="text-white font-bold text-lg">{totalStats.maxHp}</div>
              </div>
              <div className="bg-purple-900/50 rounded-lg p-2 text-center">
                <div className="text-purple-400 text-xs">速度 SPD</div>
                <div className="text-white font-bold text-lg">{totalStats.spd}</div>
              </div>
            </div>

            {/* 功能系统入口 */}
            <div className="bg-gray-800/50 rounded-lg p-2 flex-1">
              <div className="text-yellow-400 text-xs mb-2 font-bold">功能系统</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setShowCharacter(false); setShowEquipment(true); }}
                  className="bg-blue-800/50 border border-blue-500 rounded-lg p-2 text-center hover:bg-blue-700/50"
                >
                  <div className="text-xl">⚔️</div>
                  <div className="text-[10px] text-white">装备</div>
                </button>
                <button
                  onClick={() => { setShowCharacter(false); setShowSkills(true); }}
                  className="bg-purple-800/50 border border-purple-500 rounded-lg p-2 text-center hover:bg-purple-700/50"
                >
                  <div className="text-xl">✨</div>
                  <div className="text-[10px] text-white">技能</div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 返回按钮 */}
        <button
          onClick={() => setShowCharacter(false)}
          className="absolute bottom-3 right-3 px-4 py-1.5 bg-blue-500 hover:bg-blue-400 rounded-lg text-white font-bold text-sm border-2 border-blue-300"
        >
          返回
        </button>
      </div>
    </div>
  )
}
