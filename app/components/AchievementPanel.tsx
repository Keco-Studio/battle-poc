'use client'

import { X } from 'lucide-react'
import { GameState } from '../hooks/useGameState'

interface Props {
  game: GameState
}

export default function AchievementPanel({ game }: Props) {
  const { achievements, battleCount, setShowAchievement } = game

  const unlockedAchievements = achievements.filter(a => a.unlocked)
  const lockedAchievements = achievements.filter(a => !a.unlocked)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-[800px] h-[600px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-10 flex items-center justify-center shrink-0 relative">
          <span className="text-orange-900 font-bold text-sm">成 就</span>
          <button
            onClick={() => setShowAchievement(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 hover:bg-red-400 border-2 border-red-300 flex items-center justify-center"
          >
            <X size={14} className="text-white" />
          </button>
        </div>

        {/* 进度提示 */}
        <div className="bg-gray-900/50 px-4 py-2 text-center">
          <span className="text-gray-300 text-xs">战斗次数：</span>
          <span className="text-yellow-400 font-bold ml-1">{battleCount}</span>
          <span className="text-gray-400 text-xs">/ 10</span>
        </div>

        {/* 成就列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* 已获得 */}
          {unlockedAchievements.length > 0 && (
            <div>
              <div className="text-green-400 text-xs font-bold mb-2">已获得</div>
              <div className="space-y-2">
                {unlockedAchievements.map(ach => (
                  <div
                    key={ach.id}
                    className="p-3 bg-green-900/50 border-2 border-green-500 rounded-lg flex items-center gap-3"
                  >
                    <span className="text-3xl">{ach.icon}</span>
                    <div>
                      <div className="text-white font-bold text-sm">{ach.name}</div>
                      <div className="text-gray-400 text-xs">{ach.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 未获得 */}
          {lockedAchievements.length > 0 && (
            <div>
              <div className="text-gray-500 text-xs font-bold mb-2">未获得</div>
              <div className="space-y-2">
                {lockedAchievements.map(ach => (
                  <div
                    key={ach.id}
                    className="p-3 bg-gray-800/50 border-2 border-gray-600 rounded-lg flex items-center gap-3 opacity-60"
                  >
                    <span className="text-3xl grayscale">{ach.icon}</span>
                    <div>
                      <div className="text-gray-400 font-bold text-sm">{ach.name}</div>
                      <div className="text-gray-500 text-xs">{ach.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}