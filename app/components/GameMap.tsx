'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, ScrollText, MessageSquare, Swords, User } from 'lucide-react'
import { GameState } from '../hooks/useGameState'
import {
  INTERACTION_RANGE,
  BASIC_ATTACK,
  getSkillById,
  cooldownMsFromTicks,
  createEnemyEncounter,
  getBattleRewards,
  type Skill,
  type Enemy,
  type MapCharacterVisualId,
} from '../constants'
import type { DockPanelId } from '../hooks/useGameState'
import DockFeatureModal from './DockFeatureModal'
import BattleResultOverlay from './map-ui/BattleResultOverlay'
import InteractionButtons from './map-ui/InteractionButtons'
import EnemyInfoModal from './map-ui/EnemyInfoModal'
import { resolveSkillFxProfile } from './map-ui/skillFxProfile'
import { actionLabel, reasonLabel, rejectReasonLabel, strategyLabel } from './map-ui/battleText'
import PixellabMapGeneratorModal from './map-ui/PixellabMapGeneratorModal'
import CollisionEditorModal from './map-ui/CollisionEditorModal'
import { useAutoBattleStart } from './map-ui/hooks/useAutoBattleStart'
import { useEnemyInfoInteraction } from './map-ui/hooks/useEnemyInfoInteraction'
import { useMapClickMove } from './map-ui/hooks/useMapClickMove'
import { useEnemyPatrol } from './map-ui/hooks/useEnemyPatrol'
import { useMapKeyboardMovement } from './map-ui/hooks/useMapKeyboardMovement'
import { useMapRenderMetrics } from './map-ui/hooks/useMapRenderMetrics'
import { useMapTransientFx } from './map-ui/hooks/useMapTransientFx'
import { useMapUiMetrics } from './map-ui/hooks/useMapUiMetrics'
import { useNearbyEnemyDetection } from './map-ui/hooks/useNearbyEnemyDetection'
import { usePixellabSync } from './map-ui/hooks/usePixellabSync'
import { ensureDeepClawAgentEnemy } from './map-ui/utils/gameMapBattleUtils'
import {
  ROTATION_KEYS,
  DEFAULT_DIRECTION,
  HOME_DEFAULT_MAP_ID,
  MAP_DISPLAY_ORDER,
  disengageGridPositions,
  getMapDisplayName,
  pixelLabSheetActorStyle,
  resolveDirectionByDelta,
  snapToGrid,
  toEnemyIdlePngPath,
  toEnemyRunningFramePath,
  toEnemyWalkFramePath,
  toPlayerIdlePngPath,
  toPlayerRunningFramePath,
  toPlayerWalkFramePath,
  type PixelLabPackMeta,
  type RotationKey,
} from './map-ui/gameMapUtils'
import { MapBattleController } from '../../src/map-battle/MapBattleController'
import { isDemoDungeonCellWalkable, snapGridSpawnToWalkable } from '../../src/map-battle/dungeonDemoFootTiles'
import { snapPositionToWalkable } from '../../src/map-battle/walkability'
import { mapCharacterIdleStyle } from '../lib/mapEntitySpriteStyles'

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

type MoveAnim = 'idle' | 'walk' | 'running'

/**
 * battle-core map battle tick interval.
 * Using 200ms as time granularity, can express:
 * - 1.0s/shot = 5 tick
 * - 0.8s/shot = 4 tick
 */
const BASE_BATTLE_TICK_MS = 200

type BattleSpeedMultiplier = 0.5 | 1 | 2

type CombatAnim = 'idle' | 'attack' | 'cast' | 'hit'

type CombatFxState = {
  anim: CombatAnim
  untilMs: number
  offsetX: number
  offsetY: number
}

type ReceivedCommandMeta = {
  actorId: string
  targetId: string
  action: string
  skillId: string
  metadata: Record<string, unknown>
}

/** Grid movement animation duration synchronized with battle on map */
const BATTLE_MOVE_TRANSITION_MS = 300
const MANUAL_FLEE_DEBOUNCE_MS = 450

