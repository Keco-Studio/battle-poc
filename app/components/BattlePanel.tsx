'use client'

import { useEffect, useState } from 'react'
import { GameState } from '../hooks/useGameState'
import { allSkills, equipmentTypes, EquipmentType, Skill } from '../constants'

interface Props {
  game: GameState
}

export default function BattlePanel({ game }: Props) {
  const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null)
  const [droppedEquipment, setDroppedEquipment] = useState<{ name: string; icon: string } | null>(null)
  const {
    playerLevel,
    playerHP,
    setPlayerHP,
    totalStats,
    enemyHP,
    enemyMaxHp,
    enemyLevel,
    nearbyEnemy,
    currentTurn,
    setCurrentTurn,
    selectedSkill,
    setSelectedSkill,
    isGameOver,
    battleResult,
    isDefending,
    setIsDefending,
    battleRound,
    setBattleRound,
    actionLocked,
    gainedExp,
    gainedGold,
    battleLog,
    setBattleLog,
    closeBattle,
    handleFlee,
    getAvailableSkills,
    tryLevelUp,
    playerExp,
    setPlayerExp,
    playerGold,
    setPlayerGold,
    inventory,
    setInventory,
    equippedGear,
    setEquippedGear,
  } = game

  // 敌人回合
  useEffect(() => {
    if (currentTurn !== 'enemy' || isGameOver) return

    const timer = setTimeout(() => {
      const enemyBaseDamage = (enemyLevel) * 2 + Math.floor(Math.random() * 5)
      let damage = Math.max(1, enemyBaseDamage - totalStats.def)
      let logMsg = `敌人攻击！`

      if (isDefending) {
        damage = Math.floor(damage * 0.5)
        logMsg += `（被防御削弱）`
        setIsDefending(false)
      }

      setPlayerHP(prev => Math.max(0, prev - damage))
      setBattleLog(prev => [...prev, `${logMsg}造成了 ${damage} 点伤害！`])
      setCurrentTurn('player')
      setBattleRound(prev => prev + 1)
      game.setActionLocked(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [currentTurn, isGameOver, isDefending, enemyLevel, totalStats.def])

  // 检查玩家是否死亡
  useEffect(() => {
    if (playerHP <= 0 && !isGameOver) {
      game.setIsGameOver(true)
      game.setBattleResult('lose')
      // 阵亡后清除金币、恢复满血
      setPlayerGold(0)
      setPlayerHP(totalStats.maxHp)
    }
  }, [playerHP, isGameOver])

  // 使用技能
  const useSkill = (skill: (typeof allSkills)[0]) => {
    if (currentTurn !== 'player' || isGameOver || actionLocked) return

    game.setActionLocked(true)
    setSelectedSkill(skill.id)
    let log = `你使用了 ${skill.name}！`
    let totalDamage = 0
    const hits = skill.hits || 1

    if (skill.type === 'damage') {
      for (let i = 0; i < hits; i++) {
        totalDamage += Math.floor(totalStats.atk * skill.multiplier)
      }
      const newHP = Math.max(0, enemyHP - totalDamage)
      game.setEnemyHP(newHP)
      log += ` 造成 ${totalDamage} 点伤害！`
      if (newHP <= 0) {
        game.setIsGameOver(true)
        game.setBattleResult('win')
        const expGain = enemyLevel * 2
        const goldGain = enemyLevel * 2
        game.setGainedExp(expGain)
        game.setGainedGold(goldGain)
        setPlayerGold(prev => prev + goldGain)
        // 10%装备掉落
        if (Math.random() < 0.1) {
          const types: EquipmentType[] = ['weapon', 'ring', 'armor', 'shoes']
          const randomType = types[Math.floor(Math.random() * types.length)]
          const eq = equipmentTypes[randomType]
          setInventory(prev => [...prev, { type: randomType, name: eq.name, icon: eq.icon }])
          setDroppedEquipment({ name: eq.name, icon: eq.icon })
          setBattleLog(prev => [...prev, `运气不错！获得了${eq.icon}${eq.name}！`])
        }
        const afterLevelUp = tryLevelUp(playerExp + expGain)
        setPlayerExp(afterLevelUp.exp)
        setBattleLog(prev => [...prev, log, `获得 ${expGain} 经验和 ${goldGain} 金币！`])
        if (afterLevelUp.level > playerLevel) {
          setBattleLog(prev => [...prev, `升级了！现在是 Lv.${afterLevelUp.level}`])
        }
        game.setActionLocked(false)
        return
      }
    } else if (skill.type === 'heal') {
      const heal = Math.floor(totalStats.atk * skill.multiplier)
      const newHP = Math.min(totalStats.maxHp, playerHP + heal)
      setPlayerHP(newHP)
      log += ` 恢复了 ${newHP - playerHP} 点生命！`
    } else if (skill.type === 'defense') {
      log += ' 下次受伤减少50%！'
      setIsDefending(true)
    } else if (skill.type === 'counter') {
      const damage = Math.floor(totalStats.atk * skill.multiplier)
      const newHP = Math.max(0, enemyHP - damage)
      game.setEnemyHP(newHP)
      log += ` 反击造成了 ${damage} 点伤害！`
      if (newHP <= 0) {
        game.setIsGameOver(true)
        game.setBattleResult('win')
        const expGain = enemyLevel * 2
        const goldGain = enemyLevel * 2
        game.setGainedExp(expGain)
        game.setGainedGold(goldGain)
        setPlayerGold(prev => prev + goldGain)
        // 10%装备掉落
        if (Math.random() < 0.1) {
          const types: EquipmentType[] = ['weapon', 'ring', 'armor', 'shoes']
          const randomType = types[Math.floor(Math.random() * types.length)]
          const eq = equipmentTypes[randomType]
          setInventory(prev => [...prev, { type: randomType, name: eq.name, icon: eq.icon }])
          setDroppedEquipment({ name: eq.name, icon: eq.icon })
          setBattleLog(prev => [...prev, `运气不错！获得了${eq.icon}${eq.name}！`])
        }
        const afterLevelUp = tryLevelUp(playerExp + expGain)
        setPlayerExp(afterLevelUp.exp)
        setBattleLog(prev => [...prev, log, `获得 ${expGain} 经验和 ${goldGain} 金币！`])
        if (afterLevelUp.level > playerLevel) {
          setBattleLog(prev => [...prev, `升级了！现在是 Lv.${afterLevelUp.level}`])
        }
        game.setActionLocked(false)
        return
      }
    }

    setBattleLog(prev => [...prev, log])

    setTimeout(() => {
      setCurrentTurn('enemy')
    }, 500)
  }

  const availableSkills = getAvailableSkills()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景 */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/home-bg.png')" }} />
      <div className="absolute inset-0 bg-black/50" />

      {/* 战斗面板 */}
      <div className="relative w-[800px] h-[600px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 rounded-3xl shadow-2xl overflow-hidden">
        {/* 顶部标题 */}
        <div className="h-14 bg-gradient-to-b from-yellow-400 to-yellow-500 flex items-center justify-center border-b-4 border-orange-500">
          <span className="text-orange-900 font-bold text-lg">第 {battleRound} 回合</span>
        </div>

        {/* 角色区域 */}
        <div className="flex items-center justify-between px-8 py-6">
          {/* 玩家 */}
          <div className="text-center">
            <div className="bg-blue-500 text-white font-bold px-4 py-1 rounded-t-lg mb-2">玩家</div>
            <div className="bg-blue-900/50 border-2 border-blue-400 rounded-xl p-3 w-36">
              <div className="bg-yellow-400 text-orange-900 font-bold text-xs px-2 py-0.5 rounded-full mb-2">LV.{playerLevel}</div>
              <img src="/player.png" alt="Player" className="w-24 h-24 object-contain mx-auto" />
              <div className="mt-2">
                <div className="flex justify-between text-xs text-white mb-1">
                  <span>HP</span>
                  <span>{playerHP}/{totalStats.maxHp}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(playerHP / totalStats.maxHp) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* VS */}
          <div className="bg-orange-500 text-white font-black text-3xl px-6 py-3 rounded-xl border-4 border-yellow-400">VS</div>

          {/* 敌人 */}
          <div className="text-center">
            <div className="bg-red-500 text-white font-bold px-4 py-1 rounded-t-lg mb-2">{nearbyEnemy?.name || '敌人'}</div>
            <div className="bg-red-900/50 border-2 border-red-400 rounded-xl p-3 w-36">
              <div className="bg-red-400 text-white font-bold text-xs px-2 py-0.5 rounded-full mb-2">LV.{enemyLevel}</div>
              <img src="/enemy.png" alt="Enemy" className="w-24 h-24 object-contain mx-auto" />
              <div className="mt-2">
                <div className="flex justify-between text-xs text-white mb-1">
                  <span>HP</span>
                  <span>{enemyHP}/{enemyMaxHp}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full">
                  <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(enemyHP / enemyMaxHp) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 回合指示 */}
        <div className="text-center">
          <span className={`inline-block px-6 py-1 rounded-full text-white font-bold text-sm ${currentTurn === 'player' ? 'bg-blue-500' : 'bg-red-500'}`}>
            {currentTurn === 'player' ? '你的回合' : '敌方回合'}
          </span>
        </div>

        {/* 技能栏 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-yellow-500 to-yellow-400 border-t-4 border-orange-500 p-4">
          <div className="flex items-center justify-center gap-4">
            {!isGameOver && currentTurn === 'player' && (
              <button onClick={handleFlee} className="px-4 py-2 bg-gray-500 hover:bg-gray-400 rounded-lg text-white font-bold text-sm border-2 border-gray-300">
                逃跑
              </button>
            )}
            {availableSkills.map(skill => (
              <button
                key={skill.id}
                onClick={() => currentTurn === 'player' && !isGameOver && !actionLocked && useSkill(skill)}
                onMouseEnter={() => setHoveredSkill(skill)}
                onMouseLeave={() => setHoveredSkill(null)}
                disabled={currentTurn !== 'player' || isGameOver || actionLocked}
                className={`w-16 h-14 rounded-xl flex flex-col items-center justify-center shadow-lg border-2 relative ${
                  selectedSkill === skill.id
                    ? 'bg-orange-500 border-orange-300'
                    : currentTurn === 'player' && !isGameOver && !actionLocked
                      ? 'bg-blue-500 border-blue-300 hover:bg-blue-400'
                      : 'bg-gray-500 border-gray-300 opacity-50'
                }`}
              >
                <span className="text-xl">{skill.icon}</span>
                <span className="text-xs text-white font-bold">{skill.name}</span>
              </button>
            ))}
          </div>

          {/* 技能提示 */}
          {hoveredSkill && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900/95 border-2 border-yellow-400 rounded-xl p-3 w-48 shadow-xl z-50">
              <div className="text-center mb-2">
                <span className="text-2xl">{hoveredSkill.icon}</span>
                <div className="text-white font-bold">{hoveredSkill.name}</div>
              </div>
              <div className="text-gray-300 text-xs text-center mb-1">{hoveredSkill.desc}</div>
              <div className="text-yellow-400 text-xs text-center">
                {hoveredSkill.type === 'damage' && `伤害: ${Math.floor(totalStats.atk * hoveredSkill.multiplier)}${hoveredSkill.hits ? ` x${hoveredSkill.hits}` : ''}`}
                {hoveredSkill.type === 'heal' && `治疗: ${Math.floor(totalStats.atk * hoveredSkill.multiplier)} HP`}
                {hoveredSkill.type === 'defense' && '效果: 下次受伤减少50%'}
                {hoveredSkill.type === 'counter' && `反击: ${Math.floor(totalStats.atk * hoveredSkill.multiplier)} 伤害`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 战斗日志 */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 w-64 h-48 bg-black/70 rounded-lg p-2 overflow-y-auto">
        {battleLog.map((log, idx) => (
          <div key={idx} className="text-white text-xs mb-1">{log}</div>
        ))}
      </div>

      {/* 结算弹窗 */}
      {isGameOver && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
          <div className="bg-gradient-to-b from-yellow-400 to-orange-500 border-4 border-orange-600 rounded-3xl p-8 w-80 text-center">
            <div className="bg-red-500 text-white font-black text-xl px-6 py-2 rounded-xl border-4 border-red-300 mx-auto mb-4 -mt-10">
              {battleResult === 'win' ? '胜利！' : '失败...'}
            </div>
            <div className="bg-white/30 rounded-xl p-4 mb-4">
              <div className="text-orange-900 text-sm">战斗回合</div>
              <div className="text-4xl font-black text-orange-900">{battleRound}</div>
            </div>
            {battleResult === 'win' && (
              <div className="bg-white/30 rounded-xl p-4 mb-4">
                <div className="text-orange-900 text-sm mb-2">战斗奖励</div>
                <div className="flex justify-around">
                  <div><div className="text-2xl">💰</div><div className="text-xs text-orange-900">金币+{gainedGold}</div></div>
                  <div><div className="text-2xl">⭐</div><div className="text-xs text-orange-900">经验+{gainedExp}</div></div>
                </div>
              </div>
            )}
            {droppedEquipment && (
              <div className="bg-green-500/80 rounded-xl p-4 mb-4 animate-bounce">
                <div className="text-white font-bold mb-1">🎉 装备掉落！</div>
                <div className="text-4xl mb-1">{droppedEquipment.icon}</div>
                <div className="text-white text-sm">{droppedEquipment.name}</div>
              </div>
            )}
            <button onClick={closeBattle} className="w-full py-2 bg-blue-500 hover:bg-blue-400 rounded-xl text-white font-bold border-2 border-blue-300">返回大厅</button>
          </div>
        </div>
      )}
    </div>
  )
}
