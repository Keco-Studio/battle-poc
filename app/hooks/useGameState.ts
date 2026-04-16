'use client'

import { useState, useCallback, useEffect, useLayoutEffect } from 'react'
import {
  EquipmentType,
  calcPlayerStats,
  calcEnemyStats,
  rollEnemyBattleLevel,
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

/** 地图右下角功能入口对应的弹窗 */
export const DOCK_PANEL_IDS = [
  'achievements',
  'log',
  'chat',
  'battle_system',
  'character_login',
] as const
export type DockPanelId = (typeof DOCK_PANEL_IDS)[number]

interface SavedState {
  playerLevel: number
  playerExp: number
  playerGold: number
  playerHP: number
  equippedGear: Record<EquipmentType, EquippedItem | null>
  inventory: InventoryItem[]
  playerPos: { x: number; y: number }
  /** 0 = 关闭；1–100 表示当前生命百分比 ≤ 该值时战斗中自动逃跑 */
  autoFleeHpPercent?: number
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

const DEFAULT_GEAR: Record<EquipmentType, EquippedItem | null> = {
  weapon: null,
  ring: null,
  armor: null,
  shoes: null,
}

export function useGameState() {
  /**
   * 首帧必须与 SSR 一致：禁止在 useState 里读 localStorage（服务端无 window，
   * 客户端有存档会导致水合时 26/30 vs 30/30 之类不一致）。
   * 存档在 useLayoutEffect 中合并进 state；storageHydrated 后再自动保存，避免用默认值覆盖存档。
   */
  const [storageHydrated, setStorageHydrated] = useState(false)

  // 玩家状态（默认值 = 无存档新游戏，与服务器首渲一致）
  const [playerLevel, setPlayerLevel] = useState(1)
  const [playerExp, setPlayerExp] = useState(0)
  const [playerGold, setPlayerGold] = useState(0)

  // 装备状态
  const [equippedGear, setEquippedGear] = useState<Record<EquipmentType, EquippedItem | null>>(() => ({
    ...DEFAULT_GEAR,
  }))
  const [inventory, setInventory] = useState<InventoryItem[]>([])

  /** 自动逃跑：0 关闭；1–100 为血量百分比阈值（≤ 即逃） */
  const [autoFleeHpPercent, setAutoFleeHpPercent] = useState(0)

  /** 返回地图后短暂显示（如逃跑成功），不写入存档 */
  const [fleeSuccessMessage, setFleeSuccessMessage] = useState<string | null>(null)

  // 战斗状态
  const [playerHP, setPlayerHP] = useState(() => calcPlayerStats(1).maxHp)
  const [enemyHP, setEnemyHP] = useState(0)
  const [enemyMaxHp, setEnemyMaxHp] = useState(0)
  const [enemyLevel, setEnemyLevel] = useState(1)

  // 位置状态
  const [playerPos, setPlayerPos] = useState(() => ({ ...PLAYER_START }))
  const enemies = initialEnemies

  // UI状态
  const [showInteraction, setShowInteraction] = useState(false)
  const [nearbyEnemy, setNearbyEnemy] = useState<typeof enemies[0] | null>(null)
  const [showBattle, setShowBattle] = useState(false)
  const [showCharacter, setShowCharacter] = useState(false)
  const [showEnemyInfo, setShowEnemyInfo] = useState(false)
  const [showEquipment, setShowEquipment] = useState(false)
  const [showSkills, setShowSkills] = useState(false)

  /** 地图右下角：成就 / 日志 / 聊天 / 战斗系统 / 角色登录 */
  const [dockPanel, setDockPanel] = useState<DockPanelId | null>(null)

  // 战斗相关
  const [battleLog, setBattleLog] = useState<string[]>([])
  const [currentTurn, setCurrentTurn] = useState<'player' | 'enemy'>('player')
  const [selectedSkill, setSelectedSkill] = useState<number | null>(null)
  const [isGameOver, setIsGameOver] = useState(false)
  const [battleResult, setBattleResult] = useState<'win' | 'lose' | null>(null)
  const [isDefending, setIsDefending] = useState(false)
  const [battleRound, setBattleRound] = useState(1)
  /** 实时战斗：下一发自动攻击使用的技能 id，null 表示普通攻击 */
  const [nextAttackSkillId, setNextAttackSkillId] = useState<number | null>(null)
  /** 技能 id -> 冷却结束时间戳 (ms) */
  const [skillCooldownEndAt, setSkillCooldownEndAt] = useState<Record<number, number>>({})
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

  useLayoutEffect(() => {
    const saved = loadSavedState()
    if (saved) {
      const lv = saved.playerLevel ?? 1
      setPlayerLevel(lv)
      setPlayerExp(saved.playerExp ?? 0)
      setPlayerGold(saved.playerGold ?? 0)
      setEquippedGear(saved.equippedGear ?? { ...DEFAULT_GEAR })
      setInventory(Array.isArray(saved.inventory) ? saved.inventory : [])
      setPlayerPos(saved.playerPos ?? { ...PLAYER_START })
      setAutoFleeHpPercent(Math.min(100, Math.max(0, saved.autoFleeHpPercent ?? 0)))
      const maxForLevel = calcPlayerStats(lv).maxHp
      const ringBonus = saved.equippedGear?.ring ? lv * equipmentTypes.ring.bonus : 0
      const maxHp = maxForLevel + ringBonus
      const hp = typeof saved.playerHP === 'number' ? saved.playerHP : maxHp
      setPlayerHP(Math.min(Math.max(0, hp), maxHp))
    }
    setStorageHydrated(true)
  }, [])

  // 自动保存（避免首帧用默认值覆盖 localStorage）
  useEffect(() => {
    if (!storageHydrated) return
    saveState({
      playerLevel,
      playerExp,
      playerGold,
      playerHP,
      equippedGear,
      inventory,
      playerPos,
      autoFleeHpPercent,
    })
  }, [
    storageHydrated,
    playerLevel,
    playerExp,
    playerGold,
    playerHP,
    equippedGear,
    inventory,
    playerPos,
    autoFleeHpPercent,
  ])

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
    const eLevel = rollEnemyBattleLevel(playerLevel)
    const eMaxHp = calcEnemyStats(eLevel).maxHp

    setShowBattle(true)
    setBattleRound(1)
    setBattleLog(['战斗开始！'])
    setEnemyHP(eMaxHp)
    setEnemyMaxHp(eMaxHp)
    setEnemyLevel(eLevel)
    setCurrentTurn('player')
    setSelectedSkill(null)
    setNextAttackSkillId(null)
    setSkillCooldownEndAt({})
    setIsGameOver(false)
    setBattleResult(null)
    setIsDefending(false)
    setFleeSuccessMessage(null)
    setDockPanel(null)
  }, [playerLevel])

  // 关闭战斗
  const closeBattle = useCallback(() => {
    setShowBattle(false)
    setBattleLog([])
    setCurrentTurn('player')
    setSelectedSkill(null)
    setNextAttackSkillId(null)
    setSkillCooldownEndAt({})
    setIsGameOver(false)
    setBattleResult(null)
    setIsDefending(false)
    setBattleRound(1)
  }, [])

  // 逃跑
  const handleFlee = useCallback((opts?: { successMessage?: string }) => {
    if (opts?.successMessage) setFleeSuccessMessage(opts.successMessage)
    setShowBattle(false)
    setBattleLog([])
    setCurrentTurn('player')
    setSelectedSkill(null)
    setNextAttackSkillId(null)
    setSkillCooldownEndAt({})
    setIsGameOver(false)
    setBattleResult(null)
    setIsDefending(false)
    setBattleRound(1)
    setPlayerPos({
      x: PLAYER_START.x + (Math.random() * 10 - 5),
      y: PLAYER_START.y + (Math.random() * 10 - 5),
    })
  }, [])

  const dismissFleeSuccessMessage = useCallback(() => {
    setFleeSuccessMessage(null)
  }, [])

  const closeDockPanel = useCallback(() => {
    setDockPanel(null)
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
    autoFleeHpPercent,
    setAutoFleeHpPercent,
    fleeSuccessMessage,
    dismissFleeSuccessMessage,
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
    dockPanel,
    setDockPanel,
    closeDockPanel,
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
    actionLocked: false,
    setActionLocked: () => { },
    nextAttackSkillId,
    setNextAttackSkillId,
    skillCooldownEndAt,
    setSkillCooldownEndAt,
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