export default function GameMap({ game }: Props) {
  const {
    playerPos,
    setPlayerPos,
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
    playerGold,
    playerExp,
    setShowCharacter,
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
    gainedGold,
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
  const [availableMaps, setAvailableMaps] = useState<Array<{ id: string; fileName: string }>>([])
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
  const [selectedMapId, setSelectedMapId] = useState<string>(HOME_DEFAULT_MAP_ID)
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
  const [playerCombatFx, setPlayerCombatFx] = useState<CombatFxState>({
    anim: 'idle',
    untilMs: 0,
    offsetX: 0,
    offsetY: 0,
  })
  const [enemyCombatFx, setEnemyCombatFx] = useState<Record<number, CombatFxState>>({})
  const projectileTargetByCommandRef = useRef<Record<string, { target: 'player' | 'enemy' }>>({})
  const commandMetaByIdRef = useRef<Record<string, ReceivedCommandMeta>>({})
  const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null)
  const [, setCdUiTick] = useState(0)
  const [battlePlayerMaxHp, setBattlePlayerMaxHp] = useState(0)

  const refreshMapsCatalog = useCallback(async (preferSelectId?: string) => {
    try {
      const res = await fetch('/api/maps')
      if (!res.ok) return
      const data = (await res.json()) as {
        maps: Array<{ id: string; fileName: string }>
        defaultMapId: string | null
      }
      setAvailableMaps(data.maps)
      if (preferSelectId) {
        setSelectedMapId(preferSelectId)
      }
    } catch (error) {
      console.warn('refresh maps catalog failed:', error)
    }
  }, [])

  const reloadCurrentMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/airpg-map?map=${encodeURIComponent(selectedMapId)}`)
      if (!res.ok) return
      const data = (await res.json()) as {
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
          name: string
          x: number
          y: number
          level: number
          profile?: { maxHp?: number | null; atk?: number | null; def?: number | null; spd?: number | null }
          visualId?: MapCharacterVisualId | null
          mapSpriteTileIndex?: number
        }>
      }
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
  }, [selectedMapId])

  useEffect(() => {
    if (!showBattle) {
      clearTransientFx()
      setPlayerCombatFx({ anim: 'idle', untilMs: 0, offsetX: 0, offsetY: 0 })
      setEnemyCombatFx({})
      projectileTargetByCommandRef.current = {}
      commandMetaByIdRef.current = {}
    }
  }, [clearTransientFx, showBattle])

  useEffect(() => {
    let active = true
    const loadCatalog = async () => {
      try {
        const res = await fetch('/api/maps')
        if (!res.ok) return
        const data = (await res.json()) as {
          maps: Array<{ id: string; fileName: string }>
          defaultMapId: string | null
        }
        if (!active) return
        setAvailableMaps(data.maps)
        if (data.maps.some((map) => map.id === HOME_DEFAULT_MAP_ID)) {
          setSelectedMapId(HOME_DEFAULT_MAP_ID)
        } else if (data.defaultMapId) {
          setSelectedMapId(data.defaultMapId)
        }
      } catch (error) {
        console.warn('load maps catalog failed:', error)
      }
    }
    loadCatalog()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadMap = async () => {
      try {
        const res = await fetch(`/api/airpg-map?map=${encodeURIComponent(selectedMapId)}`)
        if (!res.ok) return
        const data = (await res.json()) as {
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
        if (!active) return
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
        const spawn = snapGridSpawnToWalkable(
          data.playerSpawn.x,
          data.playerSpawn.y,
          data.width,
          data.height,
          data.collision,
          data.ground,
          data.tileset?.id ?? null,
        )
        setPlayerPos(spawn)
        if (data.enemies.length > 0) {
          setEnemies(
            ensureDeepClawAgentEnemy(data.enemies, {
              width: data.width,
              height: data.height,
              collision: data.collision,
              ground: data.ground,
              tilesetId: data.tileset?.id ?? null,
            }),
          )
        }
      } catch (error) {
        console.warn('load airpg map failed:', error)
      }
    }
    if (selectedMapId) loadMap()
    return () => {
      active = false
    }
  }, [selectedMapId, setEnemies, setPlayerPos])

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
    const img = new Image()
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
    const img = new Image()
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
    const llmProvider: 'deepseek' | 'zhipu' | 'custom' =
      process.env.NEXT_PUBLIC_BATTLE_LLM_PROVIDER === 'zhipu' ? 'zhipu' : 'deepseek'
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
      playerName: `Warrior Lv.${playerLevel}`,
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
        : undefined,
      battleDecisionMode,
      llmConfig:
        battleDecisionMode === 'dual_llm'
          ? {
            provider:
              llmProvider,
            model: process.env.NEXT_PUBLIC_BATTLE_LLM_MODEL,
            proxyUrl: aiProxyUrl,
            timeoutMs: Number(process.env.NEXT_PUBLIC_BATTLE_LLM_TIMEOUT_MS || 7000),
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

    const triggerCombatFx = (
      role: 'player' | 'enemy',
      anim: CombatAnim,
      opts?: { toward?: { x: number; y: number }; from?: { x: number; y: number }; durationMs?: number },
    ) => {
      const now = Date.now()
      const durationMs =
        opts?.durationMs ?? (anim === 'hit' ? 140 : anim === 'cast' ? 210 : anim === 'attack' ? 160 : 0)
      let offsetX = 0
      let offsetY = 0
      if (anim === 'attack' || anim === 'cast') {
        const tx = opts?.toward?.x ?? 0
        const ty = opts?.toward?.y ?? 0
        const len = Math.hypot(tx, ty) || 1
        const mag = anim === 'attack' ? 0.14 : 0.08
        offsetX = (tx / len) * mag
        offsetY = (ty / len) * mag
      } else if (anim === 'hit') {
        const fx = opts?.from?.x ?? 0
        const fy = opts?.from?.y ?? 0
        const len = Math.hypot(fx, fy) || 1
        const mag = 0.1
        offsetX = (fx / len) * mag
        offsetY = (fy / len) * mag
      }
      const nextFx: CombatFxState = {
        anim,
        untilMs: now + durationMs,
        offsetX,
        offsetY,
      }
      if (role === 'player') {
        setPlayerCombatFx(nextFx)
      } else if (combatEnemyId !== null) {
        setEnemyCombatFx((prev) => ({ ...prev, [combatEnemyId]: nextFx }))
      }
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

      const left = c.session.left.resources
      const right = c.session.right.resources
      const leftHpRatio = left.maxHp > 0 ? left.hp / left.maxHp : 1
      const hasCombatStarted = c.session.events.some((ev) => ev.type === 'action_executed' || ev.type === 'damage_applied')
      const latestEnemyDamageToPlayer = [...c.session.events]
        .reverse()
        .find(
          (ev) =>
            ev.type === 'damage_applied' &&
            String(ev.payload.actorId ?? '') === c.session.right.id &&
            String(ev.payload.targetId ?? '') === c.session.left.id
        )
      const lastEnemyDamage = latestEnemyDamageToPlayer
        ? Math.max(0, Number(latestEnemyDamageToPlayer.payload.damage ?? 0))
        : 0
      const autoFleeDamageThreshold = Math.max(1, left.hp * 0.1)
      const shouldAutoFlee =
        !isPVPMode &&
        hasCombatStarted &&
        left.hp > 0 &&
        right.hp > 0 &&
        leftHpRatio <= 0.38 &&
        lastEnemyDamage > autoFleeDamageThreshold &&
        c.session.chaseState.status !== 'flee_pending'
      if (shouldAutoFlee) {
        autoFleePendingRef.current = true
        if (!autoFleeConsumedMapRef.current) {
          autoFleeConsumedMapRef.current = true
          setBattleLog((prev) => [
            ...prev,
            `Auto-flee triggered: Enemy single damage ${lastEnemyDamage} exceeds 10% of current HP (threshold ${Math.floor(autoFleeDamageThreshold)})`,
          ])
        }
      } else {
        autoFleeConsumedMapRef.current = false
      }

      const execTick = c.session.tick + 1
      const pendingFleeSource: 'manual' | 'auto' | null = manualFleeRequestedRef.current
        ? 'manual'
        : autoFleePendingRef.current
          ? 'auto'
          : null
      const step = c.step({
        executeAtTick: execTick,
        nextAttackSkillId: nextAttackSkillRef.current,
        pendingFlee: manualFleeRequestedRef.current || autoFleePendingRef.current,
        pendingFleeSource,
        onClearQueuedSkill: () => setNextAttackSkillId(null),
        onSkillCooldown: (skillId, ms) => {
          if (skillId === BASIC_ATTACK.id || ms <= 0) return
          setSkillCooldownEndAt((prev) => ({ ...prev, [skillId]: Date.now() + ms }))
        },
      })
      manualFleeRequestedRef.current = false
      autoFleePendingRef.current = false

      const snappedLeft = snapPositionToWalkable({
        pos: step.session.left.position,
        mapW: mapInfo.width,
        mapH: mapInfo.height,
        isWalkable: isWalkableForBattle,
      })
      const snappedRight = snapPositionToWalkable({
        pos: step.session.right.position,
        mapW: mapInfo.width,
        mapH: mapInfo.height,
        isWalkable: isWalkableForBattle,
      })
      const s = {
        ...step.session,
        left: { ...step.session.left, position: snappedLeft },
        right: { ...step.session.right, position: snappedRight },
      }
      c.session = s
      if (prevPhase === 'preparation' && s.phase === 'battle') {
        setBattleLog((prev) => [...prev, 'Preparation phase ended'])
      }
      const evStart = Math.max(0, s.events.length - step.newEventCount)

      setPlayerHP(s.left.resources.hp)
      setPlayerMP(s.left.resources.mp)
      setEnemyHP(s.right.resources.hp)
      setEnemyMaxHp(s.right.resources.maxHp)
      setBattlePlayerMaxHp(s.left.resources.maxHp)
      // Keep decimal coordinates during battle to avoid displacement being swallowed by integer grid rounding causing “seems not moving”.
      setPlayerPos({ x: s.left.position.x, y: s.left.position.y })
      if (s.phase === 'preparation') {
        // Preparation phase only adjusts facing: both sides face each other, don't change any coordinates.
        setPlayerFacing(
          resolveDirectionByDelta(
            s.right.position.x - s.left.position.x,
            s.right.position.y - s.left.position.y
          )
        )
        setEnemyFacings((prevFacing) => ({
          ...prevFacing,
          [combatEnemyId]: resolveDirectionByDelta(
            s.left.position.x - s.right.position.x,
            s.left.position.y - s.right.position.y
          ),
        }))
      } else {
        const pdx = s.left.position.x - prevPlayerPos.x
        const pdy = s.left.position.y - prevPlayerPos.y
        if (pdx * pdx + pdy * pdy > 0.0001) {
          setPlayerFacing(resolveDirectionByDelta(pdx, pdy))
        }
      }
      setEnemyPositions((prev) => ({
        ...prev,
        [combatEnemyId]: { x: s.right.position.x, y: s.right.position.y },
      }))
      setIsDefending(!!s.left.defending)
      const playerMoveDist = Math.hypot(s.left.position.x - prevPlayerPos.x, s.left.position.y - prevPlayerPos.y)
      if (playerMoveDist > 0.22) {
        pushMoveFx({ target: 'player', x: s.left.position.x, y: s.left.position.y })
      }
      const enemyMoveDist = Math.hypot(s.right.position.x - prevEnemyPos.x, s.right.position.y - prevEnemyPos.y)
      if (enemyMoveDist > 0.22) {
        pushMoveFx({ target: 'enemy', x: s.right.position.x, y: s.right.position.y })
      }
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

      for (let i = evStart; i < s.events.length; i++) {
        const ev = s.events[i]
        if (s.phase === 'preparation') continue
        if (ev.type === 'command_received') {
          const commandId = String(ev.payload.commandId ?? '')
          const actorId = typeof ev.payload.actorId === 'string' ? ev.payload.actorId : ''
          const targetId = typeof ev.payload.targetId === 'string' ? ev.payload.targetId : ''
          const action = String(ev.payload.action ?? '')
          const skillId = String(ev.payload.skillId ?? '')
          const metadata = (ev.payload.metadata ?? {}) as Record<string, unknown>
          if (commandId) {
            commandMetaByIdRef.current[commandId] = {
              actorId,
              targetId,
              action,
              skillId,
              metadata,
            }
          }
        }
        if (ev.type === 'action_executed') {
          const commandId = String(ev.payload.commandId ?? '')
          const actorId = String(ev.payload.actorId ?? '')
          const action = String(ev.payload.action ?? '')
          const commandMeta = commandId ? commandMetaByIdRef.current[commandId] : undefined
          const targetId = commandMeta?.targetId ?? String(ev.payload.targetId ?? '')
          const skillId = commandMeta?.skillId ?? String(ev.payload.skillId ?? '')
          const metadata = commandMeta?.metadata ?? {}
          const actorRole = roleByEntityId(actorId)
          const targetRole = roleByEntityId(targetId)
          const actorPos = posByEntityId(actorId)
          const targetPos = posByEntityId(targetId)

          if (actorRole && targetRole && actorPos && targetPos) {
            // Trigger facing and action effects only after attack/skill execution succeeds to avoid “fake action” visual noise.
            if (action === 'basic_attack' || action === 'cast_skill') {
              triggerCombatFx(actorRole, action === 'cast_skill' ? 'cast' : 'attack', {
                toward: {
                  x: targetPos.x - actorPos.x,
                  y: targetPos.y - actorPos.y,
                },
              })
              const actorFacing = resolveDirectionByDelta(
                targetPos.x - actorPos.x,
                targetPos.y - actorPos.y
              )
              const targetFacing = resolveDirectionByDelta(
                actorPos.x - targetPos.x,
                actorPos.y - targetPos.y
              )
              if (actorId === s.left.id) {
                setPlayerFacing(actorFacing)
              } else if (actorId === s.right.id) {
                setEnemyFacings((prevFacing) => ({ ...prevFacing, [combatEnemyId]: actorFacing }))
              }
              if (targetId === s.left.id) {
                setPlayerFacing(targetFacing)
              } else if (targetId === s.right.id) {
                setEnemyFacings((prevFacing) => ({ ...prevFacing, [combatEnemyId]: targetFacing }))
              }
            }

            const fxProfile = resolveSkillFxProfile({
              action,
              skillId,
              actorRole,
            })
            const projectileKind = fxProfile.projectileKind
            if (projectileKind) {
              pushProjectileFx({
                kind: projectileKind,
                from: actorRole,
                startX: actorPos.x,
                startY: actorPos.y,
                deltaX: targetPos.x - actorPos.x,
                deltaY: targetPos.y - actorPos.y,
                durationMs: fxProfile.durationMs,
              })
              if (commandId) {
                projectileTargetByCommandRef.current[commandId] = { target: targetRole }
              }
            }
          }

          const actStr = actionLabel(action)
          const strategy = strategyLabel(metadata.strategy)
          const reason = reasonLabel(metadata.reason)
          const isAiDecision = metadata.decisionSource === 'llm'
          const actorName = actorId === 'poc-player' ? 'Player' : 'Enemy'
          const head = `${actorName}${actStr}`
          const parts = [head]
          if (isAiDecision) parts.push('[AI]')
          if (strategy) parts.push(`[${strategy}]`)
          if (reason && reason !== head) parts.push(`· ${reason}`)
          setBattleLog((prev) => [...prev, parts.join(' ')])

          if (actorId === s.left.id && action === 'cast_skill') {
            setNextAttackSkillId(null)
            const coreId = String(ev.payload.skillId ?? '')
            if (coreId) {
              const appSkill = getAvailableSkills().find((sk) => sk.coreSkillId === coreId)
              if (appSkill && appSkill.cooldownTicks > 0) {
                setSkillCooldownEndAt((prev) => ({
                  ...prev,
                  [appSkill.id]: Date.now() + cooldownMsFromTicks(appSkill.cooldownTicks),
                }))
              }
            }
          }
          if (commandId) {
            delete commandMetaByIdRef.current[commandId]
          }
        }
        if (ev.type === 'damage_applied') {
          const dmg = Math.max(0, Number(ev.payload.damage ?? 0))
          const commandId = String(ev.payload.commandId ?? '')
          const tid = String(ev.payload.targetId ?? '')
          const actorId = String(ev.payload.actorId ?? '')
          const actorPos = posByEntityId(actorId)
          const targetPos = posByEntityId(tid)
          const targetRole = roleByEntityId(tid)
          if (targetRole && actorPos && targetPos && dmg > 0) {
            triggerCombatFx(targetRole, 'hit', {
              from: {
                x: targetPos.x - actorPos.x,
                y: targetPos.y - actorPos.y,
              },
            })
          }
          if (tid === 'poc-player') {
            setBattleLog((prev) => [...prev, `Took ${dmg} damage`])
            if (dmg > 0) {
              pushFloatText({
                target: 'player',
                text: `-${dmg}`,
                variant: 'damage',
                offsetX: (Math.random() - 0.5) * 28,
              })
            }
          } else if (tid === s.right.id) {
            setBattleLog((prev) => [...prev, `Dealt ${dmg} damage`])
            if (dmg > 0) {
              pushFloatText({
                target: 'enemy',
                text: `-${dmg}`,
                variant: 'damage',
                offsetX: (Math.random() - 0.5) * 28,
              })
            }
          }
          const impactedRole = commandId ? projectileTargetByCommandRef.current[commandId]?.target : undefined
          if (impactedRole) {
            const impactedPos = impactedRole === 'player' ? s.left.position : s.right.position
            pushImpactFx({
              kind: 'hit',
              target: impactedRole,
              x: impactedPos.x,
              y: impactedPos.y,
            })
            delete projectileTargetByCommandRef.current[commandId]
          }
        }
        if (ev.type === 'chase_started') {
          const st = typeof ev.payload.startTick === 'number' ? ev.payload.startTick : '?'
          const ex = typeof ev.payload.expireTick === 'number' ? ev.payload.expireTick : '?'
          setBattleLog((prev) => [
            ...prev,
            `Chase started: ${st}→${ex} tick, escape fails if caught (battle continues), edge reached or distance >= 3.0 escape succeeds`,
          ])
        }
        if (ev.type === 'chase_resolved') {
          const typ = ev.payload.type
          if (typ === 'captured') {
            setBattleLog((prev) => [...prev, 'Chase ended: caught, escape failed, battle continues'])
          } else if (typ === 'escaped') {
            const by = ev.payload.escapedBy === 'edge' ? 'edge reached' : 'pulled away distance'
            setBattleLog((prev) => [...prev, `Chase ended: escaped (${by})`])
          } else if (typ === 'escape_failed') {
            setBattleLog((prev) => [...prev, 'Chase ended: escape conditions not met, battle continues'])
          }
        }
        if (ev.type === 'battle_ended') {
          const reason = String(ev.payload.reason ?? '')
          if (reason === 'timeout_hp_compare') {
            setBattleLog((prev) => [...prev, 'Battle stalemate too long: determining victory/defeat by remaining HP'])
          }
        }
        if (ev.type === 'command_rejected') {
          const reason = String(ev.payload.reason ?? '')
          const actorId = String(ev.payload.actorId ?? '')
          const commandId = String(ev.payload.commandId ?? '')
          const payloadSkillId =
            ev.payload.skillId !== undefined && ev.payload.skillId !== null
              ? String(ev.payload.skillId)
              : ''
          if (actorId === s.left.id && reason !== 'flee_failed') {
            const clearQueuedSkill =
              payloadSkillId.length > 0 ||
              [
                'target_out_of_range',
                'not_enough_mp',
                'skill_on_cooldown',
                'not_enough_stamina',
                'skill_not_equipped',
                'skill_not_found',
                'missing_skill_id',
                'target_not_found',
              ].includes(reason)
            if (clearQueuedSkill) {
              setNextAttackSkillId(null)
            }
          }
          if (reason === 'target_dodged') {
            const dodgedRole = commandId ? projectileTargetByCommandRef.current[commandId]?.target : undefined
            if (dodgedRole) {
              const dodgePos = dodgedRole === 'player' ? s.left.position : s.right.position
              pushImpactFx({
                kind: 'dodge',
                target: dodgedRole,
                x: dodgePos.x,
                y: dodgePos.y,
              })
              delete projectileTargetByCommandRef.current[commandId]
            }
          }
          if (commandId) {
            delete commandMetaByIdRef.current[commandId]
          }
          if (reason === 'flee_failed' && actorId === s.left.id) {
            setBattleLog((prev) => [...prev, 'Flee failed (probability check failed), moving toward map edge or trying again'])
          } else if (actorId === s.left.id) {
            setBattleLog((prev) => [...prev, `Player action rejected: ${rejectReasonLabel(reason)}`])
          }
        }
      }

      const ui = step.uiOutcome
      if (ui === 'ongoing') {
        scheduleTick()
        return
      }

      mapBattleEndedRef.current = true
      clearTimers()
      mapBattleControllerRef.current = null
      setLastBattleTickCount(Math.max(0, s.tick))

      // Handle automation task
      const battleOutcome: 'win' | 'lose' | null = ui === 'win' ? 'win' : ui === 'lose' ? 'lose' : null
      const automationResult = processAutomationAfterBattle(battleOutcome)

      if (automationResult.message) {
        setBattleLog((prev) => [...prev, automationResult.message!])
      }

      if (automationResult.continue) {
        // Automation mode: show settlement UI, but use useEffect to automatically click Continue
        if (ui === 'win') {
          pendingRespawnEnemyIdRef.current = combatEnemyId
          completeMapBattleVictory('Battle victory!')
        } else if (ui === 'lose') {
          completeMapBattleDefeat()
        } else if (ui === 'fled') {
          const p0 = { x: Math.round(s.left.position.x), y: Math.round(s.left.position.y) }
          const e0 = { x: Math.round(s.right.position.x), y: Math.round(s.right.position.y) }
          const sep = disengageGridPositions(
            p0,
            e0,
            mapInfo.width,
            mapInfo.height,
            (gx, gy, role) =>
              role === 'playerStep'
                ? isWalkable(gx, gy, { ignoreEnemyIds: combatEnemyId != null ? [combatEnemyId] : [] })
                : isWalkable(gx, gy, { ignorePlayerOnCell: { x: Math.round(p0.x), y: Math.round(p0.y) } }),
          )
          setPlayerFacing(resolveDirectionByDelta(sep.player.x - p0.x, sep.player.y - p0.y))
          setPlayerPos(sep.player)
          setEnemyPositions((prev) => ({ ...prev, [combatEnemyId]: sep.enemy }))
          finalizeMapBattleFleeSuccess({ successMessage: 'Successfully escaped battle.', clearBattleLog: false })
        }
      } else {
        // Non-automation mode: normally show settlement UI
        if (ui === 'win') {
          pendingRespawnEnemyIdRef.current = combatEnemyId
          completeMapBattleVictory('Battle victory!')
        } else if (ui === 'lose') {
          completeMapBattleDefeat()
        } else if (ui === 'fled') {
          const p0 = { x: Math.round(s.left.position.x), y: Math.round(s.left.position.y) }
          const e0 = { x: Math.round(s.right.position.x), y: Math.round(s.right.position.y) }
          const sep = disengageGridPositions(
            p0,
            e0,
            mapInfo.width,
            mapInfo.height,
            (gx, gy, role) =>
              role === 'playerStep'
                ? isWalkable(gx, gy, { ignoreEnemyIds: combatEnemyId != null ? [combatEnemyId] : [] })
                : isWalkable(gx, gy, { ignorePlayerOnCell: { x: Math.round(p0.x), y: Math.round(p0.y) } }),
          )
          setPlayerFacing(resolveDirectionByDelta(sep.player.x - p0.x, sep.player.y - p0.y))
          setPlayerPos(sep.player)
          setEnemyPositions((prev) => ({ ...prev, [combatEnemyId]: sep.enemy }))
          finalizeMapBattleFleeSuccess({ successMessage: 'Successfully escaped battle.', clearBattleLog: false })
        }
        cancelAutomation()
      }
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
      respawnDefeatedEnemy(id)
      pendingRespawnEnemyIdRef.current = null
    }
    closeBattle()
  }, [closeBattle, respawnDefeatedEnemy, setEnemyPositions, setPlayerPos])

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
    isWalkable: (x, y) => isWalkable(x, y),
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
    selectedMapId,
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
      {/* Full-screen map: canvas and character in same viewport, same coordinate system, avoid "floating outside map" */}
      <div
        ref={mapViewportRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleMapClick}
      >
        <canvas ref={mapCanvasRef} className="absolute inset-0 z-0 block h-full w-full" />
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {/* Enemy marker - SSR uses fixed position to avoid hydration mismatch */}
          {enemies.map(enemy => {
            if (showBattle && isPVPMode && (combatEnemyId === null || enemy.id !== combatEnemyId)) {
              return null
            }
            const pos = mounted ? (enemyPositions[enemy.id] || { x: enemy.x, y: enemy.y }) : { x: enemy.x, y: enemy.y }
            const inBattle = showBattle && combatEnemyId !== null && enemy.id === combatEnemyId
            const enemyTransitionStyle = inBattle
              ? {
                transitionProperty: 'left, top',
                transitionDuration: `${BATTLE_MOVE_TRANSITION_MS}ms`,
                transitionTimingFunction: 'linear',
                willChange: 'left, top',
              }
              : undefined
            return (
              <div
                key={enemy.id}
                className="absolute z-20 cursor-pointer"
                style={{
                  left: `${gridToScreen(pos.x, pos.y).x}px`,
                  top: `${gridToScreen(pos.x, pos.y).y}px`,
                  transform: 'translate(-50%, -50%)',
                  ...enemyTransitionStyle,
                }}
                onClick={handleEnemyMarkerClick(enemy)}
                role="button"
                tabIndex={0}
                onKeyDown={handleEnemyMarkerKeyDown(enemy)}
                aria-label={`View ${enemy.name} info`}
              >
                {inBattle && (
                  <div className="absolute -top-10 left-1/2 w-14 -translate-x-1/2">
                    <div className="mb-0.5 text-center font-arcade text-[8px] text-red-200">HP</div>
                    <div className="h-2 overflow-hidden rounded-sm border border-red-900 bg-[#2b0a0a]/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]">
                      <div
                        className="h-full bg-gradient-to-r from-red-500 via-rose-500 to-red-400"
                        style={{ width: `${enemyHpRatioForUi}%` }}
                      />
                    </div>
                  </div>
                )}
                {(() => {
                  const facing = enemyFacings[enemy.id] || DEFAULT_DIRECTION
                  const vid = enemy.visualId
                  const plMeta = typeof vid === 'string' && vid.startsWith('pixellab:') ? pixelLabPacks[vid] : undefined
                  const nowMs = Date.now()
                  const fx = enemyCombatFx[enemy.id]
                  const activeFx = fx && nowMs < fx.untilMs ? fx : null
                  // Prefer "distance to current target" to decide walking, because frame-based sprites
                  // should animate reliably even if timestamps drift or are missed.
                  const curTarget = enemyTargetsRef.current[enemy.id]
                  const isWalking =
                    !!curTarget &&
                    Math.hypot(curTarget.x - pos.x, curTarget.y - pos.y) > 0.02
                  const animWalking = isWalking || activeFx?.anim === 'attack' || activeFx?.anim === 'cast'
                  const spriteTransform = activeFx
                    ? `translate(${(activeFx.offsetX * mapCellDisplayPx).toFixed(1)}px, ${(activeFx.offsetY * mapCellDisplayPx).toFixed(1)}px)`
                    : undefined
                  if (typeof vid === 'string' && vid.startsWith('pixellab:')) {
                    if (plMeta) {
                      return (
                        <div
                          className="drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
                          style={{
                            ...pixelLabSheetActorStyle(plMeta, facing, animWalking, walkAnimTick, actorPx),
                            transform: spriteTransform,
                            transition: 'transform 110ms ease-out',
                            filter: activeFx?.anim === 'hit' ? 'brightness(1.28) saturate(1.18)' : undefined,
                          }}
                          role="img"
                          aria-label={enemy.name}
                        />
                      )
                    }
                    return (
                      <div
                        className="animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
                        style={mapCharacterIdleStyle(vid, actorPx)}
                        role="img"
                        aria-label={enemy.name}
                      />
                    )
                  }
                  /* Non PixelLab: unified use of battle-poc public/enemy direction sprites (gif/png) */
                  const chase = mapBattleControllerRef.current?.session.chaseState
                  const isFleePending =
                    !!showBattle &&
                    combatEnemyId !== null &&
                    enemy.id === combatEnemyId &&
                    chase?.status === 'flee_pending'
                  return (
                    <img
                      src={isFleePending ? toEnemyRunningFramePath(facing, walkAnimTick) : animWalking ? toEnemyWalkFramePath(facing, walkAnimTick) : toEnemyIdlePngPath(facing)}
                      alt={enemy.name}
                      className="animate-pulse object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
                      style={{
                        width: actorPx,
                        height: actorPx,
                        imageRendering: 'pixelated',
                        transform: spriteTransform,
                        transition: 'transform 110ms ease-out, filter 90ms ease-out',
                        filter: activeFx?.anim === 'hit' ? 'brightness(1.24) saturate(1.18)' : undefined,
                      }}
                      onError={(e) => {
                        const target = e.currentTarget
                        // Some directions may only export frame_000.png; if a later frame 404s,
                        // fall back to frame_000 first to keep "walking" look, then finally idle.
                        const stage = (target.dataset['fallbackStage'] ?? '0')
                        if (stage === '0') {
                          target.dataset['fallbackStage'] = '1'
                          target.src = isFleePending
                            ? toEnemyRunningFramePath(facing, 0)
                            : animWalking
                              ? toEnemyWalkFramePath(facing, 0)
                              : toEnemyIdlePngPath(facing)
                          return
                        }
                        target.onerror = null
                        target.src = toEnemyIdlePngPath(facing)
                      }}
                    />
                  )
                })()}
                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] text-amber-100/95 bg-black/75 px-1.5 py-0.5 rounded whitespace-nowrap max-w-[8rem] truncate">
                  {enemy.name} Lv.{enemyLevelRangeMin}~{enemyLevelRangeMax}
                </div>
              </div>
            )
          })}

          {/* Player marker - SSR uses fixed default value to avoid hydration mismatch */}
          <div
            className="absolute pointer-events-none z-30"
            style={{
              left: mounted ? `${gridToScreen(playerPos.x, playerPos.y).x}px` : '15%',
              top: mounted ? `${gridToScreen(playerPos.x, playerPos.y).y}px` : '80%',
              transform: mounted ? 'translate(-50%, -50%)' : undefined,
              transitionProperty: 'left, top',
              transitionDuration: showBattle ? `${BATTLE_MOVE_TRANSITION_MS}ms` : '120ms',
              transitionTimingFunction: showBattle ? 'linear' : 'ease-out',
              willChange: 'left, top',
            }}
          >
            {showBattle && (
              <div className="absolute -top-10 left-1/2 w-14 -translate-x-1/2">
                <div className="mb-0.5 text-center font-arcade text-[8px] text-emerald-200">HP</div>
                <div className="h-2 overflow-hidden rounded-sm border border-emerald-900 bg-[#072318]/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-lime-400 to-emerald-400"
                    style={{ width: `${playerHpRatioForUi}%` }}
                  />
                </div>
              </div>
            )}
            {(() => {
              const nowMs = Date.now()
              const activeFx = nowMs < playerCombatFx.untilMs ? playerCombatFx : null
              const isAnimMove = Date.now() - playerLastMoveAt < 480 || activeFx?.anim === 'attack' || activeFx?.anim === 'cast'
              const spriteTransform = activeFx
                ? `translate(${(activeFx.offsetX * mapCellDisplayPx).toFixed(1)}px, ${(activeFx.offsetY * mapCellDisplayPx).toFixed(1)}px)`
                : undefined
              if (playerVisualId.startsWith('pixellab:')) {
                return pixelLabPacks[playerVisualId] ? (
                  <div
                    className="object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]"
                    style={{
                      ...pixelLabSheetActorStyle(
                        pixelLabPacks[playerVisualId]!,
                        playerFacing,
                        isAnimMove,
                        walkAnimTick,
                        actorPx,
                      ),
                      transform: spriteTransform,
                      transition: 'transform 110ms ease-out, filter 90ms ease-out',
                      filter: activeFx?.anim === 'hit' ? 'brightness(1.28) saturate(1.2)' : undefined,
                    }}
                    role="img"
                    aria-label="You"
                  />
                ) : (
                  <div
                    className="object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]"
                    style={mapCharacterIdleStyle(playerVisualId, actorPx)}
                    role="img"
                    aria-label="You"
                  />
                )
              }
              return (
                <img
                  src={
                    mapBattleControllerRef.current?.session.chaseState.status === 'flee_pending'
                      ? toPlayerRunningFramePath(playerFacing, walkAnimTick)
                      : isAnimMove
                        ? toPlayerWalkFramePath(playerFacing, walkAnimTick)
                        : toPlayerIdlePngPath(playerFacing)
                  }
                  alt="You"
                  className="object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]"
                  style={{
                    width: actorPx,
                    height: actorPx,
                    imageRendering: 'pixelated',
                    transform: spriteTransform,
                    transition: 'transform 110ms ease-out, filter 90ms ease-out',
                    filter: activeFx?.anim === 'hit' ? 'brightness(1.24) saturate(1.2)' : undefined,
                  }}
                  onError={(e) => {
                    const target = e.currentTarget
                    target.onerror = null
                    target.src = toPlayerIdlePngPath(playerFacing)
                  }}
                />
              )
            })()}
            <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] text-sky-100 bg-black/75 px-1.5 py-0.5 rounded whitespace-nowrap">
              You
            </div>
          </div>

          {/* Battle float text (damage / heal), aligned with grid character */}
          {showBattle && combatEnemyId !== null && (
            <div className="pointer-events-none absolute inset-0 z-[26] overflow-hidden">
              {projectileFx.map((fx) => {
                const start = gridToScreen(fx.startX, fx.startY)
                const end = gridToScreen(fx.startX + fx.deltaX, fx.startY + fx.deltaY)
                const dx = end.x - start.x
                const dy = end.y - start.y
                const angle = Math.atan2(dy, dx)
                const projectileClass =
                  fx.kind === 'arrow'
                    ? 'oc-projectile-arrow'
                    : fx.kind === 'fireball'
                      ? 'oc-projectile-fireball'
                      : fx.kind === 'arcane_bolt'
                        ? 'oc-projectile-arcane'
                        : fx.kind === 'frost'
                          ? 'oc-projectile-frost'
                          : fx.kind === 'slash'
                            ? 'oc-projectile-slash'
                            : fx.kind === 'support'
                              ? 'oc-projectile-support'
                              : 'oc-projectile-generic'
                return (
                  <span
                    key={fx.id}
                    className={`oc-projectile ${projectileClass}`}
                    style={{
                      left: start.x,
                      top: start.y,
                      ['--proj-dx' as string]: `${dx}px`,
                      ['--proj-dy' as string]: `${dy}px`,
                      ['--proj-rot' as string]: `${angle}rad`,
                      animationDuration: `${fx.durationMs}ms`,
                    }}
                  />
                )
              })}
              {impactFx.map((fx) => {
                const p = gridToScreen(fx.x, fx.y)
                const impactClass =
                  fx.kind === 'hit'
                    ? fx.target === 'player'
                      ? 'oc-impact-hit-player'
                      : 'oc-impact-hit-enemy'
                    : fx.target === 'player'
                      ? 'oc-impact-dodge-player'
                      : 'oc-impact-dodge-enemy'
                return (
                  <span
                    key={fx.id}
                    className={`oc-impact ${impactClass}`}
                    style={{
                      left: p.x,
                      top: p.y,
                    }}
                  />
                )
              })}
              {moveFx.map((fx) => {
                const screen = gridToScreen(fx.x, fx.y)
                const tintClass = fx.target === 'player' ? 'oc-battle-step-fx-player' : 'oc-battle-step-fx-enemy'
                return (
                  <span
                    key={fx.id}
                    className={`oc-battle-step-fx ${tintClass}`}
                    style={{
                      left: screen.x,
                      top: screen.y,
                    }}
                  />
                )
              })}
              {floatTexts.map((h) => {
                const foe = enemies.find((e) => e.id === combatEnemyId)
                const grid =
                  h.target === 'player'
                    ? playerPos
                    : enemyPositions[combatEnemyId] || (foe ? { x: foe.x, y: foe.y } : playerPos)
                const screen = gridToScreen(grid.x, grid.y)
                const colorClass =
                  h.variant === 'heal'
                    ? 'text-emerald-300'
                    : h.target === 'player'
                      ? 'text-sky-400'
                      : 'text-red-500'
                return (
                  <div
                    key={h.id}
                    className={`animate-map-hp-float absolute text-sm font-black tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] ${colorClass}`}
                    style={{
                      left: screen.x + h.offsetX,
                      top: screen.y - 40,
                    }}
                  >
                    {h.text}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </div>

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
        onClick={() => setShowCharacter(true)}
        className="absolute top-4 left-4 z-20 min-w-48 cursor-pointer rounded-xl border-2 border-fuchsia-300/70 bg-gradient-to-br from-pink-100/95 via-violet-100/90 to-sky-100/95 p-4 shadow-[0_10px_24px_-8px_rgba(91,33,182,0.45)] transition-colors hover:brightness-105"
      >
        <div className="mb-3 flex items-center gap-3">
          <img
            src="/player/idle/south.png"
            alt="Player"
            className="h-12 w-12 rounded-lg border border-cyan-300 bg-gradient-to-b from-cyan-50 to-indigo-100 object-contain pixelated"
          />
          <div>
            <div className="font-arcade text-[11px] text-slate-700">WARRIOR</div>
            <div className="text-sm font-bold text-fuchsia-600">Lv.{playerLevel}</div>
          </div>
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
          <div className="text-xs font-bold text-amber-700">💰 {playerGold} Gold</div>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 rounded-lg border border-sky-500/40 bg-black/60 px-3 py-2 text-xs text-sky-100">
        Map: {getMapDisplayName(mapInfo.mapId)} · {mapInfo.width}x{mapInfo.height} (grid) {tilesetReady ? ' · Sprites' : ' · Fallback render'}
      </div>
      <div className="absolute top-16 right-4 z-20 rounded-lg border border-sky-500/40 bg-black/60 px-3 py-2 text-xs text-sky-100">
        <label className="mr-2">Map</label>
        <select
          className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-100"
          value={selectedMapId}
          onChange={(e) => setSelectedMapId(e.target.value)}
        >
          {orderedAvailableMaps.map((map) => (
            <option key={map.id} value={map.id}>
              {getMapDisplayName(map.id)}
            </option>
          ))}
        </select>
      </div>
      <div className="absolute top-[7.25rem] right-4 z-20 flex max-w-[min(280px,calc(100vw-2rem))] flex-col items-end gap-1 rounded-lg border border-amber-500/35 bg-black/60 px-3 py-2 text-xs text-amber-100">
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
        mapId={selectedMapId}
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

      {/* Map battle: no navigation, no full-screen overlay; only one bottom action bar + settlement card (no curtain) */}
      {showBattle && (
        <>
          <div className="pointer-events-auto fixed bottom-4 left-4 z-30 flex h-[clamp(320px,58vh,560px)] w-[clamp(240px,28vw,380px)] flex-col rounded-xl border border-amber-500/60 bg-slate-900/95 px-2 py-2 shadow-xl">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 text-[11px] text-amber-100">
              <span className="font-semibold">In Battle · battle-core session</span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className="text-sky-300">MP {playerMP}/{playerMaxMp}</span>
                <span className="text-slate-500">Speed</span>
                {([0.5, 1, 2] as const).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setBattleSpeed(sp)}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${battleSpeed === sp
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                  >
                    {sp}×
                  </button>
                ))}
                <span className="font-mono text-slate-300">
                  {battleTimeSec >= 1 ? `${battleTimeSec}s` : '<1s'}
                  {lastBattleTickCount > 0 ? ` · ${lastBattleTickCount}t` : ''}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {!isGameOver && !isPVPMode && (
                <button
                  type="button"
                  onClick={() => {
                    const now = Date.now()
                    if (now - lastManualFleeRequestAtRef.current < MANUAL_FLEE_DEBOUNCE_MS) {
                      return
                    }
                    const chasePending =
                      mapBattleControllerRef.current?.session.chaseState.status === 'flee_pending'
                    if (chasePending) {
                      return
                    }
                    lastManualFleeRequestAtRef.current = now
                    manualFleeRequestedRef.current = true
                  }}
                  className="rounded-lg border border-gray-500 bg-gray-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-gray-600"
                >
                  Flee
                </button>
              )}
              {getAvailableSkills().map((skill) => {
                const cd = skillCooldownRemaining(skillCooldownEndAt, skill.id)
                const locked = cd > 0 || isGameOver
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => !locked && queueSkill(skill)}
                    onMouseEnter={() => setHoveredSkill(skill)}
                    onMouseLeave={() => setHoveredSkill(null)}
                    disabled={locked}
                    className={`relative flex h-11 w-14 flex-col items-center justify-center rounded-lg border text-[10px] font-bold text-white ${nextAttackSkillId === skill.id
                      ? 'border-orange-300 bg-orange-600 ring-1 ring-white'
                      : locked
                        ? 'border-gray-600 bg-gray-800 opacity-70'
                        : 'border-blue-400 bg-blue-600 hover:bg-blue-500'
                      }`}
                  >
                    <span className="text-lg">{skill.icon}</span>
                    {skill.name}
                    <span className="text-[9px] text-slate-100/85">
                      MP {skill.mpCost} · {skill.cooldownTicks}t
                    </span>
                    {cd > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-xs font-black">
                        {(cd / 1000).toFixed(1)}s
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {hoveredSkill && (
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 w-44 -translate-x-1/2 rounded-lg border border-yellow-500/80 bg-slate-950/95 p-2 text-center text-[11px] shadow-lg">
                <div className="text-lg">{hoveredSkill.icon}</div>
                <div className="font-bold text-white">{hoveredSkill.name}</div>
                <div className="text-slate-400">{hoveredSkill.desc}</div>
                <div className="mt-1 text-slate-400">MP: {hoveredSkill.mpCost} · CD: {hoveredSkill.cooldownTicks}t</div>
                {/* Range preserved: current map battle mode doesn't do frontend range judgment yet, still based on domain/engine */}
                <div className="text-slate-500">Range: {hoveredSkill.range ?? '-'} (preserved)</div>
              </div>
            )}
            <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-black/45 px-2 py-1.5">
              <div className="mb-1 border-b border-white/10 pb-1 text-[11px] font-semibold text-slate-200">Battle Log</div>
              <div className="h-[calc(100%-1.5rem)] overflow-y-auto pr-1 text-[11px] leading-snug text-slate-300">
                {battleLog.length === 0 ? (
                  <div className="text-slate-500">Waiting for battle events...</div>
                ) : (
                  battleLog.map((log, idx) => <div key={idx}>{log}</div>)
                )}
              </div>
            </div>
          </div>

          <BattleResultOverlay
            open={isGameOver}
            battleResult={battleResult}
            enemyName={nearbyEnemy?.name ?? 'Enemy'}
            battleTimeSec={battleTimeSec}
            lastBattleTickCount={lastBattleTickCount}
            gainedGold={gainedGold}
            gainedExp={gainedExp}
            battleLootDrop={battleLootDrop}
            onContinue={finishBattleAndClose}
          />
        </>
      )}

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
