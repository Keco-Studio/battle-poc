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

/** Placeholder data for AchievementPanel (legacy entry) */
export interface AchievementItem {
  id: string
  name: string
  desc: string
  icon: string
  unlocked: boolean
}

const DEFAULT_ACHIEVEMENTS: AchievementItem[] = [
  { id: 'a1', name: 'First Battle', desc: 'Complete your first battle', icon: '⚔️', unlocked: false },
  { id: 'a2', name: 'Battle Veteran', desc: 'Participate in 10 battles', icon: '🛡️', unlocked: false },
]

/** PVP opponent data */
export interface PVPUser {
  id: string
  name: string
  level: number
}

/** Mock PVP user list */
export const MOCK_PVP_USERS: PVPUser[] = [
  { id: 'u1', name: 'Red Eye', level: 3 },
  { id: 'u2', name: 'White Wood', level: 5 },
  { id: 'u3', name: 'Black Feather', level: 7 },
  { id: 'u4', name: 'Blue Leaf', level: 2 },
  { id: 'u5', name: 'Gold Well', level: 9 },
]

/** BattleLogPanel (legacy entry) item */
export interface BattleHistoryLogItem {
  id: string
  result: 'win' | 'lose'
  timestamp: number
  rounds: number
  expGained?: number
  goldGained?: number
  battleType: 'pve' | 'pvp'
  opponentName?: string
}

/** Popup for bottom-right map function entry */
export const DOCK_PANEL_IDS = [
  'achievements',
  'log',
  'chat',
  'battle_system',
  'character_login',
] as const
export type DockPanelId = (typeof DOCK_PANEL_IDS)[number]

/** Automation task types */
export type AutomationMode =
  | { kind: 'repeat_battle'; remaining: number }
  | { kind: 'flee_if_low_hp'; threshold: number }
  | { kind: 'wait_full_hp' }
  | { kind: 'farm_til_death' }
  | { kind: 'auto_mode' }
  | { kind: 'kill_count'; remaining: number; killed: number }

