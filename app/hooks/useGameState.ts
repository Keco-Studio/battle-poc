'use client'

import { useState, useCallback, useEffect, useLayoutEffect } from 'react'
import {
  EquipmentType,
  calcPlayerStats,
  calcPlayerStatsWithEquipment,
  calcEnemyStats,
  createEnemyEncounter,
  expForLevel,
  getAllSkills,
  initialEnemies,
  PLAYER_START,
  EnemyCombatStats,
  getBattleRewards,
  getDefaultCarriedSkillIds,
  sanitizeCarriedSkillIds,
  JOB_DISPLAY_NAMES,
} from '../constants'
import { getEquipmentTypes } from '@/src/lib/gameConfig/gameConfigRegistry'
import { POC_SKILLS_UPDATED_EVENT } from '@/src/lib/skills/pocSkillModulesStorage'
import type { JobClassId } from '../constants'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { loadPlayerSave, savePlayerSave, recordBattle, fetchBattleHistory } from '@/src/lib/db'
import type { BattleHistoryRow, PlayerSaveRow } from '@/src/lib/db'
import { clearLongTermBtPersisted } from '@/src/battle-core/service/ai/long-term-bt-memory'
import {
  ENEMY_CHAT_THREADS_STORAGE_KEY,
  SYSTEM_CHAT_THREADS_STORAGE_KEY,
} from '@/app/components/chat-panel/chatPanelConstants'

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
  carriedSkillIds?: string[]
}

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
  jobClassId?: string
}

const STORAGE_KEY = 'battle-game-save'
const CHAT_STORAGE_KEY = 'battle-chat-messages'
const JOB_SELECTED_KEY = 'battle-job-selected'
/** Dock PVP list cache (must clear on sign-out so guests do not see the previous account's roster). */
const PVP_PLAYERS_CACHE_KEY = 'battle:pvp-users-cache'

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

/** Clear shared browser keys so the next session/account does not read the previous user's data. */
function clearSharedBrowserGamePersistence(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(CHAT_STORAGE_KEY)
    window.localStorage.removeItem(SYSTEM_CHAT_THREADS_STORAGE_KEY)
    window.localStorage.removeItem(ENEMY_CHAT_THREADS_STORAGE_KEY)
    window.localStorage.removeItem(PVP_PLAYERS_CACHE_KEY)
    window.localStorage.removeItem(JOB_SELECTED_KEY)
    for (const key of [
      'battle-poc-skill-drafts-v1',
      'battle-poc-skill-modules-v1',
      'battle-poc-job-drafts-v1',
      'battle-poc-job-modules-v1',
      'battle-poc-game-config-drafts-v1',
      'battle-poc-game-config-modules-v1',
    ]) {
      window.localStorage.removeItem(key)
    }
    clearLongTermBtPersisted()
  } catch (e) {
    console.warn('Failed to clear browser game persistence:', e)
  }
}

