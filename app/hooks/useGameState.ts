'use client'

import { useState, useCallback, useEffect, useLayoutEffect } from 'react'
import {
  EquipmentType,
  calcPlayerStats,
  calcEnemyStats,
  createEnemyEncounter,
  expForLevel,
  allSkills,
  equipmentTypes,
  initialEnemies,
  PLAYER_START,
  EnemyCombatStats,
  getBattleRewards,
  getDefaultCarriedSkillIds,
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

export interface ChatMessage {
  id: string
  text: string
  isSelf: boolean
  timestamp: number
}

/** 供 AchievementPanel（遗留入口）使用的占位数据 */
export interface AchievementItem {
  id: string
  name: string
  desc: string
  icon: string
  unlocked: boolean
}

const DEFAULT_ACHIEVEMENTS: AchievementItem[] = [
  { id: 'a1', name: '初出茅庐', desc: '完成第一场战斗', icon: '⚔️', unlocked: false },
  { id: 'a2', name: '百战老兵', desc: '累计战斗 10 次', icon: '🛡️', unlocked: false },
]

/** BattleLogPanel（遗留入口）条目 */
export interface BattleHistoryLogItem {
  id: string
  result: 'win' | 'lose'
  timestamp: number
  rounds: number
  expGained?: number
  goldGained?: number
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

/** 自动化任务类型 */
export type AutomationMode =
  | { kind: 'repeat_battle'; remaining: number }
  | { kind: 'flee_if_low_hp'; threshold: number }
  | { kind: 'wait_full_hp' }
  | { kind: 'farm_til_death' }
  | { kind: 'auto_mode' }
  | { kind: 'kill_count'; remaining: number; killed: number }

/** 大地图开战时的双方网格锚点（对齐 battle-core 实体坐标） */
export type BattleGridAnchor = {
  player: { x: number; y: number }
  enemy: { x: number; y: number }
}

interface SavedState {
  playerLevel: number
  playerExp: number
  playerGold: number
  playerHP: number
  equippedGear: Record<EquipmentType, EquippedItem | null>
  inventory: InventoryItem[]
  playerPos: { x: number; y: number }
  carriedSkillIds?: string[]
}

const STORAGE_KEY = 'battle-game-save'
const CHAT_STORAGE_KEY = 'battle-chat-messages'

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

function loadChatMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!saved) return []
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((msg) => ({
        id: String(msg?.id ?? ''),
        text: String(msg?.text ?? ''),
        isSelf: Boolean(msg?.isSelf),
        timestamp: Number(msg?.timestamp ?? Date.now()),
      }))
      .filter((msg) => msg.id && msg.text)
  } catch (e) {
    console.warn('Failed to load chat messages:', e)
    return []
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

  /** 返回地图后短暂显示（如逃跑成功），不写入存档 */
  const [fleeSuccessMessage, setFleeSuccessMessage] = useState<string | null>(null)

  /** 每次 startBattle 自增，供大地图战斗重建 MapBattleController */
  const [battleSessionNonce, setBattleSessionNonce] = useState(0)

  /** 大地图战斗：双方格子位置；由 startBattle 传入 */
  const [battleGridAnchor, setBattleGridAnchor] = useState<BattleGridAnchor | null>(null)
  /** 地图战斗胜利结算时的装备掉落展示 */
  const [battleLootDrop, setBattleLootDrop] = useState<{ name: string; icon: string } | null>(null)
  /** 当前交战的地图敌人 id（仅该单位暂停随机游荡） */
  const [combatEnemyId, setCombatEnemyId] = useState<number | null>(null)

  // 战斗状态
  const [playerHP, setPlayerHP] = useState(() => calcPlayerStats(1).maxHp)
  const [playerMP, setPlayerMP] = useState(() => Math.floor(calcPlayerStats(1).maxHp / 2))
  const [playerMaxMp, setPlayerMaxMp] = useState(() => Math.floor(calcPlayerStats(1).maxHp / 2))
  const [enemyHP, setEnemyHP] = useState(0)
  const [enemyMaxHp, setEnemyMaxHp] = useState(0)
  const [enemyLevel, setEnemyLevel] = useState(1)
  const [enemyCombatStats, setEnemyCombatStats] = useState<EnemyCombatStats>(() => calcEnemyStats(1))
  const [enemyPreview, setEnemyPreview] = useState<{ level: number; stats: EnemyCombatStats }>(() => ({
    level: 1,
    stats: calcEnemyStats(1),
  }))

  // 位置状态
  const [playerPos, setPlayerPos] = useState(() => ({ ...PLAYER_START }))
  const [enemies, setEnemies] = useState(() => [...initialEnemies])

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [battleCount, setBattleCount] = useState(0)
  const [achievements] = useState<AchievementItem[]>(() => [...DEFAULT_ACHIEVEMENTS])
  const [battleLogs, setBattleLogs] = useState<BattleHistoryLogItem[]>([])

  // 战斗相关
  const [battleLog, setBattleLog] = useState<string[]>([])
  const [currentTurn, setCurrentTurn] = useState<'player' | 'enemy'>('player')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [isGameOver, setIsGameOver] = useState(false)
  const [battleResult, setBattleResult] = useState<'win' | 'lose' | null>(null)
  const [isDefending, setIsDefending] = useState(false)
  const [battleRound, setBattleRound] = useState(1)
  /** 实时战斗：下一发自动攻击使用的技能 id，null 表示普通攻击 */
  const [nextAttackSkillId, setNextAttackSkillId] = useState<string | null>(null)
  /** 技能 id -> 冷却结束时间戳 (ms) */
  const [skillCooldownEndAt, setSkillCooldownEndAt] = useState<Record<string, number>>({})
  const [gainedExp, setGainedExp] = useState(0)
  const [gainedGold, setGainedGold] = useState(0)
  const [carriedSkillIds, setCarriedSkillIds] = useState<string[]>(() => getDefaultCarriedSkillIds('archer', 6))

  /** 自动化任务状态 */
  const [automationTask, setAutomationTask] = useState<AutomationMode | null>(null)

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

  useEffect(() => {
    const nextMaxMp = Math.floor(totalStats.maxHp / 2)
    setPlayerMaxMp(nextMaxMp)
    setPlayerMP((prev) => Math.min(prev, nextMaxMp))
  }, [totalStats.maxHp])

  useEffect(() => {
    if (!nearbyEnemy) {
      setEnemyPreview({ level: 1, stats: calcEnemyStats(1) })
      return
    }
    setEnemyPreview(createEnemyEncounter(playerLevel, nearbyEnemy.profile))
  }, [nearbyEnemy, playerLevel])

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
      const maxForLevel = calcPlayerStats(lv).maxHp
      const ringBonus = saved.equippedGear?.ring ? lv * equipmentTypes.ring.bonus : 0
      const maxHp = maxForLevel + ringBonus
      const hp = typeof saved.playerHP === 'number' ? saved.playerHP : maxHp
      setPlayerHP(Math.min(Math.max(0, hp), maxHp))
      const maxMp = Math.floor(maxHp / 2)
      setPlayerMaxMp(maxMp)
      setPlayerMP(maxMp)
      const savedCarry = Array.isArray(saved.carriedSkillIds) ? saved.carriedSkillIds : getDefaultCarriedSkillIds('archer', 6)
      setCarriedSkillIds(savedCarry.slice(0, 6))
    }
    setStorageHydrated(true)
  }, [])

  useLayoutEffect(() => {
    setChatMessages(loadChatMessages())
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
      carriedSkillIds,
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
    carriedSkillIds,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages))
    } catch (e) {
      console.warn('Failed to save chat messages:', e)
    }
  }, [chatMessages])

  // 获取已解锁技能
  const getAvailableSkills = useCallback(() => {
    const unlocked = allSkills.filter(s => s.unlockLevel <= playerLevel)
    const carried = carriedSkillIds
      .map((id) => unlocked.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s)
    return carried
  }, [playerLevel, carriedSkillIds])

  const updateCarriedSkillIds = useCallback((ids: string[]) => {
    const dedup = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)))
    setCarriedSkillIds(dedup.slice(0, 6))
  }, [])

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
      const nextMaxMp = Math.floor(stats.maxHp / 2)
      setPlayerMaxMp(nextMaxMp)
      setPlayerMP(nextMaxMp)
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

  // 开始战斗（可选 anchor：大地图战斗传入双方格子坐标）
  const startBattle = useCallback(
    (anchor?: BattleGridAnchor) => {
      const encounter = nearbyEnemy ? enemyPreview : createEnemyEncounter(playerLevel)

      setShowBattle(true)
      setBattleRound(1)
      setBattleLog(['战斗开始！（battle-core tick）'])
      setEnemyHP(encounter.stats.maxHp)
      setEnemyMaxHp(encounter.stats.maxHp)
      setEnemyLevel(encounter.level)
      setEnemyCombatStats(encounter.stats)
      setCurrentTurn('player')
      setSelectedSkill(null)
      setNextAttackSkillId(null)
      setSkillCooldownEndAt({})
      setIsGameOver(false)
      setBattleResult(null)
      setIsDefending(false)
      setFleeSuccessMessage(null)
      setBattleLootDrop(null)
      setDockPanel(null)
      setBattleGridAnchor(anchor ?? null)
      setCombatEnemyId(nearbyEnemy?.id ?? null)
      setBattleSessionNonce((n) => n + 1)
      setBattleCount((c) => c + 1)
    },
    [enemyPreview, nearbyEnemy, playerLevel],
  )

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
    setBattleGridAnchor(null)
    setBattleLootDrop(null)
    setCombatEnemyId(null)
  }, [])

  /**
   * 仅在 battle-core 已以 `battle_ended.reason === 'flee_success'` 结束本场后调用：
   * 关闭战斗 UI、重置大地图敌人显示血量（供下次遭遇），不替代引擎内的 `flee` 命令。
   */
  const finalizeMapBattleFleeSuccess = useCallback((opts?: { successMessage?: string; clearBattleLog?: boolean }) => {
    if (opts?.successMessage) setFleeSuccessMessage(opts.successMessage)
    setEnemyHP(enemyPreview.stats.maxHp)
    setEnemyMaxHp(enemyPreview.stats.maxHp)
    setShowBattle(false)
    if (opts?.clearBattleLog !== false) setBattleLog([])
    setCurrentTurn('player')
    setSelectedSkill(null)
    setNextAttackSkillId(null)
    setSkillCooldownEndAt({})
    setIsGameOver(false)
    setBattleResult(null)
    setIsDefending(false)
    setBattleRound(1)
    setBattleGridAnchor(null)
    setBattleLootDrop(null)
    setCombatEnemyId(null)
  }, [enemyPreview.stats.maxHp, setEnemyHP, setEnemyMaxHp])

  /** @deprecated 与 finalizeMapBattleFleeSuccess 相同；保留旧名称供遗留组件引用 */
  const handleFlee = finalizeMapBattleFleeSuccess

  const dismissFleeSuccessMessage = useCallback(() => {
    setFleeSuccessMessage(null)
  }, [])

  /** 地图战斗：胜利结算（经验金币与可选掉落） */
  const completeMapBattleVictory = useCallback(
    (closingLog: string) => {
      setIsGameOver(true)
      setBattleResult('win')
      const { exp: expGain, gold: goldGain } = getBattleRewards(enemyLevel)
      setGainedExp(expGain)
      setGainedGold(goldGain)
      setPlayerGold((prev) => prev + goldGain)
      if (Math.random() < 0.1) {
        const types: EquipmentType[] = ['weapon', 'ring', 'armor', 'shoes']
        const randomType = types[Math.floor(Math.random() * types.length)]
        const eq = equipmentTypes[randomType]
        setInventory((prev) => [...prev, { type: randomType, name: eq.name, icon: eq.icon }])
        setBattleLootDrop({ name: eq.name, icon: eq.icon })
        setBattleLog((prev) => [...prev, `运气不错！获得了${eq.icon}${eq.name}！`])
      }
      const afterLevelUp = tryLevelUp(playerExp + expGain)
      setPlayerExp(afterLevelUp.exp)
      setBattleLog((prev) => [...prev, closingLog, `获得 ${expGain} 经验和 ${goldGain} 金币！`])
      setBattleLogs((prev) => [
        ...prev,
        {
          id: `bh-${Date.now()}`,
          result: 'win',
          timestamp: Date.now(),
          rounds: battleRound,
          expGained: expGain,
          goldGained: goldGain,
        },
      ])
      if (afterLevelUp.level > playerLevel) {
        setBattleLog((prev) => [...prev, `升级了！现在是 Lv.${afterLevelUp.level}`])
      }
    },
    [battleRound, enemyLevel, playerExp, playerLevel, setBattleLog, setBattleResult, setGainedExp, setGainedGold, setInventory, setIsGameOver, setPlayerExp, setPlayerGold, tryLevelUp],
  )

  /** 地图战斗：失败 */
  const completeMapBattleDefeat = useCallback(() => {
    setIsGameOver(true)
    setBattleResult('lose')
    setPlayerGold(0)
    setPlayerHP(totalStats.maxHp)
    setPlayerMP(playerMaxMp)
    setBattleLogs((prev) => [
      ...prev,
      {
        id: `bh-${Date.now()}`,
        result: 'lose',
        timestamp: Date.now(),
        rounds: battleRound,
      },
    ])
  }, [battleRound, playerMaxMp, setBattleResult, setIsGameOver, setPlayerGold, setPlayerHP, setPlayerMP, totalStats.maxHp])

  const closeDockPanel = useCallback(() => {
    setDockPanel(null)
  }, [])

  /** AchievementPanel 遗留 API：关闭时收起 dock */
  const setShowAchievement = useCallback((open: boolean) => {
    if (!open) setDockPanel(null)
  }, [])

  /** BattleLogPanel 遗留 API */
  const setShowBattleLog = useCallback((open: boolean) => {
    if (!open) setDockPanel(null)
  }, [])

  /** LoginPanel 遗留 API */
  const setShowLogin = useCallback((open: boolean) => {
    if (!open) setDockPanel(null)
  }, [])
  const login = useCallback((_username: string) => {
    setDockPanel(null)
  }, [])

  const pushChatMessage = useCallback((text: string, isSelf: boolean) => {
    const normalized = text.trim()
    if (!normalized) return
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: normalized,
        isSelf,
        timestamp: Date.now(),
      },
    ])
  }, [])

  const sendChatMessage = useCallback((text: string) => {
    pushChatMessage(text, true)
  }, [pushChatMessage])

  const sendBotChatMessage = useCallback((text: string) => {
    pushChatMessage(text, false)
  }, [pushChatMessage])

  /** 解析自动化指令，返回任务或null */
  const parseAutomationCommand = useCallback((text: string): AutomationMode | null => {
    const t = text.trim()
    // 停止/取消
    if (/^(停止|取消|end|stop|cancel)$/i.test(t)) {
      return null
    }
    // 自动模式
    if (/自动模式|auto/i.test(t)) {
      return { kind: 'auto_mode' }
    }
    // 刷钱刷经验（死则重试，不逃）
    if (/刷钱刷经验/.test(t)) {
      return { kind: 'farm_til_death' }
    }
    // 满血了再打
    if (/满血了再打/.test(t)) {
      return { kind: 'wait_full_hp' }
    }
    // 打不过就跑
    if (/打不过就/.test(t)) {
      // 提取自定义阈值
      const customThreshold = t.match(/(\d+)%/)
      const threshold = customThreshold ? Number(customThreshold[1]) / 100 : 0.2
      return { kind: 'flee_if_low_hp', threshold }
    }
    // 设置逃跑线50%
    const fleeThresholdMatch = t.match(/逃跑线(\d+)%/)
    if (fleeThresholdMatch) {
      return { kind: 'flee_if_low_hp', threshold: Number(fleeThresholdMatch[1]) / 100 }
    }
    // 连续战斗5次 / 打5场 / 战斗5次
    const repeatMatch = t.match(/(?:连续)?战斗(\d+)(?:次)?/)
    if (repeatMatch) {
      return { kind: 'repeat_battle', remaining: Number(repeatMatch[1]) }
    }
    // 刷5个怪
    const killMatch = t.match(/刷(\d+)个?怪/)
    if (killMatch) {
      return { kind: 'kill_count', remaining: Number(killMatch[1]), killed: 0 }
    }
    return null
  }, [])

  /** 根据自动化任务判断是否应该逃跑 */
  const shouldAutoFleeForAutomation = useCallback((currentHp: number, maxHp: number): boolean => {
    if (!automationTask) return false
    if (automationTask.kind === 'flee_if_low_hp') {
      return currentHp / maxHp < automationTask.threshold
    }
    return false
  }, [automationTask])

  /** 根据自动化任务判断是否等待满血 */
  const shouldWaitFullHpForAutomation = useCallback((): boolean => {
    return automationTask?.kind === 'wait_full_hp' && playerHP < totalStats.maxHp
  }, [automationTask, playerHP, totalStats.maxHp])

  /** 处理自动化任务步进，战斗结束后调用，返回是否应继续下一场 */
  const processAutomationAfterBattle = useCallback((battleResult: 'win' | 'lose' | null): { continue: boolean; message?: string } => {
    if (!automationTask) return { continue: false }

    switch (automationTask.kind) {
      case 'auto_mode':
        return { continue: true }

      case 'repeat_battle': {
        const next = automationTask.remaining - 1
        if (next <= 0) {
          return { continue: false, message: `已完成 ${automationTask.remaining} 场战斗` }
        }
        setAutomationTask({ kind: 'repeat_battle', remaining: next })
        return { continue: true }
      }

      case 'kill_count': {
        if (battleResult === 'win') {
          const nextKilled = automationTask.killed + 1
          if (nextKilled >= automationTask.remaining) {
            return { continue: false, message: `已击杀 ${nextKilled} 个敌人` }
          }
          setAutomationTask({ kind: 'kill_count', remaining: automationTask.remaining, killed: nextKilled })
        }
        return { continue: true }
      }

      case 'farm_til_death':
        // 死了就重试，赢了继续
        return { continue: true }

      case 'flee_if_low_hp':
        // 只在战斗前检查，战斗结束后不处理，继续下一场
        return { continue: true }

      case 'wait_full_hp':
        // 每场结束后检查血量
        if (playerHP >= totalStats.maxHp) {
          return { continue: true }
        }
        return { continue: false, message: '血量未满，等待回复' }

      default:
        return { continue: false }
    }
  }, [automationTask, playerHP, totalStats.maxHp])

  /** 取消自动化任务 */
  const cancelAutomation = useCallback(() => {
    setAutomationTask(null)
  }, [])

  // 免费回复满血
  const healWithGold = useCallback(() => {
    if (playerHP < totalStats.maxHp) {
      setPlayerHP(totalStats.maxHp)
    }
  }, [playerHP, totalStats.maxHp])

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
    playerMP,
    setPlayerMP,
    playerMaxMp,
    setPlayerMaxMp,
    playerStats,
    totalStats,
    fleeSuccessMessage,
    dismissFleeSuccessMessage,
    battleGridAnchor,
    battleSessionNonce,
    setBattleSessionNonce,
    battleLootDrop,
    combatEnemyId,
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
    setEnemyLevel,
    enemyCombatStats,
    setEnemyCombatStats,
    enemyPreview,
    // 位置
    playerPos,
    setPlayerPos,
    enemies,
    setEnemies,
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
    battleCount,
    achievements,
    setShowAchievement,
    battleLogs,
    setShowBattleLog,
    login,
    setShowLogin,
    chatMessages,
    setChatMessages,
    sendChatMessage,
    sendBotChatMessage,
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
    carriedSkillIds,
    setCarriedSkillIds: updateCarriedSkillIds,
    // 方法
    getAvailableSkills,
    tryLevelUp,
    startBattle,
    closeBattle,
    finalizeMapBattleFleeSuccess,
    handleFlee,
    healWithGold,
    completeMapBattleVictory,
    completeMapBattleDefeat,
    // 自动化
    automationTask,
    setAutomationTask,
    parseAutomationCommand,
    shouldAutoFleeForAutomation,
    shouldWaitFullHpForAutomation,
    processAutomationAfterBattle,
    cancelAutomation,
  }
}

export type GameState = ReturnType<typeof useGameState>