/** Grid anchors for both sides when map battle starts (aligned with battle-core entity coordinates) */
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
   * First frame must be consistent with SSR: do not read localStorage in useState (no window on server,
   * having save on client causes inconsistencies like 26/30 vs 30/30 during hydration).
   * Save is merged into state in useLayoutEffect; auto-save after storageHydrated to avoid overwriting save with default values.
   */
  const [storageHydrated, setStorageHydrated] = useState(false)

  // Player state (default = new game without save, consistent with server first render)
  const [playerLevel, setPlayerLevel] = useState(1)
  const [playerExp, setPlayerExp] = useState(0)
  const [playerGold, setPlayerGold] = useState(0)

  // Equipment state
  const [equippedGear, setEquippedGear] = useState<Record<EquipmentType, EquippedItem | null>>(() => ({
    ...DEFAULT_GEAR,
  }))
  const [inventory, setInventory] = useState<InventoryItem[]>([])

  /** Brief display after returning to map (e.g. flee success), not saved to storage */
  const [fleeSuccessMessage, setFleeSuccessMessage] = useState<string | null>(null)

  /** Increments each startBattle, for map battle MapBattleController reconstruction */
  const [battleSessionNonce, setBattleSessionNonce] = useState(0)

  /** Map battle: grid positions of both sides; passed by startBattle */
  const [battleGridAnchor, setBattleGridAnchor] = useState<BattleGridAnchor | null>(null)
  /** Equipment drop display during map battle victory settlement */
  const [battleLootDrop, setBattleLootDrop] = useState<{ name: string; icon: string } | null>(null)
  /** Currently engaged map enemy id (only that unit pauses random wandering) */
  const [combatEnemyId, setCombatEnemyId] = useState<number | null>(null)

  // Battle state
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

  // Position state
  const [playerPos, setPlayerPos] = useState(() => ({ ...PLAYER_START }))
  const [enemies, setEnemies] = useState(() => [...initialEnemies])

  // UI state
  const [showInteraction, setShowInteraction] = useState(false)
  const [nearbyEnemy, setNearbyEnemy] = useState<typeof enemies[0] | null>(null)
  const [showBattle, setShowBattle] = useState(false)
  const [showCharacter, setShowCharacter] = useState(false)
  const [showEnemyInfo, setShowEnemyInfo] = useState(false)
  const [showEquipment, setShowEquipment] = useState(false)
  const [showSkills, setShowSkills] = useState(false)

  /** Bottom-right of map: achievements / log / chat / battle system / character login */
  const [dockPanel, setDockPanel] = useState<DockPanelId | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [battleCount, setBattleCount] = useState(0)
  const [achievements] = useState<AchievementItem[]>(() => [...DEFAULT_ACHIEVEMENTS])
  const [battleLogs, setBattleLogs] = useState<BattleHistoryLogItem[]>([])
  /** Current PVP opponent name (used when writing to battleLogs) */
  const [pvpOpponentName, setPvpOpponentName] = useState<string | undefined>()
  /** Whether currently in PVP battle mode (disables collision detection) */
  const [isPVPMode, setIsPVPMode] = useState(false)

  // Battle related
  const [battleLog, setBattleLog] = useState<string[]>([])
  const [currentTurn, setCurrentTurn] = useState<'player' | 'enemy'>('player')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [isGameOver, setIsGameOver] = useState(false)
  const [battleResult, setBattleResult] = useState<'win' | 'lose' | null>(null)
  const [isDefending, setIsDefending] = useState(false)
  const [battleRound, setBattleRound] = useState(1)
  /** Real-time battle: skill id for next auto-attack, null means basic attack */
  const [nextAttackSkillId, setNextAttackSkillId] = useState<string | null>(null)
  /** Skill id -> cooldown end timestamp (ms) */
  const [skillCooldownEndAt, setSkillCooldownEndAt] = useState<Record<string, number>>({})
  const [gainedExp, setGainedExp] = useState(0)
  const [gainedGold, setGainedGold] = useState(0)
  const [carriedSkillIds, setCarriedSkillIds] = useState<string[]>(() => getDefaultCarriedSkillIds('archer', 6))

  /** Automation task state */
  const [automationTask, setAutomationTask] = useState<AutomationMode | null>(null)

  // Base stats
  const playerStats = calcPlayerStats(playerLevel)

  // Stats after equipment bonus
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

  // Auto save (avoid first frame using default values to overwrite localStorage)
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

  // Get unlocked skills
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

  // Level up handling
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

  // Equip item
  const equipItem = useCallback((item: InventoryItem, itemIndex: number) => {
    // If same type already equipped, replace (old equipment goes back to backpack)
    if (equippedGear[item.type]) {
      const oldItem = equippedGear[item.type]!
      setInventory(prev => [...prev, { type: item.type, name: oldItem.name, icon: oldItem.icon }])
    }
    // Remove from backpack and equip
    setInventory(prev => prev.filter((_, idx) => idx !== itemIndex))
    setEquippedGear(prev => ({ ...prev, [item.type]: { name: item.name, icon: item.icon } }))
  }, [equippedGear])

  // Unequip item
  const unequipItem = useCallback((type: EquipmentType) => {
    if (equippedGear[type]) {
      setInventory(prev => [...prev, { type, name: equipmentTypes[type].name, icon: equipmentTypes[type].icon }])
      setEquippedGear(prev => ({ ...prev, [type]: null }))
    }
  }, [equippedGear])

  // Sell equipment
  const sellItem = useCallback((itemIndex: number) => {
    setInventory(prev => prev.filter((_, idx) => idx !== itemIndex))
    setPlayerGold(prev => prev + 1)
  }, [])

  // Start battle (optional anchor: map battle passes grid coordinates of both sides)
  const startBattle = useCallback(
    (anchor?: BattleGridAnchor) => {
      const encounter = nearbyEnemy ? enemyPreview : createEnemyEncounter(playerLevel)

      setShowBattle(true)
      setBattleRound(1)
      setBattleLog(['Battle started! (battle-core tick)'])
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
      setIsPVPMode(false)
    },
    [enemyPreview, nearbyEnemy, playerLevel],
  )

  // Start PVP battle
  const startPVPBattle = useCallback(
    (userId: string) => {
      const user = MOCK_PVP_USERS.find((u) => u.id === userId)
      if (!user) return

      const stats = calcPlayerStats(user.level)
      if (enemies.length === 0) {
        setEnemies([...initialEnemies])
      }
      const actorPool = enemies.length > 0 ? enemies : initialEnemies
      const picked = actorPool[Math.floor(Math.random() * actorPool.length)] ?? null
      const anchorPlayer = { x: Math.round(playerPos.x), y: Math.round(playerPos.y) }
      const anchorEnemy = { x: anchorPlayer.x + 1, y: anchorPlayer.y }

      setPvpOpponentName(user.name)
      setShowBattle(true)
      setBattleRound(1)
      setBattleLog([`PVP battle: vs ${user.name}!`])
      setEnemyHP(stats.maxHp)
      setEnemyMaxHp(stats.maxHp)
      setEnemyLevel(user.level)
      setEnemyCombatStats(stats)
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
      setBattleGridAnchor({ player: anchorPlayer, enemy: anchorEnemy })
      setCombatEnemyId(picked?.id ?? null)
      setBattleSessionNonce((n) => n + 1)
      setBattleCount((c) => c + 1)
      setEnemyPreview({ level: user.level, stats })
      setIsPVPMode(true)
    },
    [enemies, playerPos.x, playerPos.y],
  )

  // Close battle
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
    setIsPVPMode(false)
  }, [])

  /**
   * Only called after battle-core has ended this battle with `battle_ended.reason === 'flee_success'`:
   * Closes battle UI, resets map enemy display HP (for next encounter), does not replace the engine's `flee` command.
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
    setIsPVPMode(false)
  }, [enemyPreview.stats.maxHp, setEnemyHP, setEnemyMaxHp])

  /** @deprecated Same as finalizeMapBattleFleeSuccess; kept for legacy component references */
  const handleFlee = finalizeMapBattleFleeSuccess

  const dismissFleeSuccessMessage = useCallback(() => {
    setFleeSuccessMessage(null)
  }, [])

  /** Map battle: victory settlement (exp, gold, and optional drop) */
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
        setBattleLog((prev) => [...prev, `Lucky! Got ${eq.icon}${eq.name}!`])
      }
      const afterLevelUp = tryLevelUp(playerExp + expGain)
      setPlayerExp(afterLevelUp.exp)
      setBattleLog((prev) => [...prev, closingLog, `Gained ${expGain} EXP and ${goldGain} Gold!`])
      setBattleLogs((prev) => [
        ...prev,
        {
          id: `bh-${Date.now()}`,
          result: 'win',
          timestamp: Date.now(),
          rounds: battleRound,
          expGained: expGain,
          goldGained: goldGain,
          battleType: pvpOpponentName ? 'pvp' : 'pve',
          opponentName: pvpOpponentName ?? nearbyEnemy?.name,
        },
      ])
      if (afterLevelUp.level > playerLevel) {
        setBattleLog((prev) => [...prev, `Level up! Now Lv.${afterLevelUp.level}`])
      }
    },
    [battleRound, enemyLevel, playerExp, playerLevel, setBattleLog, setBattleResult, setGainedExp, setGainedGold, setInventory, setIsGameOver, setPlayerExp, setPlayerGold, tryLevelUp],
  )

  /** Map battle: defeat */
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
        battleType: pvpOpponentName ? 'pvp' : 'pve',
        opponentName: pvpOpponentName ?? nearbyEnemy?.name,
      },
    ])
  }, [battleRound, playerMaxMp, pvpOpponentName, nearbyEnemy, setBattleResult, setIsGameOver, setPlayerGold, setPlayerHP, setPlayerMP, totalStats.maxHp])

  const closeDockPanel = useCallback(() => {
    setDockPanel(null)
  }, [])

  /** AchievementPanel legacy API: close dock when closing */
  const setShowAchievement = useCallback((open: boolean) => {
    if (!open) setDockPanel(null)
  }, [])

  /** BattleLogPanel legacy API */
  const setShowBattleLog = useCallback((open: boolean) => {
    if (!open) setDockPanel(null)
  }, [])

  /** LoginPanel legacy API */
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

  /** Parse automation command, return task or null */
  const parseAutomationCommand = useCallback((text: string): AutomationMode | null => {
    const t = text.trim()
    // Stop/cancel
    if (/^(停止|取消|end|stop|cancel)$/i.test(t)) {
      return null
    }
    // Auto mode
    if (/自动模式|auto/i.test(t)) {
      return { kind: 'auto_mode' }
    }
    // Farm gold and exp (retry on death, don't flee)
    if (/刷钱刷经验|farm/i.test(t)) {
      return { kind: 'farm_til_death' }
    }
    // Fight when full HP
    if (/满血了再打|full hp/i.test(t)) {
      return { kind: 'wait_full_hp' }
    }
    // Flee if can't win
    if (/打不过就|flee if losing/i.test(t)) {
      // Extract custom threshold
      const customThreshold = t.match(/(\d+)%/)
      const threshold = customThreshold ? Number(customThreshold[1]) / 100 : 0.2
      return { kind: 'flee_if_low_hp', threshold }
    }
    // Set flee threshold 50%
    const fleeThresholdMatch = t.match(/逃跑线(\d+)%|flee threshold (\d+)%/i)
    if (fleeThresholdMatch) {
      return { kind: 'flee_if_low_hp', threshold: Number(fleeThresholdMatch[1]) / 100 }
    }
    // Battle 5 times / fight 5 rounds / battle 5 times
    const repeatMatch = t.match(/(?:连续)?战斗(\d+)(?:次)?|repeat battle (\d+)/i)
    if (repeatMatch) {
      return { kind: 'repeat_battle', remaining: Number(repeatMatch[1]) }
    }
    // Kill 5 monsters
    const killMatch = t.match(/刷(\d+)个?怪|kill (\d+) monsters?/i)
    if (killMatch) {
      return { kind: 'kill_count', remaining: Number(killMatch[1]), killed: 0 }
    }
    return null
  }, [])

  /** Determine if should flee based on automation task */
  const shouldAutoFleeForAutomation = useCallback((currentHp: number, maxHp: number): boolean => {
    if (!automationTask) return false
    if (automationTask.kind === 'flee_if_low_hp') {
      return currentHp / maxHp < automationTask.threshold
    }
    return false
  }, [automationTask])

  /** Determine if should wait for full HP based on automation task */
  const shouldWaitFullHpForAutomation = useCallback((): boolean => {
    return automationTask?.kind === 'wait_full_hp' && playerHP < totalStats.maxHp
  }, [automationTask, playerHP, totalStats.maxHp])

  /** Process automation task step, called after battle ends, returns whether to continue to next battle */
  const processAutomationAfterBattle = useCallback((battleResult: 'win' | 'lose' | null): { continue: boolean; message?: string } => {
    if (!automationTask) return { continue: false }

    switch (automationTask.kind) {
      case 'auto_mode':
        return { continue: true }

      case 'repeat_battle': {
        const next = automationTask.remaining - 1
        if (next <= 0) {
          return { continue: false, message: `Completed ${automationTask.remaining} battles` }
        }
        setAutomationTask({ kind: 'repeat_battle', remaining: next })
        return { continue: true }
      }

      case 'kill_count': {
        if (battleResult === 'win') {
          const nextKilled = automationTask.killed + 1
          if (nextKilled >= automationTask.remaining) {
            return { continue: false, message: `Killed ${nextKilled} enemies` }
          }
          setAutomationTask({ kind: 'kill_count', remaining: automationTask.remaining, killed: nextKilled })
        }
        return { continue: true }
      }

      case 'farm_til_death':
        // Retry if dead, continue if win
        return { continue: true }

      case 'flee_if_low_hp':
        // Only check before battle, don't handle after battle ends, continue to next battle
        return { continue: true }

      case 'wait_full_hp':
        // Check HP after each battle
        if (playerHP >= totalStats.maxHp) {
          return { continue: true }
        }
        return { continue: false, message: 'HP not full, waiting to recover' }

      default:
        return { continue: false }
    }
  }, [automationTask, playerHP, totalStats.maxHp])

  /** Cancel automation task */
  const cancelAutomation = useCallback(() => {
    setAutomationTask(null)
  }, [])

  // Free heal to full HP
  const healWithGold = useCallback(() => {
    if (playerHP < totalStats.maxHp) {
      setPlayerHP(totalStats.maxHp)
    }
  }, [playerHP, totalStats.maxHp])

  return {
    // Player state
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
    // Equipment
    equippedGear,
    setEquippedGear,
    inventory,
    setInventory,
    equipItem,
    unequipItem,
    sellItem,
    // Enemy
    enemyHP,
    setEnemyHP,
    enemyMaxHp,
    setEnemyMaxHp,
    enemyLevel,
    setEnemyLevel,
    enemyCombatStats,
    setEnemyCombatStats,
    enemyPreview,
    // Position
    playerPos,
    setPlayerPos,
    enemies,
    setEnemies,
    // UI state
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
    isPVPMode,
    login,
    setShowLogin,
    chatMessages,
    setChatMessages,
    sendChatMessage,
    sendBotChatMessage,
    // Battle
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
    // Methods
    getAvailableSkills,
    tryLevelUp,
    startBattle,
    startPVPBattle,
    closeBattle,
    finalizeMapBattleFleeSuccess,
    handleFlee,
    healWithGold,
    completeMapBattleVictory,
    completeMapBattleDefeat,
    // Automation
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