/** Strip GoTrue session keys from localStorage so sign-out cannot be undone by a stale in-memory read. */
function wipeSupabaseAuthLocalStorageKeys(): void {
  if (typeof window === 'undefined') return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && (k.includes('-auth-token') || k.includes('code-verifier'))) toRemove.push(k)
    }
    for (const k of toRemove) {
      try {
        window.localStorage.removeItem(k)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function mapBattleHistoryRows(rows: BattleHistoryRow[]): BattleHistoryLogItem[] {
  return rows.map((r) => ({
    id: r.id,
    result: r.result,
    timestamp: new Date(r.created_at).getTime(),
    rounds: r.rounds ?? 0,
    expGained: r.exp_gained,
    goldGained: r.gold_gained,
    battleType: r.battle_type,
    opponentName: r.opponent_name ?? undefined,
  }))
}

const DEFAULT_GEAR: Record<EquipmentType, EquippedItem | null> = {
  weapon: null,
  ring: null,
  armor: null,
  shoes: null,
}

/** Guest snapshot written to `localStorage` immediately on sign-out to avoid a race with the auto-save effect. */
function guestSavedStatePayload(): SavedState {
  const maxHp = calcPlayerStats(1, 'hero').maxHp
  return {
    playerLevel: 1,
    playerExp: 0,
    playerGold: 0,
    playerHP: maxHp,
    equippedGear: { ...DEFAULT_GEAR },
    inventory: [],
    playerPos: { ...PLAYER_START },
    carriedSkillIds: getDefaultCarriedSkillIds('hero', 6),
    jobClassId: 'hero',
  }
}

export function useGameState() {
  /**
   * First frame must be consistent with SSR: do not read localStorage in useState (no window on server,
   * having save on client causes inconsistencies like 26/30 vs 30/30 during hydration).
   * Save is merged into state in useLayoutEffect; auto-save after storageHydrated to avoid overwriting save with default values.
   */
  const [storageHydrated, setStorageHydrated] = useState(false)

  /**
   * True once we have confirmed the auth state (user or no user).
   * Prevents DB auto-save from firing before the initial DB load completes,
   * which would overwrite cloud data with stale localStorage defaults.
   */
  const [dbHydrated, setDbHydrated] = useState(false)

  /** Supabase user id when logged in, null for guests. */
  const [authedUserId, setAuthedUserId] = useState<string | null>(null)

  const supabaseClient = useSupabaseOptional()

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
  const [showStudioImport, setShowStudioImport] = useState(false)
  const [studioImportCategory, setStudioImportCategory] =
    useState<import('@/app/components/studioImport/studioImportCatalog').StudioImportCategoryId | null>(
      null,
    )

  /** Display label after Supabase sign-in (usually email); null for guests. */
  const [accountLabel, setAccountLabel] = useState<string | null>(null)

  /** Map dock: achievements / log / chat / battle info / profile & auth */
  const [dockPanel, setDockPanel] = useState<DockPanelId | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [battleCount, setBattleCount] = useState(0)
  const [achievements] = useState<AchievementItem[]>(() => [...DEFAULT_ACHIEVEMENTS])
  const [battleLogs, setBattleLogs] = useState<BattleHistoryLogItem[]>([])
  /** Current PVP opponent name (used when writing to battleLogs) */
  const [pvpOpponentName, setPvpOpponentName] = useState<string | undefined>()
  /** Whether currently in PVP battle mode (disables collision detection) */
  const [isPVPMode, setIsPVPMode] = useState(false)
  /** Current PVP opponent carried skills from player_saves (app skill ids). */
  const [pvpOpponentCarriedSkillIds, setPvpOpponentCarriedSkillIds] = useState<string[]>([])

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
  const [carriedSkillIds, setCarriedSkillIds] = useState<string[]>(() => getDefaultCarriedSkillIds('hero', 6))

  /** Current job class id */
  const [jobClassId, setJobClassId] = useState<JobClassId>('hero')

  /** Whether to show the job selection modal */
  const [showJobSelect, setShowJobSelect] = useState(false)

  /** Automation task state */
  const [automationTask, setAutomationTask] = useState<AutomationMode | null>(null)

  // Base stats
  const playerStats = calcPlayerStats(playerLevel, jobClassId)
  const equipmentTypes = getEquipmentTypes()

  // Stats after equipment bonus
  const getTotalStats = useCallback((): TotalStats => {
    return calcPlayerStatsWithEquipment(playerLevel, jobClassId, equippedGear)
  }, [playerLevel, equippedGear, jobClassId])

  const totalStats = getTotalStats()

  /**
   * Apply `SavedState` from localStorage, or new-game defaults when `saved` is null.
   * Used on first paint, after sign-out (cleared storage), and on sign-in when there is no cloud row (guest → account migration reads storage before this runs).
   */
  const applyLocalPlayerSaveOrDefaults = useCallback((saved: SavedState | null) => {
    if (saved) {
      // Existing save → suppress job select modal for returning players
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(JOB_SELECTED_KEY, '1') } catch { /* ignore */ }
      }
      const lv = saved.playerLevel ?? 1
      const job = (saved.jobClassId ?? 'hero') as JobClassId
      setPlayerLevel(lv)
      setPlayerExp(saved.playerExp ?? 0)
      setPlayerGold(saved.playerGold ?? 0)
      setEquippedGear(saved.equippedGear ?? { ...DEFAULT_GEAR })
      setInventory(Array.isArray(saved.inventory) ? saved.inventory : [])
      setPlayerPos(saved.playerPos ?? { ...PLAYER_START })
      setJobClassId(job)
      const maxHp = calcPlayerStatsWithEquipment(lv, job, saved.equippedGear ?? {}).maxHp
      const hp = typeof saved.playerHP === 'number' ? saved.playerHP : maxHp
      setPlayerHP(Math.min(Math.max(0, hp), maxHp))
      const maxMp = Math.floor(maxHp / 2)
      setPlayerMaxMp(maxMp)
      setPlayerMP(maxMp)
      const savedCarry = Array.isArray(saved.carriedSkillIds)
        ? sanitizeCarriedSkillIds(saved.carriedSkillIds, job)
        : getDefaultCarriedSkillIds(job, 6)
      setCarriedSkillIds(savedCarry)
      return
    }
    setPlayerLevel(1)
    setPlayerExp(0)
    setPlayerGold(0)
    setEquippedGear({ ...DEFAULT_GEAR })
    setInventory([])
    setPlayerPos({ ...PLAYER_START })
    setJobClassId('hero')
    const maxHp = calcPlayerStats(1, 'hero').maxHp
    const maxMp = Math.floor(maxHp / 2)
    setPlayerHP(maxHp)
    setPlayerMaxMp(maxMp)
    setPlayerMP(maxMp)
    setCarriedSkillIds(getDefaultCarriedSkillIds('hero', 6))
    setEnemies([...initialEnemies])
  }, [])

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
    applyLocalPlayerSaveOrDefaults(loadSavedState())
    setStorageHydrated(true)
  }, [applyLocalPlayerSaveOrDefaults])

  useLayoutEffect(() => {
    setChatMessages(loadChatMessages())
  }, [])

  // Show job select modal for new characters (no existing save)
  useEffect(() => {
    if (!storageHydrated || !dbHydrated) return
    const hasSelected = typeof window !== 'undefined'
      && window.localStorage.getItem(JOB_SELECTED_KEY) === '1'
    if (!hasSelected) {
      setShowJobSelect(true)
    }
  }, [storageHydrated, dbHydrated])

  // Apply a DB save row to local state — used on login and initial auth check
  const applyDbSave = useCallback((save: PlayerSaveRow) => {
    const lv = save.level ?? 1
    const job = (save.job_class_id ?? 'hero') as JobClassId
    setPlayerLevel(lv)
    setPlayerExp(save.exp ?? 0)
    setPlayerGold(save.gold ?? 0)
    const gear = {
      weapon: (save.equipped_weapon as EquippedItem | null) ?? null,
      ring:   (save.equipped_ring   as EquippedItem | null) ?? null,
      armor:  (save.equipped_armor  as EquippedItem | null) ?? null,
      shoes:  (save.equipped_shoes  as EquippedItem | null) ?? null,
    }
    setEquippedGear(gear)
    setInventory(Array.isArray(save.inventory) ? (save.inventory as InventoryItem[]) : [])
    setPlayerPos({ x: save.pos_x, y: save.pos_y })
    setJobClassId(job)
    const maxHp = calcPlayerStatsWithEquipment(lv, job, gear).maxHp
    const hp = save.current_hp ?? maxHp
    setPlayerHP(Math.min(Math.max(0, hp), maxHp))
    const maxMp = Math.floor(maxHp / 2)
    setPlayerMaxMp(maxMp)
    setPlayerMP(maxMp)
    const carried =
      Array.isArray(save.carried_skill_ids) && save.carried_skill_ids.length > 0
        ? sanitizeCarriedSkillIds(save.carried_skill_ids as string[], job)
        : getDefaultCarriedSkillIds(job, 6)
    setCarriedSkillIds(carried)
  }, [])

  /**
   * Clear shared browser persistence and reset in-memory game state to new-guest defaults.
   * Call after `auth.signOut()` resolves (see DockFeatureModal) so we do not rely solely on
   * `onAuthStateChange`, and from `SIGNED_OUT` when the local session is actually gone.
   */
  const finalizeLocalSignOut = useCallback(() => {
    clearSharedBrowserGamePersistence()
    wipeSupabaseAuthLocalStorageKeys()
    applyLocalPlayerSaveOrDefaults(null)
    saveState(guestSavedStatePayload())
    setChatMessages([])
    setBattleLogs([])
    setBattleCount(0)
    setAutomationTask(null)
    setShowBattle(false)
    setNearbyEnemy(null)
    setCombatEnemyId(null)
    setPvpOpponentName(undefined)
    setIsPVPMode(false)
    setDockPanel(null)
    setAuthedUserId(null)
    setAccountLabel(null)
    setDbHydrated(true)
  }, [applyLocalPlayerSaveOrDefaults])

  const logoutAccount = finalizeLocalSignOut

  // Supabase auth: detect session, load from DB on login, set authedUserId
  useEffect(() => {
    if (!supabaseClient) {
      setDbHydrated(true)
      return
    }

    const client = supabaseClient

    const applySessionUser = (user: { id: string; email?: string | null }) => {
      setAuthedUserId(user.id)
      setAccountLabel(user.email ?? user.id)
    }

    async function initFromAuth() {
      try {
        const { data: { session }, error } = await client.auth.getSession()
        if (error || !session?.user) {
          setDbHydrated(true)
          return
        }
        applySessionUser(session.user)
        const save = await loadPlayerSave()
        if (save) {
          applyDbSave(save)
        } else {
          applyLocalPlayerSaveOrDefaults(loadSavedState())
          setChatMessages(loadChatMessages())
        }
        const logs = await fetchBattleHistory(50)
        setBattleLogs(mapBattleHistoryRows(logs))
      } catch (e) {
        console.warn('Auth init failed:', e)
      } finally {
        setDbHydrated(true)
      }
    }

    initFromAuth()

    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        applySessionUser(session.user)
        try {
          const save = await loadPlayerSave()
          if (save) {
            applyDbSave(save)
          } else {
            applyLocalPlayerSaveOrDefaults(loadSavedState())
            setChatMessages(loadChatMessages())
          }
          const logs = await fetchBattleHistory(50)
          setBattleLogs(mapBattleHistoryRows(logs))
        } catch (e) {
          console.warn('DB load on sign-in failed:', e)
        }
        setDbHydrated(true)
      }
      if ((event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        applySessionUser(session.user)
      }
      if (event === 'SIGNED_OUT') {
        // Do not re-check `getSession()` here: right after `signOut({ scope: 'local' })` it can still
        // briefly return the old user, which would call `applySessionUser` and skip cleanup — user stays "logged in".
        finalizeLocalSignOut()
      }
    })

    return () => subscription.unsubscribe()
  }, [supabaseClient, applyDbSave, applyLocalPlayerSaveOrDefaults, finalizeLocalSignOut])

  // Auto save — localStorage always; DB when logged in and DB hydrated
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
      jobClassId,
    })

    if (!authedUserId || !dbHydrated) return
    savePlayerSave({
      level:             playerLevel,
      exp:               playerExp,
      gold:              playerGold,
      current_hp:        playerHP,
      pos_x:             playerPos.x,
      pos_y:             playerPos.y,
      equipped_weapon:   equippedGear.weapon,
      equipped_ring:     equippedGear.ring,
      equipped_armor:    equippedGear.armor,
      equipped_shoes:    equippedGear.shoes,
      inventory,
      carried_skill_ids: carriedSkillIds,
      job_class_id:      jobClassId,
    }).catch(e => console.warn('DB auto-save failed:', e))
  }, [
    storageHydrated,
    dbHydrated,
    authedUserId,
    playerLevel,
    playerExp,
    playerGold,
    playerHP,
    equippedGear,
    inventory,
    playerPos,
    carriedSkillIds,
    jobClassId,
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
    const unlocked = getAllSkills().filter(s => s.unlockLevel <= playerLevel)
    const carried = carriedSkillIds
      .map((id) => unlocked.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s)
    return carried
  }, [playerLevel, carriedSkillIds])

  const updateCarriedSkillIds = useCallback((ids: string[]) => {
    setCarriedSkillIds(sanitizeCarriedSkillIds(ids, jobClassId))
  }, [jobClassId])

  // Re-validate equipped skills when the active skill module changes.
  useEffect(() => {
    const onSkillsUpdated = () => {
      setCarriedSkillIds((prev) => sanitizeCarriedSkillIds(prev, jobClassId))
    }
    window.addEventListener(POC_SKILLS_UPDATED_EVENT, onSkillsUpdated)
    return () => window.removeEventListener(POC_SKILLS_UPDATED_EVENT, onSkillsUpdated)
  }, [jobClassId])

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
      const stats = calcPlayerStatsWithEquipment(newLevel, jobClassId, equippedGear)
      setPlayerHP(stats.maxHp)
      const nextMaxMp = Math.floor(stats.maxHp / 2)
      setPlayerMaxMp(nextMaxMp)
      setPlayerMP(nextMaxMp)
    }
    return { exp: newExp, level: newLevel }
  }, [playerLevel, jobClassId, equippedGear])

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
  }, [equippedGear, equipmentTypes])

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
    (opponent: PVPUser) => {
      const user = opponent
      const stats = calcPlayerStats(user.level, 'hero')
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
      setPvpOpponentCarriedSkillIds(
        Array.isArray(user.carriedSkillIds)
          ? user.carriedSkillIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 6)
          : []
      )
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
    setPvpOpponentCarriedSkillIds([])
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
      setBattleLog((prev) => [...prev, closingLog, `获得 ${expGain} 经验！`])
      const winEntry = {
        id: `bh-${Date.now()}`,
        result: 'win' as const,
        timestamp: Date.now(),
        rounds: battleRound,
        expGained: expGain,
        goldGained: goldGain,
        battleType: (pvpOpponentName ? 'pvp' : 'pve') as 'pve' | 'pvp',
        opponentName: pvpOpponentName ?? nearbyEnemy?.name,
      }
      setBattleLogs((prev) => [...prev, winEntry])
      if (authedUserId) {
        recordBattle({
          result:        winEntry.result,
          battle_type:   winEntry.battleType,
          opponent_name: winEntry.opponentName ?? null,
          enemy_level:   enemyLevel,
          rounds:        winEntry.rounds,
          exp_gained:    winEntry.expGained,
          gold_gained:   winEntry.goldGained,
        }).catch(e => console.warn('recordBattle failed:', e))
      }
      if (afterLevelUp.level > playerLevel) {
        setBattleLog((prev) => [...prev, `Level up! Now Lv.${afterLevelUp.level}`])
      }
    },
    [
      authedUserId,
      battleRound,
      enemyLevel,
      equipmentTypes,
      nearbyEnemy,
      playerExp,
      playerLevel,
      pvpOpponentName,
      setBattleLog,
      setBattleLogs,
      setBattleResult,
      setGainedExp,
      setGainedGold,
      setInventory,
      setIsGameOver,
      setPlayerExp,
      setPlayerGold,
      tryLevelUp,
    ],
  )

  /** Map battle: defeat */
  const completeMapBattleDefeat = useCallback(() => {
    setIsGameOver(true)
    setBattleResult('lose')
    setPlayerGold(0)
    setPlayerHP(totalStats.maxHp)
    setPlayerMP(playerMaxMp)
    const loseEntry = {
      id: `bh-${Date.now()}`,
      result: 'lose' as const,
      timestamp: Date.now(),
      rounds: battleRound,
      battleType: (pvpOpponentName ? 'pvp' : 'pve') as 'pve' | 'pvp',
      opponentName: pvpOpponentName ?? nearbyEnemy?.name,
    }
    setBattleLogs((prev) => [...prev, loseEntry])
    if (authedUserId) {
      recordBattle({
        result:        loseEntry.result,
        battle_type:   loseEntry.battleType,
        opponent_name: loseEntry.opponentName ?? null,
        enemy_level:   enemyLevel,
        rounds:        loseEntry.rounds,
        exp_gained:    0,
        gold_gained:   0,
      }).catch(e => console.warn('recordBattle failed:', e))
    }
  }, [authedUserId, battleRound, enemyLevel, playerMaxMp, pvpOpponentName, nearbyEnemy, setBattleResult, setIsGameOver, setPlayerGold, setPlayerHP, setPlayerMP, totalStats.maxHp])

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
  const login = useCallback((label: string) => {
    const t = label.trim()
    setAccountLabel(t.length > 0 ? t : null)
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

  /** Switch to a new job class: reset skills, recalc stats, full heal */
  const switchJob = useCallback((newJob: JobClassId) => {
    setJobClassId(newJob)
    const defaultSkills = getDefaultCarriedSkillIds(newJob, 6)
    setCarriedSkillIds(defaultSkills)
    const newStats = calcPlayerStats(playerLevel, newJob)
    setPlayerHP(newStats.maxHp)
    const nextMaxMp = Math.floor(newStats.maxHp / 2)
    setPlayerMaxMp(nextMaxMp)
    setPlayerMP(nextMaxMp)
    // Persist immediately
    if (typeof window !== 'undefined') {
      try {
        const saved = loadSavedState()
        saveState({
          playerLevel: saved?.playerLevel ?? playerLevel,
          playerExp: saved?.playerExp ?? playerExp,
          playerGold: saved?.playerGold ?? playerGold,
          playerHP: newStats.maxHp,
          equippedGear: saved?.equippedGear ?? equippedGear,
          inventory: saved?.inventory ?? inventory,
          playerPos: saved?.playerPos ?? playerPos,
          carriedSkillIds: defaultSkills,
          jobClassId: newJob,
        })
      } catch { /* ignore */ }
    }
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(JOB_SELECTED_KEY, '1') } catch { /* ignore */ }
    }
    setShowJobSelect(false)
  }, [playerLevel, playerExp, playerGold, equippedGear, inventory, playerPos])

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
    jobClassId,
    setJobClassId,
    showJobSelect,
    setShowJobSelect,
    switchJob,
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
    showStudioImport,
    studioImportCategory,
    openStudioImportMenu: () => {
      setShowStudioImport(true)
      setStudioImportCategory(null)
    },
    openStudioImportCategory: (
      category: import('@/app/components/studioImport/studioImportCatalog').StudioImportCategoryId,
    ) => {
      setShowStudioImport(true)
      setStudioImportCategory(category)
    },
    setStudioImportCategory,
    closeStudioImport: () => {
      setShowStudioImport(false)
      setStudioImportCategory(null)
    },
    accountLabel,
    /** Supabase user id when logged in; null for guests. Used for instant profile UI without waiting on auth round-trips. */
    authUserId: authedUserId,
    logoutAccount,
    dockPanel,
    setDockPanel,
    closeDockPanel,
    battleCount,
    achievements,
    setShowAchievement,
    battleLogs,
    setShowBattleLog,
    isPVPMode,
    pvpOpponentCarriedSkillIds,
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
