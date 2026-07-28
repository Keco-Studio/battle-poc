'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, ScrollText, MessageSquare, Swords, User, Download } from 'lucide-react'
import { GameState } from '../hooks/useGameState'
import {
  INTERACTION_RANGE,
  getSkillById,
  cooldownMsFromTicks,
  createEnemyEncounter,
  getBattleRewards,
  JOB_DISPLAY_NAMES,
  type Skill,
  type Enemy,
  type MapCharacterVisualId,
} from '../constants'
import type { DockPanelId } from '../hooks/useGameState'
import DockFeatureModal from './DockFeatureModal'
import JobSelectModal from './JobSelectModal'
import InteractionButtons from './map-ui/InteractionButtons'
import EnemyInfoModal from './map-ui/EnemyInfoModal'
import MapBattleViewport from './map-ui/MapBattleViewport'
import MapBattleHud from './map-ui/MapBattleHud'
import { resolveSkillFxProfile } from './map-ui/skillFxProfile'
import PixellabMapGeneratorModal from './map-ui/PixellabMapGeneratorModal'
import CollisionEditorModal from './map-ui/CollisionEditorModal'
import { useAutoBattleStart } from './map-ui/hooks/useAutoBattleStart'
import { useEnemyInfoInteraction } from './map-ui/hooks/useEnemyInfoInteraction'
import { useMapClickMove } from './map-ui/hooks/useMapClickMove'
import { useEnemyPatrol } from './map-ui/hooks/useEnemyPatrol'
import { useMapKeyboardMovement } from './map-ui/hooks/useMapKeyboardMovement'
import { useMapRenderMetrics } from './map-ui/hooks/useMapRenderMetrics'
import { useMapCombatFx } from './map-ui/hooks/useMapCombatFx'
import { useMapTransientFx } from './map-ui/hooks/useMapTransientFx'
import { processMapBattleEvents } from './map-ui/utils/processMapBattleEvents'
import { applyMapBattleStepState } from './map-ui/utils/applyMapBattleStepState'
import { prepareMapBattleStep } from './map-ui/utils/prepareMapBattleStep'
import { finalizeMapBattleTick } from './map-ui/utils/finalizeMapBattleTick'
import { useMapUiMetrics } from './map-ui/hooks/useMapUiMetrics'
import { useNearbyEnemyDetection } from './map-ui/hooks/useNearbyEnemyDetection'
import { usePixellabSync } from './map-ui/hooks/usePixellabSync'
import { ensureDeepClawAgentEnemy } from './map-ui/utils/gameMapBattleUtils'
import { classifyBattleCommandMetadata } from '@/app/lib/battle-ai-command-stats'
import { LocalModeNotice } from './LocalModeNotice'
// disengageGridPositions moved to resolveMapBattleOutcome helper.
import {
  ROTATION_KEYS,
  DEFAULT_DIRECTION,
  MAP_DISPLAY_ORDER,
  getMapDisplayName,
  snapToGrid,
  type PixelLabPackMeta,
  type RotationKey,
} from './map-ui/gameMapUtils'
import { MapBattleController } from '../../src/map-battle/MapBattleController'
import { isDemoDungeonCellWalkable, snapGridSpawnToWalkable } from '../../src/map-battle/dungeonDemoFootTiles'
import { resolveInitialMapPosition } from '@/src/lib/maps/saved-map-position'
import { parseMapRef, type MapRef } from '@/src/lib/maps/map-reference'
import {
  EMPTY_VS01_PROGRESS,
  VS01_PROGRESS_STORAGE_KEY,
  getVs01Objective,
  isVs01CoreUnlocked,
  normalizeVs01Progress,
  recordVs01Victory,
  type Vs01Progress,
} from '@/src/content/generated/vs01/progression'

interface Props {
  game: GameState
}

type MapTileset = {
  id: string
  imagePath: string
  publicImagePath: string | null
  tileWidth: number
  tileHeight: number
  tileCount: number
  columns: number
}

type MapCatalogItem = {
  id: string
  ref: MapRef
  source: 'builtin' | 'user'
  name: string
  fileName: string | null
  previewUrl?: string | null
}

type AirpgMapPayload = {
  mapRef: MapRef
  width: number
  height: number
  backgroundImageUrl?: string | null
  ground: number[]
  collision: number[]
  mapId: string
  tileset: MapTileset | null
  playerSpawn: { x: number; y: number }
  playerVisualId?: MapCharacterVisualId
  enemies: Array<{
    id: number
    templateId?: string
    skillIds?: string[]
    name: string
    x: number
    y: number
    level: number
    profile?: { maxHp?: number | null; atk?: number | null; def?: number | null; spd?: number | null }
    enemyType?: 'wild' | 'agent'
    agentId?: string
    visualId?: MapCharacterVisualId | null
    mapSpriteTileIndex?: number
  }>
}

type MoveAnim = 'idle' | 'walk' | 'running'

/**
 * battle-core map battle tick interval.
 * Using 200ms as time granularity, can express:
 * - 1.0s/shot = 5 tick
 * - 0.8s/shot = 4 tick
 */
const BASE_BATTLE_TICK_MS = 200

type BattleSpeedMultiplier = 0.5 | 1 | 2

type ReceivedCommandMeta = {
  actorId: string
  targetId: string
  action: string
  skillId: string
  metadata: Record<string, unknown>
}

type BattleAiDebugStats = {
  totalCommands: number
  llmCommands: number
  macroOrSeqCommands: number
  llmSeqCommands: number
  fallbackCommands: number
  totalRejects: number
  dashBlockedRejects: number
}

const EMPTY_BATTLE_AI_DEBUG_STATS: BattleAiDebugStats = {
  totalCommands: 0,
  llmCommands: 0,
  macroOrSeqCommands: 0,
  llmSeqCommands: 0,
  fallbackCommands: 0,
  totalRejects: 0,
  dashBlockedRejects: 0,
}

const MANUAL_FLEE_DEBOUNCE_MS = 450

