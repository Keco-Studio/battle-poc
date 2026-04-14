'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  EquipmentType,
  calcPlayerStats,
  expForLevel,
  allSkills,
  equipmentTypes,
  initialEnemies,
  PLAYER_START,
} from '../constants'

export interface EquippedItem {
  name: string
  icon: string
}

export interface InventoryItem {
  type: EquipmentType
  name: string
  icon: string
}

export interface TotalStats {
  maxHp: number
  atk: number
  def: number
  spd: number
}

interface SavedState {
  playerLevel: number
  playerExp: number
  playerGold: number
  playerHP: number
  equippedGear: Record<EquipmentType, EquippedItem | null>
  inventory: InventoryItem[]
  playerPos: { x: number; y: number }
}

const STORAGE_KEY = 'battle-game-save'

function loadSavedState(): SavedState | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.warn('Failed to load saved state:', e)
  }
  return null
}

function saveState(state: SavedState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save state:', e)
  }
}

export function useGameState() {
  const saved = loadSavedState()

  // 玩家状态
  const [playerLevel, setPlayerLevel] = useState(saved?.playerLevel ?? 1)
  const [playerExp, setPlayerExp] = useState(saved?.playerExp ?? 0)
  const [playerGold, setPlayerGold] = useState(saved?.playerGold ?? 0)

  // 装备状态
  const [equippedGear, setEquippedGear] = useState<Record<EquipmentType, EquippedItem | null>>(
    saved?.equippedGear ?? { weapon: null, ring: null, armor: null, shoes: null }
  )
  const [inventory, setInventory] = useState<InventoryItem[]>(saved?.inventory ?? [])

  // 战斗状态
  const [playerHP, setPlayerHP] = useState(saved?.playerHP ?? calcPlayerStats(1).maxHp)
  const [enemyHP, setEnemyHP] = useState(0)
  const [enemyMaxHp, setEnemyMaxHp] = useState(0)
  const [enemyLevel, setEnemyLevel] = useState(1)

  // 位置状态
  const [playerPos, setPlayerPos] = useState(saved?.playerPos ?? PLAYER_START)
  const enemies = initialEnemies

  // UI状态
  const [showInteraction, setShowInteraction] = useState(false)
  const [nearbyEnemy, setNearbyEnemy] = useState<typeof enemies[0] | null>(null)
  const [showBattle, setShowBattle] = useState(false)
  const [showCharacter, setShowCharacter] = useState(false)
  const [showEnemyInfo, setShowEnemyInfo] = useState(false)
  const [showEquipment, setShowEquipment] = useState(false)
  const [showSkills, setShowSkills] = useState(false)

  // 战斗相关
  const [battleLog, setBattleLog] = useState<string[]>([])
  const [currentTurn, setCurrentTurn] = useState<'player' | 'enemy'>('player')
  const [selectedSkill, setSelectedSkill] = useState<number | null>(null)
  const [isGameOver, setIsGameOver] = useState(false)
  const [battleResult, setBattleResult] = useState<'win' | 'lose' | null>(null)
  const [isDefending, setIsDefending] = useState(false)
  const [battleRound, setBattleRound] = useState(1)
  const [actionLocked, setActionLocked] = useState(false)
  const [gainedExp, setGainedExp] = useState(0)
  const [gainedGold, setGainedGold] = useState(0)

  // 基础属性
  const playerStats = calcPlayerStats(playerLevel)

  // 装备加成后的属性
  const getTotalStats = useCallback((): TotalStats => {
    const base = calcPlayerStats(playerLevel)
    let atkBonus = 0, defBonus = 0, spdBonus = 0, maxHpBonus = 0
    if (equippedGear.weapon) atkBonus = playerLevel * equipmentTypes.weapon.bonus
    if (equippedGear.ring) maxHpBonus = playerLevel * equipmentTypes.ring.bonus
    if (equippedGear.armor) defBonus = playerLevel * equipmentTypes.armor.bonus
    if (equippedGear.shoes) spdBonus = playerLevel * equipmentTypes.shoes.bonus
    return {
      maxHp: base.maxHp + maxHpBonus,
      atk: base.atk + atkBonus,
      def: base.def + defBonus,
      spd: base.spd + spdBonus,
    }
  }, [playerLevel, equippedGear])

  const totalStats = getTotalStats()

  // 自动保存
  useEffect(() => {
    saveState({
      playerLevel,
      playerExp,
      playerGold,
      playerHP,
      equippedGear,
      inventory,
      playerPos,
    })
  }, [playerLevel, playerExp, playerGold, playerHP, equippedGear, inventory, playerPos])

  // 获取已解锁技能
  const getAvailableSkills = useCallback(() => {
    return allSkills.filter(s => s.unlockLevel <= playerLevel)
  }, [playerLevel])

  // 升级处理
  const tryLevelUp = useCallback((exp: number) => {
    let newExp = exp
    let newLevel = playerLevel

    while (newExp >= expForLevel(newLevel)) {
      newExp -= expForLevel(newLevel)
      newLevel++
    }

    if (newLevel > playerLevel) {
      setPlayerLevel(newLevel)
      const stats = calcPlayerStats(newLevel)
      setPlayerHP(stats.maxHp)
    }
    return { exp: newExp, level: newLevel }
  }, [playerLevel])

  // 装备穿戴
  const equipItem = useCallback((item: InventoryItem, itemIndex: number) => {
    // 如果已装备同类，替换（旧装备放回背包）
    if (equippedGear[item.type]) {
      const oldItem = equippedGear[item.type]!
      setInventory(prev => [...prev, { type: item.type, name: oldItem.name, icon: oldItem.icon }])
    }
    // 从背包移除并装备
    setInventory(prev => prev.filter((_, idx) => idx !== itemIndex))
    setEquippedGear(prev => ({ ...prev, [item.type]: { name: item.name, icon: item.icon } }))
  }, [equippedGear])

  // 装备卸下
  const unequipItem = useCallback((type: EquipmentType) => {
    if (equippedGear[type]) {
      setInventory(prev => [...prev, { type, name: equipmentTypes[type].name, icon: equipmentTypes[type].icon }])
      setEquippedGear(prev => ({ ...prev, [type]: null }))
    }
  }, [equippedGear])

  // 售卖装备
  const sellItem = useCallback((itemIndex: number) => {
    setInventory(prev => prev.filter((_, idx) => idx !== itemIndex))
    setPlayerGold(prev => prev + 1)
  }, [])

  // 开始战斗
  const startBattle = useCallback(() => {
    const diff = 1 + Math.floor(Math.random() * 2)
    const eLevel = Math.max(1, playerLevel - diff)
    const eMaxHp = 30 + eLevel * 10

    setShowBattle(true)
    setBattleRound(1)
    setBattleLog(['战斗开始！'])
    setEnemyHP(eMaxHp)
    setEnemyMaxHp(eMaxHp)
    setEnemyLevel(eLevel)
    setCurrentTurn('player')
    setSelectedSkill(null)
    setIsGameOver(false)
    setBattleResult(null)
    setIsDefending(false)
    setActionLocked(false)
  }, [playerLevel])

  // 关闭战斗
  const closeBattle = useCallback(() => {
    setShowBattle(false)
    setBattleLog([])
    setCurrentTurn('player')
    setSelectedSkill(null)
    setIsGameOver(false)
    setBattleResult(null)
    setIsDefending(false)
    setBattleRound(1)
    setActionLocked(false)
  }, [])

  // 逃跑
  const handleFlee = useCallback(() => {
    setShowBattle(false)
    setBattleLog([])
    setCurrentTurn('player')
    setSelectedSkill(null)
    setIsGameOver(false)
    setBattleResult(null)
    setIsDefending(false)
    setBattleRound(1)
    setActionLocked(false)
    setPlayerPos({
      x: PLAYER_START.x + (Math.random() * 10 - 5),
      y: PLAYER_START.y + (Math.random() * 10 - 5),
    })
  }, [])

  // 金币回复
  const healWithGold = useCallback(() => {
    const cost = playerLevel * 3
    if (playerGold >= cost && playerHP < totalStats.maxHp) {
      setPlayerGold(prev => prev - cost)
      setPlayerHP(totalStats.maxHp)
    }
  }, [playerGold, playerHP, playerLevel, totalStats.maxHp])

  return {
    // 玩家状态
    playerLevel,
    setPlayerLevel,
    playerExp,
    setPlayerExp,
    playerGold,
    setPlayerGold,
    playerHP,
    setPlayerHP,
    playerStats,
    totalStats,
    // 装备
    equippedGear,
    setEquippedGear,
    inventory,
    setInventory,
    equipItem,
    unequipItem,
    sellItem,
    // 敌人
    enemyHP,
    setEnemyHP,
    enemyMaxHp,
    setEnemyMaxHp,
    enemyLevel,
    // 位置
    playerPos,
    setPlayerPos,
    enemies,
    // UI状态
    showInteraction,
    setShowInteraction,
    nearbyEnemy,
    setNearbyEnemy,
    showBattle,
    setShowBattle,
    showCharacter,
    setShowCharacter,
    showEnemyInfo,
    setShowEnemyInfo,
    showEquipment,
    setShowEquipment,
    showSkills,
    setShowSkills,
    // 战斗
    battleLog,
    setBattleLog,
    currentTurn,
    setCurrentTurn,
    selectedSkill,
    setSelectedSkill,
    isGameOver,
    setIsGameOver,
    battleResult,
    setBattleResult,
    isDefending,
    setIsDefending,
    battleRound,
    setBattleRound,
    actionLocked,
    setActionLocked,
    gainedExp,
    setGainedExp,
    gainedGold,
    setGainedGold,
    // 方法
    getAvailableSkills,
    tryLevelUp,
    startBattle,
    closeBattle,
    handleFlee,
    healWithGold,
  }
}

export type GameState = ReturnType<typeof useGameState>
