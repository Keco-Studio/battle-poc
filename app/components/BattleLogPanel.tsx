'use client'

import { X } from 'lucide-react'
import { GameState } from '../hooks/useGameState'

interface Props {
  game: GameState
}

export default function BattleLogPanel({ game }: Props) {
  const { battleLogs, setShowBattleLog } = game

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-[800px] h-[600px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-10 flex items-center justify-center shrink-0 relative">
          <span className="text-orange-900 font-bold text-sm">BATTLE LOG</span>
          <button
            onClick={() => setShowBattleLog(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 hover:bg-red-400 border-2 border-red-300 flex items-center justify-center"
          >
            <X size={14} className="text-white" />
          </button>
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {battleLogs.length === 0 && (
            <div className="text-gray-400 text-center text-sm mt-8">No battle records</div>
          )}
          {battleLogs.map(log => (
            <div
              key={log.id}
              className={`p-3 rounded-lg border-2 ${
                log.result === 'win'
                  ? 'bg-green-900/50 border-green-500'
                  : 'bg-red-900/50 border-red-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      log.result === 'win' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}
                  >
                    {log.result === 'win' ? 'Victory' : 'Defeat'}
                  </span>
                  <span className="text-gray-400 text-xs">{formatTime(log.timestamp)}</span>
                </div>
                <span className="text-gray-300 text-xs">Round {log.rounds}</span>
              </div>
              {log.result === 'win' && log.expGained !== undefined && log.goldGained !== undefined && (
                <div className="flex gap-4 text-xs">
                  <span className="text-yellow-400">⭐ EXP +{log.expGained}</span>
                  <span className="text-yellow-400">💰 Gold +{log.goldGained}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