export default function GameMap({ game }: Props) {
  const {
    playerPos,
    setPlayerPos,
    currentMapRef,
    setCurrentMapRef,
    playerPositionMapRef,
    setResolvedMapPosition,
    enemies,
    setEnemies,
    showInteraction,
    setShowInteraction,
    nearbyEnemy,
    setNearbyEnemy,
    showEnemyInfo,
    setShowEnemyInfo,
    startBattle,
    showBattle,
    isPVPMode,
    pvpOpponentCarriedSkillIds,
    playerLevel,
    playerHP,
    setPlayerHP,
    playerMP,
    setPlayerMP,
    playerMaxMp,
    totalStats,
    playerExp,
    setShowCharacter,
    openStudioImportMenu,
    fleeSuccessMessage,
    dismissFleeSuccessMessage,
    dockPanel,
    setDockPanel,
    enemyPreview,
    battleGridAnchor,
    battleSessionNonce,
    setBattleSessionNonce,
    enemyCombatStats,
    enemyHP,
    setEnemyHP,
    enemyMaxHp,
    setEnemyMaxHp,
    nextAttackSkillId,
    setNextAttackSkillId,
    skillCooldownEndAt,
    setSkillCooldownEndAt,
    battleLog,
    setBattleLog,
    isGameOver,
    setIsDefending,
    setIsGameOver,
    setBattleResult,
    setBattleRound,
    battleResult,
    gainedExp,
    setGainedExp,
    setGainedGold,
    getAvailableSkills,
    finalizeMapBattleFleeSuccess,
    closeBattle,
    completeMapBattleVictory,
    completeMapBattleDefeat,
    battleLootDrop,
    tryLevelUp,
    combatEnemyId,
    enemyLevel,
    setEnemyLevel,
    setEnemyCombatStats,
    setPlayerExp,
    setPlayerGold,
    automationTask,
    processAutomationAfterBattle,
    cancelAutomation,
    accountLabel,
  } = game

  const dockItems: {
    id: DockPanelId
    label: string
    Icon: typeof Trophy
  }[] = [
      { id: 'achievements', label: 'Battle history', Icon: Trophy },
      { id: 'log', label: 'Battle log', Icon: ScrollText },
      { id: 'chat', label: 'Chat', Icon: MessageSquare },
      { id: 'battle_system', label: 'Start battle', Icon: Swords },
      { id: 'character_login', label: 'Profile', Icon: User },
    ]

  useEffect(() => {
    if (!fleeSuccessMessage) return
    const t = window.setTimeout(() => dismissFleeSuccessMessage(), 4500)
    return () => window.clearTimeout(t)
  }, [fleeSuccessMessage, dismissFleeSuccessMessage])

  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(null)
  const [tilesetReady, setTilesetReady] = useState(false)
  const [availableMaps, setAvailableMaps] = useState<MapCatalogItem[]>([])
  const [vs01Progress, setVs01Progress] = useState<Vs01Progress>(EMPTY_VS01_PROGRESS)
  const vs01ProgressRef = useRef(vs01Progress)
  vs01ProgressRef.current = vs01Progress
  const vs01CoreUnlocked = isVs01CoreUnlocked(vs01Progress)
  const orderedAvailableMaps = useMemo(() => {
    const orderIndex = new Map(MAP_DISPLAY_ORDER.map((id, index) => [id, index]))
    return [...availableMaps].sort((a, b) => {
      const aIndex = orderIndex.get(a.id)
      const bIndex = orderIndex.get(b.id)
      if (aIndex !== undefined || bIndex !== undefined) {
        return (aIndex ?? Number.MAX_SAFE_INTEGER) - (bIndex ?? Number.MAX_SAFE_INTEGER)
      }
      return getMapDisplayName(a.id).localeCompare(getMapDisplayName(b.id))
    })
  }, [availableMaps])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VS01_PROGRESS_STORAGE_KEY)
      if (stored) setVs01Progress(normalizeVs01Progress(JSON.parse(stored)))
    } catch {
      setVs01Progress({ ...EMPTY_VS01_PROGRESS })
    }
  }, [])
  const savedPlayerPosRef = useRef(playerPos)
  savedPlayerPosRef.current = playerPos
  const playerPositionMapRefRef = useRef(playerPositionMapRef)
  playerPositionMapRefRef.current = playerPositionMapRef
  const loadedMapPayloadRef = useRef<AirpgMapPayload | null>(null)
  const [mapInfo, setMapInfo] = useState<{
    width: number
    height: number
    ground: number[]
    collision: number[]
    mapId: string
    tileset: MapTileset | null
  }>({
    width: 16,
    height: 16,
    ground: [],
    collision: [],
    mapId: 'fallback',
    tileset: null,
  })
  const [playerFacing, setPlayerFacing] = useState<RotationKey>(DEFAULT_DIRECTION)
  const [playerVisualId, setPlayerVisualId] = useState<MapCharacterVisualId>('archerGreen')
  const [pixelLabPacks, setPixelLabPacks] = useState<Record<string, PixelLabPackMeta | null>>({})
  const [walkAnimTick, setWalkAnimTick] = useState(0)
  const [enemyLastMoveAt, setEnemyLastMoveAt] = useState<Record<number, number>>({})
  const [playerLastMoveAt, setPlayerLastMoveAt] = useState(0)
  const [pixellabSyncHint, setPixellabSyncHint] = useState<string | null>(null)
  const [showPixellabMapGen, setShowPixellabMapGen] = useState(false)
  const [showCollisionEditor, setShowCollisionEditor] = useState(false)
  const [chatMode, setChatMode] = useState<{ kind: 'system' } | { kind: 'enemy'; enemyId: number; enemyName: string }>({
    kind: 'system',
  })
  const [mapBgUrl, setMapBgUrl] = useState<string | null>(null)
  const [mapBgImage, setMapBgImage] = useState<HTMLImageElement | null>(null)
  const prevEnemyGridRef = useRef<Record<number, { x: number; y: number }>>({})
  const prevPlayerGridRef = useRef<{ x: number; y: number } | null>(null)

  // Avoid SSR hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Enemy independent position state (for random movement)
  const [enemyPositions, setEnemyPositions] = useState<Record<number, { x: number; y: number }>>({})
  const [enemyFacings, setEnemyFacings] = useState<Record<number, RotationKey>>({})
  const enemyTargetsRef = useRef<Record<number, { x: number; y: number }>>({})

  const enemiesRef = useRef(enemies)
  enemiesRef.current = enemies
  const enemyPositionsRef = useRef(enemyPositions)
  enemyPositionsRef.current = enemyPositions

  type ActorWalkOpts = {
    ignoreEnemyIds?: number[]
    ignorePlayerOnCell?: { x: number; y: number }
  }

  const isWalkable = useCallback(
    (x: number, y: number, actorOpts?: ActorWalkOpts) => {
      // No collision detection in PVP mode, entire map is accessible
      if (isPVPMode) return true
      if (
        !isDemoDungeonCellWalkable({
          x,
          y,
          mapW: mapInfo.width,
          mapH: mapInfo.height,
          collision: mapInfo.collision,
          ground: mapInfo.ground,
          tilesetId: mapInfo.tileset?.id ?? null,
        })
      ) {
        return false
      }
      const ipc = actorOpts?.ignorePlayerOnCell
      const ignorePlayerHere = ipc && Math.round(ipc.x) === x && Math.round(ipc.y) === y
      if (!ignorePlayerHere && Math.round(playerPos.x) === x && Math.round(playerPos.y) === y) {
        return false
      }
      for (const e of enemies) {
        if (actorOpts?.ignoreEnemyIds?.includes(e.id)) continue
        const p = enemyPositions[e.id] ?? { x: e.x, y: e.y }
        if (Math.round(p.x) === x && Math.round(p.y) === y) return false
      }
      return true
    },
    [
      mapInfo.width,
      mapInfo.height,
      mapInfo.collision,
      mapInfo.ground,
      mapInfo.tileset?.id,
      playerPos.x,
      playerPos.y,
      enemies,
      enemyPositions,
      isPVPMode,
    ],
  )

  const {
    renderWidth,
    renderHeight,
    renderOffsetX,
    renderOffsetY,
    mapCellDisplayPx,
    actorPx,
    gridToScreen,
  } = useMapRenderMetrics({
    viewportSize,
    mapWidth: mapInfo.width,
    mapHeight: mapInfo.height,
  })

  function skillCooldownRemaining(endAt: Record<string, number>, skillId: string): number {
    const t = endAt[skillId]
    if (t === undefined) return 0
    return Math.max(0, t - Date.now())
  }

  const mapBattleControllerRef = useRef<MapBattleController | null>(null)
  /** Respawn wild monster with same id when victory settlement closes popup */
  const pendingRespawnEnemyIdRef = useRef<number | null>(null)
  const manualFleeRequestedRef = useRef(false)
  const lastManualFleeRequestAtRef = useRef(0)
  const autoFleePendingRef = useRef(false)
  const autoFleeConsumedMapRef = useRef(false)
  const mapBattleEndedRef = useRef(false)
  const nextAttackSkillRef = useRef<string | null>(null)
  nextAttackSkillRef.current = nextAttackSkillId
  /** In automation mode: don't show victory/defeat settlement, directly continue to next battle */
  const automationModeRef = useRef(false)
  automationModeRef.current = !!automationTask
  /** Battle timer ID (for cleanup when automation restarts) */
  const battleTimerRef = useRef<number | null>(null)
  const cdTimerRef = useRef<number | null>(null)
  const tickTimeoutRef = useRef<number | null>(null)

  const [battleTimeSec, setBattleTimeSec] = useState(0)
  /** For settlement: ticks advanced by battle-core (still readable when wall clock is less than 1s) */
  const [lastBattleTickCount, setLastBattleTickCount] = useState(0)
  const [battleSpeed, setBattleSpeed] = useState<BattleSpeedMultiplier>(1)
  const battleSpeedRef = useRef<BattleSpeedMultiplier>(1)
  battleSpeedRef.current = battleSpeed
  const {
    floatTexts,
    moveFx,
    projectileFx,
    impactFx,
    clearTransientFx,
    pushFloatText,
    pushMoveFx,
    pushProjectileFx,
    pushImpactFx,
  } = useMapTransientFx()
  const { playerCombatFx, enemyCombatFx, resetCombatFx, triggerCombatFx } = useMapCombatFx()
  const projectileTargetByCommandRef = useRef<Record<string, { target: 'player' | 'enemy' }>>({})
  const commandMetaByIdRef = useRef<Record<string, ReceivedCommandMeta>>({})
  const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null)
  const [, setCdUiTick] = useState(0)
  const [battlePlayerMaxHp, setBattlePlayerMaxHp] = useState(0)
  const [battleAiDebugStats, setBattleAiDebugStats] = useState<BattleAiDebugStats>(EMPTY_BATTLE_AI_DEBUG_STATS)

  const refreshMapsCatalog = useCallback(async (preferSelectRef?: string) => {
    try {
      const res = await fetch('/api/maps')
      if (!res.ok) return
      const data = (await res.json()) as {
        maps: MapCatalogItem[]
        defaultMapId: string | null
      }
      setAvailableMaps(data.maps)
      if (preferSelectRef && data.maps.some((map) => map.ref === preferSelectRef)) {
        setCurrentMapRef(preferSelectRef)
      }
    } catch (error) {
      console.warn('refresh maps catalog failed:', error)
    }
  }, [setCurrentMapRef])

  const reloadCurrentMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/airpg-map?map=${encodeURIComponent(currentMapRef)}`)
      if (!res.ok) return
      const data = (await res.json()) as AirpgMapPayload
      loadedMapPayloadRef.current = data
      setMapInfo({
        width: data.width,
        height: data.height,
        ground: data.ground,
        collision: data.collision,
        mapId: data.mapId,
        tileset: data.tileset,
      })
      setMapBgUrl(typeof data.backgroundImageUrl === 'string' && data.backgroundImageUrl.length > 0 ? data.backgroundImageUrl : null)
    } catch (e) {
      console.warn('reload current map failed:', e)
    }
  }, [currentMapRef])

  useEffect(() => {
    if (!showBattle) {
      clearTransientFx()
      resetCombatFx()
      projectileTargetByCommandRef.current = {}
      commandMetaByIdRef.current = {}
    }
  }, [clearTransientFx, resetCombatFx, showBattle])

  useEffect(() => {
    void refreshMapsCatalog()
  }, [accountLabel, refreshMapsCatalog])

  useEffect(() => {
    let active = true
    const loadMap = async () => {
      try {
        const res = await fetch(`/api/airpg-map?map=${encodeURIComponent(currentMapRef)}`)
        if (!res.ok) return
        const data = (await res.json()) as AirpgMapPayload
        if (!active) return
        loadedMapPayloadRef.current = data
        setMapInfo({
          width: data.width,
          height: data.height,
          ground: data.ground,
          collision: data.collision,
          mapId: data.mapId,
          tileset: data.tileset,
        })
        setMapBgUrl(typeof data.backgroundImageUrl === 'string' && data.backgroundImageUrl.length > 0 ? data.backgroundImageUrl : null)
        if (data.playerVisualId) {
          setPlayerVisualId(data.playerVisualId)
        }
        const resolvedPosition = resolveInitialMapPosition({
          selectedRef: currentMapRef,
          savedRef: playerPositionMapRefRef.current,
          savedPosition: savedPlayerPosRef.current,
          spawn: data.playerSpawn,
          width: data.width,
          height: data.height,
          isWalkable: (x, y) => isDemoDungeonCellWalkable({
            x,
            y,
            mapW: data.width,
            mapH: data.height,
            collision: data.collision,
            ground: data.ground,
            tilesetId: data.tileset?.id ?? null,
          }),
        })
        setResolvedMapPosition(currentMapRef, resolvedPosition)
        const defeated = new Set(vs01ProgressRef.current.defeatedEnemyIds)
        const activeEnemies = data.enemies.filter((enemy) => !enemy.templateId || !defeated.has(enemy.templateId))
        const isVs01Map = currentMapRef === 'builtin:emberwatch-causeway'
          || currentMapRef === 'builtin:ashen-relay-core'
        setEnemies(
          isVs01Map
            ? activeEnemies
            : ensureDeepClawAgentEnemy(activeEnemies, {
              width: data.width,
              height: data.height,
              collision: data.collision,
              ground: data.ground,
              tilesetId: data.tileset?.id ?? null,
            }),
        )
      } catch (error) {
        console.warn('load airpg map failed:', error)
      }
    }
    loadMap()
    return () => {
      active = false
    }
  }, [accountLabel, currentMapRef, setEnemies, setResolvedMapPosition])

  useEffect(() => {
    const id = window.setInterval(() => setWalkAnimTick((t) => t + 1), 130)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const ids = new Set<string>()
    if (typeof playerVisualId === 'string' && playerVisualId.startsWith('pixellab:')) {
      ids.add(playerVisualId)
    }
    for (const e of enemies) {
      const v = e.visualId
      if (typeof v === 'string' && v.startsWith('pixellab:')) ids.add(v)
    }
    if (ids.size === 0) {
      setPixelLabPacks({})
      return
    }
    let cancelled = false
    void (async () => {
      const next: Record<string, PixelLabPackMeta | null> = {}
      await Promise.all(
        [...ids].map(async (visualId) => {
          const packId = visualId.slice('pixellab:'.length)
          if (!packId) {
            next[visualId] = null
            return
          }
          const url = `/assets/characters/packs/${encodeURIComponent(packId)}/meta.json`
          try {
            const res = await fetch(url)
            if (!res.ok) throw new Error(String(res.status))
            next[visualId] = (await res.json()) as PixelLabPackMeta
          } catch {
            next[visualId] = null
          }
        }),
      )
      if (!cancelled) setPixelLabPacks(next)
    })()
    return () => {
      cancelled = true
    }
  }, [enemies, playerVisualId])

  useEffect(() => {
    const now = Date.now()
    setEnemyLastMoveAt((prev) => {
      const next = { ...prev }
      let changed = false
      for (const e of enemies) {
        const p = enemyPositions[e.id] ?? { x: e.x, y: e.y }
        const prevP = prevEnemyGridRef.current[e.id]
        prevEnemyGridRef.current[e.id] = { ...p }
        if (prevP && (prevP.x !== p.x || prevP.y !== p.y)) {
          next[e.id] = now
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [enemyPositions, enemies])

  useEffect(() => {
    const p = playerPos
    const prev = prevPlayerGridRef.current
    prevPlayerGridRef.current = { ...p }
    if (prev && (prev.x !== p.x || prev.y !== p.y)) {
      setPlayerLastMoveAt(Date.now())
    }
  }, [playerPos])

  useEffect(() => {
    const viewport = mapViewportRef.current
    if (!viewport) return
    const update = () => {
      const rect = viewport.getBoundingClientRect()
      setViewportSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const imagePath = mapInfo.tileset?.publicImagePath
    if (!imagePath) {
      setTilesetImage(null)
      setTilesetReady(false)
      return
    }
    const img = new window.Image()
    img.src = imagePath
    img.onload = () => {
      setTilesetImage(img)
      setTilesetReady(true)
    }
    img.onerror = () => {
      setTilesetImage(null)
      setTilesetReady(false)
    }
  }, [mapInfo.tileset?.publicImagePath])

  useEffect(() => {
    if (!mapBgUrl) {
      setMapBgImage(null)
      return
    }
    const img = new window.Image()
    img.src = mapBgUrl
    img.onload = () => setMapBgImage(img)
    img.onerror = () => setMapBgImage(null)
  }, [mapBgUrl])

  useEffect(() => {
    const canvas = mapCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = Math.max(1, viewportSize.width)
    const height = Math.max(1, viewportSize.height)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#0b1220'
    ctx.fillRect(0, 0, width, height)

    // Background image overlay (generated maps). Draw before tiles/grid.
    if (mapBgImage) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(mapBgImage, renderOffsetX, renderOffsetY, renderWidth, renderHeight)
    }

    const cellW = renderWidth / mapInfo.width
    const cellH = renderHeight / mapInfo.height
    const tileset = mapInfo.tileset
    const useSprite = !!(tileset && tilesetImage && tilesetReady)
    const hasBg = !!mapBgImage

    for (let y = 0; y < mapInfo.height; y++) {
      for (let x = 0; x < mapInfo.width; x++) {
        const idx = y * mapInfo.width + x
        const tileId = mapInfo.ground[idx] ?? 0
        const blocked = !isDemoDungeonCellWalkable({
          x,
          y,
          mapW: mapInfo.width,
          mapH: mapInfo.height,
          collision: mapInfo.collision,
          ground: mapInfo.ground,
          tilesetId: mapInfo.tileset?.id ?? null,
        })
        const dx = renderOffsetX + x * cellW
        const dy = renderOffsetY + y * cellH
        // When a generated background image is present, we avoid painting the fallback "ground color layer"
        // to prevent the "overlay mask" look. We only draw a tileset layer if one exists.
        if (useSprite && tileId > 0 && tileset && tileId <= tileset.tileCount) {
          const tile = tileId - 1
          const sx = (tile % tileset.columns) * tileset.tileWidth
          const sy = Math.floor(tile / tileset.columns) * tileset.tileHeight
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(tilesetImage!, sx, sy, tileset.tileWidth, tileset.tileHeight, dx, dy, cellW, cellH)
        } else if (!hasBg) {
          if (tileId >= 40) ctx.fillStyle = 'rgba(71, 85, 105, 0.85)'
          else if (tileId >= 9) ctx.fillStyle = 'rgba(6, 95, 70, 0.85)'
          else ctx.fillStyle = 'rgba(20, 83, 45, 0.85)'
          ctx.fillRect(dx, dy, cellW, cellH)
        }

        // Grid lines:
        // - no background: show faint grid always (and red for blocked)
        // - has background: hide grid by default (to avoid "debug red squares" look)
        if (!hasBg) {
          ctx.strokeStyle = blocked ? 'rgba(239, 68, 68, 0.35)' : 'rgba(0, 0, 0, 0.18)'
          ctx.lineWidth = 1
          ctx.strokeRect(dx, dy, cellW, cellH)
        }
      }
    }
  }, [
    mapInfo,
    mapBgImage,
    renderHeight,
    renderOffsetX,
    renderOffsetY,
    renderWidth,
    tilesetImage,
    tilesetReady,
    viewportSize.height,
    viewportSize.width,
  ])

  useEnemyPatrol({
    enemies,
    showBattle,
    isPVPMode,
    combatEnemyId,
    isWalkable,
    setEnemyPositions,
    setEnemyFacings,
    enemyTargetsRef,
  })

  // battle-core tick: only updates grid coordinates of both battling sides on map (no Phaser, no full-screen overlay)
  // Must use combatEnemyId instead of nearbyEnemy: after pulling, distance between both sides will exceed INTERACTION_RANGE,
  // nearbyEnemy will be set to null, if this effect depends on it, it will cleanup and stop scheduleTick, causing battle to freeze.
  useEffect(() => {
    if (!showBattle || !battleGridAnchor || combatEnemyId == null || !mounted) {
      mapBattleControllerRef.current = null
      return
    }
    // Reset end flag to ensure new battle's runTick can progress normally
    mapBattleEndedRef.current = false

    const battleEnemy = enemies.find((e) => e.id === combatEnemyId)
    if (!battleEnemy) {
      mapBattleControllerRef.current = null
      return
    }

    mapBattleEndedRef.current = false
    autoFleePendingRef.current = false
    autoFleeConsumedMapRef.current = false

    /** Battle movement of both sides is still handled by battle-core; here only treats "not participating" wild monster tiles as obstacles outside the terrain to avoid clipping through monsters */
    const isWalkableForBattle = (gx: number, gy: number) => {
      // PVP battle demo: no obstacle detection, allows direct battle in the center of the map.
      if (isPVPMode) return true
      if (
        !isDemoDungeonCellWalkable({
          x: gx,
          y: gy,
          mapW: mapInfo.width,
          mapH: mapInfo.height,
          collision: mapInfo.collision,
          ground: mapInfo.ground,
          tilesetId: mapInfo.tileset?.id ?? null,
        })
      ) {
        return false
      }
      for (const er of enemiesRef.current) {
        if (er.id === combatEnemyId) continue
        const p = enemyPositionsRef.current[er.id] ?? { x: er.x, y: er.y }
        if (Math.round(p.x) === gx && Math.round(p.y) === gy) return false
      }
      return true
    }

    const battleDecisionMode: 'manual' | 'dual_llm' =
      process.env.NEXT_PUBLIC_BATTLE_DECISION_MODE === 'dual_llm' ? 'dual_llm' : 'manual'
    const llmProvider: 'deepseek' | 'zhipu' | 'minimax' | 'custom' =
      process.env.NEXT_PUBLIC_BATTLE_LLM_PROVIDER === 'zhipu'
        ? 'zhipu'
        : process.env.NEXT_PUBLIC_BATTLE_LLM_PROVIDER === 'minimax'
          ? 'minimax'
          : 'deepseek'
    const aiProxyUrl = process.env.NEXT_PUBLIC_BATTLE_AI_SERVER_URL || 'http://localhost:8787'
    const centerGrid = {
      x: Math.max(1, Math.min(mapInfo.width - 2, Math.floor(mapInfo.width / 2))),
      y: Math.max(1, Math.min(mapInfo.height - 2, Math.floor(mapInfo.height / 2))),
    }
    const pvpPlayerGrid = { x: Math.max(0, centerGrid.x - 1), y: centerGrid.y }
    const pvpEnemyGrid = { x: Math.min(mapInfo.width - 1, centerGrid.x + 1), y: centerGrid.y }
    const initialPlayerGrid = isPVPMode ? pvpPlayerGrid : { ...battleGridAnchor.player }
    const initialEnemyGrid = isPVPMode ? pvpEnemyGrid : { ...battleGridAnchor.enemy }

    const cfg = {
      mapWidth: mapInfo.width,
      mapHeight: mapInfo.height,
      battleTickMs: BASE_BATTLE_TICK_MS,
      isWalkable: isWalkableForBattle,
      playerName: `Relay Warden Lv.${playerLevel}`,
      playerGrid: initialPlayerGrid,
      playerStats: totalStats,
      playerHp: playerHP,
      playerMp: playerMP,
      playerMaxMp: playerMaxMp,
      playerSkillIds: getAvailableSkills().filter((s) => s.action === 'cast_skill' && !!s.coreSkillId).map((s) => s.coreSkillId!),
      enemyName: battleEnemy.name,
      enemyId: `enemy-${battleEnemy.id}`,
      enemyGrid: initialEnemyGrid,
      enemyStats: enemyCombatStats,
      enemySkillIds: isPVPMode
        ? pvpOpponentCarriedSkillIds
          .map((id) => getSkillById(id)?.coreSkillId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
        : battleEnemy.skillIds,
      battleDecisionMode,
      llmConfig:
        battleDecisionMode === 'dual_llm'
          ? {
            provider:
              llmProvider,
            model: process.env.NEXT_PUBLIC_BATTLE_LLM_MODEL,
            proxyUrl: aiProxyUrl,
            timeoutMs: Number(process.env.NEXT_PUBLIC_BATTLE_LLM_TIMEOUT_MS || 60000),
          }
          : undefined,
    }
    const ctrl = new MapBattleController(cfg)
    mapBattleControllerRef.current = ctrl
    if (isPVPMode) {
      setPlayerPos({ ...initialPlayerGrid })
      setEnemyPositions((prev) => ({ ...prev, [battleEnemy.id]: { ...initialEnemyGrid } }))
    }
    setBattlePlayerMaxHp(ctrl.session.left.resources.maxHp)
    setBattleTimeSec(0)
    setLastBattleTickCount(0)
    setBattleAiDebugStats(EMPTY_BATTLE_AI_DEBUG_STATS)
    clearTransientFx()
    setBattleLog((prev) => [...prev, 'Preparation phase started'])

    battleTimerRef.current = null
    cdTimerRef.current = null
    tickTimeoutRef.current = null

    const clearTimers = () => {
      if (battleTimerRef.current !== null) window.clearInterval(battleTimerRef.current)
      if (cdTimerRef.current !== null) window.clearInterval(cdTimerRef.current)
      if (tickTimeoutRef.current !== null) window.clearTimeout(tickTimeoutRef.current)
      battleTimerRef.current = null
      cdTimerRef.current = null
      tickTimeoutRef.current = null
    }

    battleTimerRef.current = window.setInterval(() => setBattleTimeSec((s) => s + 1), 1000)
    cdTimerRef.current = window.setInterval(() => setCdUiTick((n) => n + 1), 150)

    const scheduleTick = () => {
      if (tickTimeoutRef.current !== null) window.clearTimeout(tickTimeoutRef.current)
      tickTimeoutRef.current = window.setTimeout(runTick, BASE_BATTLE_TICK_MS / battleSpeedRef.current)
    }

    const runTick = () => {
      const c = mapBattleControllerRef.current
      if (!c || mapBattleEndedRef.current) return
      const prevPhase = c.session.phase
      const prevPlayerPos = { ...c.session.left.position }
      const prevEnemyPos = { ...c.session.right.position }

      const preparedStep = prepareMapBattleStep({
        controller: c,
        isPVPMode,
        manualFleeRequestedRef,
        autoFleePendingRef,
        autoFleeConsumedMapRef,
        nextAttackSkillId: nextAttackSkillRef.current,
        setNextAttackSkillId,
        setSkillCooldownEndAt,
        setBattleLog,
        mapWidth: mapInfo.width,
        mapHeight: mapInfo.height,
        isWalkableForBattle,
      })
      const step = preparedStep.step
      const s = preparedStep.session
      if (prevPhase === 'preparation' && s.phase === 'battle') {
        setBattleLog((prev) => [...prev, 'Preparation phase ended'])
      }
      const evStart = Math.max(0, s.events.length - step.newEventCount)
      const aiStatsDelta = {
        totalCommands: 0,
        llmCommands: 0,
        macroOrSeqCommands: 0,
        llmSeqCommands: 0,
        fallbackCommands: 0,
        totalRejects: 0,
        dashBlockedRejects: 0,
      }
      for (let i = evStart; i < s.events.length; i++) {
        const ev = s.events[i]
        if (ev.type === 'command_received') {
          aiStatsDelta.totalCommands += 1
          const meta =
            ev.payload && typeof ev.payload.metadata === 'object' && ev.payload.metadata !== null
              ? (ev.payload.metadata as Record<string, unknown>)
              : {}
          const { pipeline, macroOrSeq, isLlmSeq } = classifyBattleCommandMetadata(meta)
          if (pipeline) {
            aiStatsDelta.llmCommands += 1
            if (macroOrSeq) aiStatsDelta.macroOrSeqCommands += 1
            if (isLlmSeq) aiStatsDelta.llmSeqCommands += 1
          } else {
            aiStatsDelta.fallbackCommands += 1
          }
        } else if (ev.type === 'command_rejected') {
          aiStatsDelta.totalRejects += 1
          const reason = typeof ev.payload?.reason === 'string' ? ev.payload.reason : ''
          if (reason === 'dash_blocked') {
            aiStatsDelta.dashBlockedRejects += 1
          }
        }
      }
      if (
        aiStatsDelta.totalCommands > 0 ||
        aiStatsDelta.totalRejects > 0
      ) {
        setBattleAiDebugStats((prev) => ({
          totalCommands: prev.totalCommands + aiStatsDelta.totalCommands,
          llmCommands: prev.llmCommands + aiStatsDelta.llmCommands,
          macroOrSeqCommands: prev.macroOrSeqCommands + aiStatsDelta.macroOrSeqCommands,
          llmSeqCommands: prev.llmSeqCommands + aiStatsDelta.llmSeqCommands,
          fallbackCommands: prev.fallbackCommands + aiStatsDelta.fallbackCommands,
          totalRejects: prev.totalRejects + aiStatsDelta.totalRejects,
          dashBlockedRejects: prev.dashBlockedRejects + aiStatsDelta.dashBlockedRejects,
        }))
      }

      applyMapBattleStepState({
        session: s,
        combatEnemyId,
        prevPlayerPos,
        prevEnemyPos,
        setPlayerHP,
        setPlayerMP,
        setEnemyHP,
        setEnemyMaxHp,
        setBattlePlayerMaxHp,
        setPlayerPos,
        setPlayerFacing,
        setEnemyFacings,
        setEnemyPositions,
        setIsDefending,
        pushMoveFx,
      })
      const roleByEntityId = (entityId: string): 'player' | 'enemy' | null => {
        if (entityId === s.left.id) return 'player'
        if (entityId === s.right.id) return 'enemy'
        return null
      }
      const posByEntityId = (entityId: string): { x: number; y: number } | null => {
        if (entityId === s.left.id) return s.left.position
        if (entityId === s.right.id) return s.right.position
        return null
      }

      processMapBattleEvents({
        session: s,
        evStart,
        combatEnemyId,
        commandMetaStoreRef: commandMetaByIdRef,
        projectileTargetStoreRef: projectileTargetByCommandRef,
        roleByEntityId,
        posByEntityId,
        triggerCombatFx,
        setPlayerFacing,
        setEnemyFacings,
        resolveSkillFxProfile,
        pushProjectileFx,
        setBattleLog,
        getAvailableSkills,
        setNextAttackSkillId,
        setSkillCooldownEndAt,
        pushFloatText,
        pushImpactFx,
      })

      const ended = finalizeMapBattleTick({
        ui: step.uiOutcome,
        session: s,
        combatEnemyId,
        scheduleTick,
        mapBattleEndedRef,
        clearTimers,
        mapBattleControllerRef,
        setLastBattleTickCount,
        mapWidth: mapInfo.width,
        mapHeight: mapInfo.height,
        isWalkable,
        pendingRespawnEnemyIdRef,
        completeMapBattleVictory: (closingLog) => {
          completeMapBattleVictory(closingLog)
          const defeatedEnemy = enemiesRef.current.find((enemy) => enemy.id === combatEnemyId)
          if (!defeatedEnemy?.templateId) return
          setVs01Progress((previous) => {
            const next = recordVs01Victory(previous, defeatedEnemy.templateId!)
            try {
              window.localStorage.setItem(VS01_PROGRESS_STORAGE_KEY, JSON.stringify(next))
            } catch {
              // Runtime progression remains usable for this session if storage is unavailable.
            }
            return next
          })
        },
        completeMapBattleDefeat,
        finalizeMapBattleFleeSuccess,
        setPlayerFacing,
        setPlayerPos,
        setEnemyPositions,
        processAutomationAfterBattle,
        setBattleLog,
        cancelAutomation,
      })
      if (!ended) return
    }

    scheduleTick()

    return () => {
      clearTimers()
      mapBattleControllerRef.current = null
      setBattlePlayerMaxHp(0)
    }
    // Session identified by battleSessionNonce / combatEnemyId; only depends on battle start moment and map dimensions.
    // Do not add HP/coordinate/playerPos, otherwise will rebuild controller every tick causing battle to freeze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showBattle,
    battleSessionNonce,
    mounted,
    battleGridAnchor,
    combatEnemyId,
    isPVPMode,
    mapInfo.width,
    mapInfo.height,
    mapInfo.collision,
    mapInfo.ground,
    mapInfo.tileset?.id,
  ])

  useMapKeyboardMovement({
    showBattle,
    playerPos,
    isWalkable: (x, y) => isWalkable(x, y),
    setPlayerFacing,
    setPlayerPos,
  })

  useNearbyEnemyDetection({
    showBattle,
    enemies,
    enemyPositions,
    playerPos,
    interactionRange: INTERACTION_RANGE,
    setNearbyEnemy,
    setShowInteraction,
  })

  useAutoBattleStart({
    automationTask,
    showBattle,
    nearbyEnemy,
    enemyPositions,
    playerPos,
    startBattle,
  })

  /** After defeat, keep same id, change name/stats/spawn point, equivalent to wild monster refresh */
  const respawnDefeatedEnemy = useCallback(
    (defeatedId: number) => {
      const enc = createEnemyEncounter(playerLevel)
      const avoid: { x: number; y: number }[] = [{ x: playerPos.x, y: playerPos.y }]
      enemies.forEach((e) => {
        if (e.id === defeatedId) return
        const p = enemyPositions[e.id] || { x: e.x, y: e.y }
        avoid.push({ x: p.x, y: p.y })
      })
      let spawn: { x: number; y: number } | null = null
      for (let attempt = 0; attempt < 120; attempt++) {
        const x = Math.floor(Math.random() * mapInfo.width)
        const y = Math.floor(Math.random() * mapInfo.height)
        if (!isWalkable(x, y)) continue
        const farEnough = avoid.every((p) => Math.hypot(p.x - x, p.y - y) >= 2.5)
        if (!farEnough) continue
        spawn = { x, y }
        break
      }
      if (!spawn) {
        const ox = Math.max(0, Math.min(mapInfo.width - 1, playerPos.x + 4))
        const oy = Math.max(0, Math.min(mapInfo.height - 1, playerPos.y))
        spawn = isWalkable(ox, oy) ? { x: ox, y: oy } : { x: playerPos.x, y: Math.max(0, playerPos.y - 1) }
      }
      const sx = spawn.x
      const sy = spawn.y
      setEnemies((prev) =>
        prev.map((e) => {
          if (e.id !== defeatedId) return e
          const nextEnemy: Enemy = {
            id: defeatedId,
            name: e.name,
            x: sx,
            y: sy,
            level: enc.level,
            profile: {
              maxHp: enc.stats.maxHp,
              atk: enc.stats.atk,
              def: enc.stats.def,
              spd: enc.stats.spd,
            },
            enemyType: e.enemyType,
            agentId: e.agentId,
            visualId: e.enemyType === 'agent' ? e.visualId : e.visualId === 'archerGreen' ? 'warriorBlue' : e.visualId,
            mapSpriteTileIndex: e.mapSpriteTileIndex,
          }
          return nextEnemy
        }),
      )
      setEnemyPositions((prev) => ({ ...prev, [defeatedId]: { x: sx, y: sy } }))
      setEnemyHP(enc.stats.maxHp)
      setEnemyMaxHp(enc.stats.maxHp)
      setEnemyLevel(enc.level)
      setEnemyCombatStats(enc.stats)
    },
    [enemies, enemyPositions, isWalkable, mapInfo.height, mapInfo.width, playerLevel, playerPos, setEnemies, setEnemyCombatStats, setEnemyHP, setEnemyLevel, setEnemyMaxHp],
  )

  const finishBattleAndClose = useCallback(() => {
    // Converge to integer grid before returning to map to ensure pathfinding/collision continues to work with grid semantics.
    setPlayerPos((prev) => snapToGrid(prev))
    setEnemyPositions((prev) => {
      const next: Record<number, { x: number; y: number }> = {}
      Object.entries(prev).forEach(([id, pos]) => {
        next[Number(id)] = snapToGrid(pos)
      })
      return next
    })
    const id = pendingRespawnEnemyIdRef.current
    if (id !== null) {
      const defeatedEnemy = enemiesRef.current.find((enemy) => enemy.id === id)
      if (battleResult === 'win' && defeatedEnemy?.templateId) {
        setEnemies((previous) => previous.filter((enemy) => enemy.id !== id))
        setEnemyPositions((previous) => {
          const next = { ...previous }
          delete next[id]
          return next
        })
      } else {
        respawnDefeatedEnemy(id)
      }
      pendingRespawnEnemyIdRef.current = null
    }
    closeBattle()
  }, [battleResult, closeBattle, respawnDefeatedEnemy, setEnemies, setEnemyPositions, setPlayerPos])

  /** Automation: auto-click Continue when settlement page appears */
  const prevIsGameOverRef = useRef(false)
  useEffect(() => {
    if (isGameOver && automationTask && !prevIsGameOverRef.current) {
      finishBattleAndClose()
    }
    prevIsGameOverRef.current = isGameOver
  }, [isGameOver, automationTask, finishBattleAndClose])

  const queueSkill = useCallback(
    (skill: Skill) => {
      if (isGameOver) return
      if (skillCooldownRemaining(skillCooldownEndAt, skill.id) > 0) return
      setNextAttackSkillId((prev) => {
        if (prev === skill.id) return prev
        setBattleLog((logPrev) => [...logPrev, `Ready: next action will use "${skill.name}"`])
        return skill.id
      })
    },
    [isGameOver, skillCooldownEndAt, setNextAttackSkillId, setBattleLog],
  )

  const handleMapClick = useMapClickMove({
    showBattle,
    renderOffsetX,
    renderOffsetY,
    renderWidth,
    renderHeight,
    mapWidth: mapInfo.width,
    mapHeight: mapInfo.height,
    playerPos,
    isWalkable,
    setPlayerFacing,
    setPlayerPos,
  })
  const { handleEnemyMarkerClick, handleEnemyMarkerKeyDown } = useEnemyInfoInteraction({
    showBattle,
    setNearbyEnemy,
    setShowEnemyInfo,
  })

  const {
    enemyLevelRangeMin,
    enemyLevelRangeMax,
    playerHpMaxForUi,
    playerHpRatioForUi,
    enemyHpMaxForUi,
    enemyHpRatioForUi,
  } = useMapUiMetrics({
    playerLevel,
    showBattle,
    battlePlayerMaxHp,
    totalPlayerMaxHp: totalStats.maxHp,
    playerHP,
    enemyMaxHp,
    enemyHP,
  })

  const handlePixellabSync = usePixellabSync({
    selectedMapId: currentMapRef,
    mapInfo: {
      width: mapInfo.width,
      height: mapInfo.height,
      collision: mapInfo.collision,
      ground: mapInfo.ground,
      tilesetId: mapInfo.tileset?.id ?? null,
    },
    setPixellabSyncHint,
    setPlayerVisualId,
    setEnemies,
  })

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <MapBattleViewport
        mapViewportRef={mapViewportRef}
        mapCanvasRef={mapCanvasRef}
        onMapClick={handleMapClick}
        enemies={enemies}
        showBattle={showBattle}
        isPVPMode={isPVPMode}
        combatEnemyId={combatEnemyId}
        mounted={mounted}
        enemyPositions={enemyPositions}
        gridToScreen={gridToScreen}
        handleEnemyMarkerClick={handleEnemyMarkerClick}
        handleEnemyMarkerKeyDown={handleEnemyMarkerKeyDown}
        enemyHpRatioForUi={enemyHpRatioForUi}
        enemyLevelRangeMin={enemyLevelRangeMin}
        enemyLevelRangeMax={enemyLevelRangeMax}
        enemyFacings={enemyFacings}
        pixelLabPacks={pixelLabPacks}
        enemyCombatFx={enemyCombatFx}
        enemyTargetsRef={enemyTargetsRef}
        mapCellDisplayPx={mapCellDisplayPx}
        walkAnimTick={walkAnimTick}
        actorPx={actorPx}
        mapBattleControllerRef={mapBattleControllerRef}
        playerPos={playerPos}
        playerHpRatioForUi={playerHpRatioForUi}
        playerCombatFx={playerCombatFx}
        playerLastMoveAt={playerLastMoveAt}
        playerVisualId={playerVisualId}
        playerFacing={playerFacing}
        projectileFx={projectileFx}
        impactFx={impactFx}
        moveFx={moveFx}
        floatTexts={floatTexts}
      />

      {fleeSuccessMessage && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border-2 border-emerald-400/80 bg-emerald-950/95 px-6 py-4 text-center shadow-xl backdrop-blur-sm">
            <div className="text-lg font-bold text-emerald-200">{fleeSuccessMessage}</div>
            <button
              type="button"
              onClick={() => dismissFleeSuccessMessage()}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Top-left player info */}
      <div
        className="absolute left-2 top-2 z-20 w-[calc(50%-0.75rem)] min-w-0 rounded-xl border-2 border-fuchsia-300/70 bg-gradient-to-br from-pink-100/95 via-violet-100/90 to-sky-100/95 p-2 shadow-[0_10px_24px_-8px_rgba(91,33,182,0.45)] sm:left-4 sm:top-4 sm:w-auto sm:min-w-48 sm:p-4"
        data-testid="player-status"
      >
        <div className="mb-1 flex items-start gap-1 sm:mb-3 sm:gap-3">
          <div
            onClick={() => setShowCharacter(true)}
            className="cursor-pointer transition-opacity hover:opacity-80"
          >
            <Image
              src="/player/idle/south.png"
              alt="Player"
              width={48}
              height={48}
              className="h-10 w-10 rounded-lg border border-cyan-300 bg-gradient-to-b from-cyan-50 to-indigo-100 object-contain pixelated sm:h-12 sm:w-12"
            />
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => game.setShowJobSelect(true)}
              className="font-arcade text-[11px] text-slate-700 hover:text-fuchsia-600 transition-colors cursor-pointer"
              title="Click to change class"
            >
              {JOB_DISPLAY_NAMES[game.jobClassId] ?? 'Warrior'}
            </button>
            <div
              onClick={() => setShowCharacter(true)}
              className="text-sm font-bold text-fuchsia-600 cursor-pointer hover:brightness-110"
            >
              Lv.{playerLevel}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openStudioImportMenu()
            }}
            className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-violet-300/80 bg-white/90 px-2 py-1.5 text-violet-700 shadow-sm transition-colors hover:border-violet-400 hover:bg-violet-50"
            title="Import skills, stats, and config from Studio"
          >
            <Download size={14} strokeWidth={2.4} />
            <span className="font-arcade text-[9px] font-bold leading-none">Import</span>
          </button>
        </div>
        <div className="space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-emerald-700">
              <span className="font-arcade text-[10px]">HP</span>
              <span>{playerHP}/{playerHpMaxForUi}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-emerald-300 bg-emerald-100">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-lime-400 transition-all duration-300"
                style={{ width: `${playerHpRatioForUi}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-sky-700">
              <span className="font-arcade text-[10px]">MP</span>
              <span>{playerMP}/{playerMaxMp}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-sky-300 bg-sky-100">
              <div
                className="h-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-300"
                style={{ width: `${(playerMP / Math.max(1, playerMaxMp)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute right-2 top-2 z-20 w-[calc(50%-0.75rem)] truncate whitespace-nowrap rounded-lg border border-sky-500/40 bg-black/60 px-2 py-2 text-xs text-sky-100 sm:right-4 sm:top-4 sm:w-auto sm:px-3"
        data-testid="map-status"
      >
        Map: {getMapDisplayName(mapInfo.mapId)} · {mapInfo.width}x{mapInfo.height} (grid) {tilesetReady ? ' · Sprites' : ' · Fallback render'}
      </div>
      <div
        className="absolute left-1/2 top-60 z-20 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 border border-teal-400/45 bg-[#071312]/90 px-3 py-2 text-center text-xs text-teal-50 shadow-[0_8px_24px_rgba(0,0,0,0.28)] sm:top-4"
        data-testid="vs01-objective"
      >
        <span className="font-semibold text-teal-300">Ember Relay</span>
        <span className="mx-2 text-teal-700">|</span>
        {getVs01Objective(vs01Progress)}
      </div>
      <div
        className="absolute right-2 top-12 z-20 w-[calc(50%-0.75rem)] rounded-lg border border-sky-500/40 bg-black/60 px-2 py-2 text-xs text-sky-100 sm:right-4 sm:top-16 sm:w-auto sm:px-3"
        data-testid="map-selector"
      >
        <label className="mr-2 hidden sm:inline">Map</label>
        <select
          aria-label="Select map"
          className="block w-full min-w-0 rounded bg-slate-900 px-2 py-1 text-xs text-slate-100 sm:inline-block sm:w-auto"
          value={currentMapRef}
          onChange={(e) => setCurrentMapRef(e.target.value)}
        >
          {orderedAvailableMaps.map((map) => (
            <option
              key={map.ref}
              value={map.ref}
              disabled={map.ref === 'builtin:ashen-relay-core' && !vs01CoreUnlocked}
            >
              {map.name}{map.ref === 'builtin:ashen-relay-core' && !vs01CoreUnlocked ? ' (Locked)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div
        className="absolute right-2 top-24 z-20 flex w-[calc(50%-0.75rem)] flex-col items-stretch gap-1 rounded-lg border border-amber-500/35 bg-black/60 px-2 py-1.5 text-xs text-amber-100 sm:right-4 sm:top-[7.25rem] sm:w-auto sm:max-w-[min(280px,calc(100vw-2rem))] sm:items-end sm:px-3 sm:py-2"
        data-testid="map-tools"
      >
        <LocalModeNotice />
        <button
          type="button"
          onClick={() => void handlePixellabSync()}
          className="rounded bg-amber-700/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
        >
          Sync PixelLab Resource
        </button>
        <button
          type="button"
          onClick={() => setShowPixellabMapGen(true)}
          className="rounded bg-sky-700/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-600"
        >
          Generate PixelLab Map
        </button>
        <button
          type="button"
          onClick={() => setShowCollisionEditor(true)}
          className="rounded bg-emerald-700/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
        >
          Edit Collision
        </button>
        {pixellabSyncHint && <span className="text-[10px] leading-snug text-amber-200/90">{pixellabSyncHint}</span>}

      </div>

      {game.showJobSelect && (
        <JobSelectModal
          game={game}
          onClose={() => game.setShowJobSelect(false)}
        />
      )}

      <PixellabMapGeneratorModal
        open={showPixellabMapGen}
        onClose={() => setShowPixellabMapGen(false)}
        onCreatedMap={(mapId) => {
          void refreshMapsCatalog(mapId)
          setShowPixellabMapGen(false)
        }}
      />

      <CollisionEditorModal
        open={showCollisionEditor}
        mapId={currentMapRef}
        width={mapInfo.width}
        height={mapInfo.height}
        collision={mapInfo.collision}
        onClose={() => setShowCollisionEditor(false)}
        onSaved={() => void reloadCurrentMap()}
      />

      {/* Bottom-right Dock: dark rounded square, active is orange+green border; hover shows left bubble label
          z-index higher than Chat sidebar, ensures can still switch when sidebar is open */}
      <div className="pointer-events-auto absolute bottom-6 right-4 z-[60] flex flex-col items-center gap-2">
        {dockItems.map(({ id, label, Icon }) => {
          const active = dockPanel === id
          return (
            <div key={id} className="oc-dock-btn-wrap relative">
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => {
                  if (id === 'chat' && !active) setChatMode({ kind: 'system' })
                  setDockPanel(active ? null : id)
                }}
                className={`oc-dock-btn ${active ? 'oc-dock-btn-active' : ''}`}
              >
                <Icon size={18} strokeWidth={2.2} />
              </button>
              <span className="oc-dock-tooltip">{label}</span>
            </div>
          )
        })}
      </div>

      {dockPanel && (
        <DockFeatureModal game={game} />
      )}

      <MapBattleHud
        showBattle={showBattle}
        isGameOver={isGameOver}
        isPVPMode={isPVPMode}
        playerMP={playerMP}
        playerMaxMp={playerMaxMp}
        battleSpeed={battleSpeed}
        setBattleSpeed={setBattleSpeed}
        battleTimeSec={battleTimeSec}
        lastBattleTickCount={lastBattleTickCount}
        manualFleeRequestedRef={manualFleeRequestedRef}
        lastManualFleeRequestAtRef={lastManualFleeRequestAtRef}
        manualFleeDebounceMs={MANUAL_FLEE_DEBOUNCE_MS}
        mapBattleControllerRef={mapBattleControllerRef}
        getAvailableSkills={getAvailableSkills}
        skillCooldownRemaining={skillCooldownRemaining}
        skillCooldownEndAt={skillCooldownEndAt}
        nextAttackSkillId={nextAttackSkillId}
        queueSkill={queueSkill}
        hoveredSkill={hoveredSkill}
        setHoveredSkill={setHoveredSkill}
        battleLog={battleLog}
        battleResult={battleResult}
        nearbyEnemyName={nearbyEnemy?.name ?? 'Enemy'}
        gainedExp={gainedExp}
        gainedGold={game.gainedGold}
        battleLootDrop={battleLootDrop}
        battleAiDebugStats={battleAiDebugStats}
        battleEvents={mapBattleControllerRef.current?.session?.events ?? []}
        decisionMode={mapBattleControllerRef.current?.getDecisionMode?.()}
        llmRuntime={mapBattleControllerRef.current?.getLlmRuntimeStatus?.()}
        onContinue={finishBattleAndClose}
      />

      {/* Interaction buttons (hidden during battle, operated by bottom skill bar) */}
      <InteractionButtons
        open={!!(showInteraction && nearbyEnemy && !showBattle)}
        onChallenge={() => {
          if (!nearbyEnemy) return
          const ep = enemyPositions[nearbyEnemy.id] || { x: nearbyEnemy.x, y: nearbyEnemy.y }
          startBattle({ player: { ...playerPos }, enemy: { ...ep } })
        }}
        onInspect={() => setShowEnemyInfo(true)}
        onClose={() => setShowInteraction(false)}
      />

      {/* Enemy info popup */}
      <EnemyInfoModal
        open={!!(showEnemyInfo && nearbyEnemy)}
        enemyName={nearbyEnemy?.name ?? 'Enemy'}
        enemyPreview={enemyPreview}
        onBattle={() => {
          if (!nearbyEnemy) return
          const ep = enemyPositions[nearbyEnemy.id] || { x: nearbyEnemy.x, y: nearbyEnemy.y }
          startBattle({ player: { ...playerPos }, enemy: { ...ep } })
          setShowEnemyInfo(false)
        }}
        onChat={() => {
          if (nearbyEnemy) {
            setChatMode({ kind: 'enemy', enemyId: nearbyEnemy.id, enemyName: nearbyEnemy.name })
          }
          setDockPanel('chat')
          setShowEnemyInfo(false)
        }}
        onClose={() => setShowEnemyInfo(false)}
      />
    </main>
  )
}
