'use client'

import { GameState } from '../hooks/useGameState'
import { allSkills } from '../constants'

interface Props {
  game: GameState
}

export default function SkillsPanel({ game }: Props) {
  const { playerLevel, setShowSkills, setShowCharacter, getAvailableSkills } = game
  const availableSkills = getAvailableSkills()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 技能面板 - 800x600 */}
      <div className="relative w-[800px] h-[600px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-12 flex items-center justify-center shrink-0">
          <span className="text-orange-900 font-bold text-lg">技 能 系 统</span>
        </div>

        <div className="flex-1 p-4">
          <div className="text-yellow-400 text-sm mb-3 text-center">
            已解锁 ({availableSkills.length}/{allSkills.length})
          </div>
          <div className="grid grid-cols-3 gap-3">
            {allSkills.map(skill => {
              const unlocked = skill.unlockLevel <= playerLevel
              return (
                <div
                  key={skill.id}
                  className={`rounded-xl p-4 text-center ${
                    unlocked
                      ? 'bg-blue-800/50 border-2 border-blue-500'
                      : 'bg-gray-800/50 border-2 border-gray-600 opacity-50'
                  }`}
                >
                  <div className="text-4xl mb-2">{unlocked ? skill.icon : '🔒'}</div>
                  <div className={`text-white font-bold mb-1 ${unlocked ? '' : 'text-gray-500'}`}>
                    {skill.name}
                  </div>
                  <div className="text-gray-400 text-xs mb-2">{skill.desc}</div>
                  {!unlocked && <div className="text-red-400 text-xs">需要 Lv.{skill.unlockLevel}</div>}
                  {unlocked && <div className="text-green-400 text-xs">已解锁</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* 返回按钮 */}
        <button
          onClick={() => { setShowSkills(false); setShowCharacter(true); }}
          className="absolute bottom-3 right-3 px-4 py-1.5 bg-blue-500 hover:bg-blue-400 rounded-lg text-white font-bold text-sm border-2 border-blue-300"
        >
          返回
        </button>
      </div>
    </div>
  )
}
