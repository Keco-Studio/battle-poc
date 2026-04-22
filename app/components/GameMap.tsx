'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { resolveSkillFxProfile, type ProjectileKind } from './map-ui/skillFxProfile'
import { ENEMY_MESSAGES, actionLabel, reasonLabel, rejectReasonLabel, strategyLabel } from './map-ui/battleText'
import PixellabMapGeneratorModal from './map-ui/PixellabMapGeneratorModal'
import CollisionEditorModal from './map-ui/CollisionEditorModal'
import { MapBattleController } from '../../src/map-battle/MapBattleController'
import { isDemoDungeonCellWalkable, snapGridSpawnToWalkable } from '../../src/map-battle/dungeonDemoFootTiles'
import { snapPositionToWalkable } from '../../src/map-battle/walkability'
import { mapCharacterIdleStyle } from '../lib/mapEntitySpriteStyles'

/** 脱离战斗：双方沿连线方向各退几格（可走则移动） */
function disengageGridPositions(
  player: { x: number; y: number },
  enemy: { x: number; y: number },
  mapW: number,
  mapH: number,
  isWalkable: (x: number, y: number, role: 'playerStep' | 'enemyStep') => boolean,
): { player: { x: number; y: number }; enemy: { x: number; y: number } } {
  let dx = player.x - enemy.x
  let dy = player.y - enemy.y
  if (dx === 0 && dy === 0) {
    dx = 1
    dy = 0
  }
  const len = Math.hypot(dx, dy) || 1
  const nx = dx / len
  const ny = dy / len
  const step = 2
  let px = Math.round(player.x + nx * step)
  let py = Math.round(player.y + ny * step)
  let ex = Math.round(enemy.x - nx * step)
  let ey = Math.round(enemy.y - ny * step)
  px = Math.max(0, Math.min(mapW - 1, px))
  py = Math.max(0, Math.min(mapH - 1, py))
  ex = Math.max(0, Math.min(mapW - 1, ex))
  ey = Math.max(0, Math.min(mapH - 1, ey))
  if (!isWalkable(px, py, 'playerStep')) {
    px = player.x
    py = player.y
  }
  if (!isWalkable(ex, ey, 'enemyStep')) {
    ex = enemy.x
    ey = enemy.y
  }
  return { player: { x: px, y: py }, enemy: { x: ex, y: ey } }
}

function snapToGrid(pos: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(pos.x), y: Math.round(pos.y) }
}

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

const ROTATION_KEYS = [
  'north',
  'south',
  'east',
  'west',
  'north-east',
  'north-west',
  'south-east',
  'south-west',
] as const

type RotationKey = (typeof ROTATION_KEYS)[number]

const DEFAULT_DIRECTION: RotationKey = 'south'

type MoveAnim = 'idle' | 'walk' | 'running'

const toEnemyIdlePngPath = (direction: RotationKey) => `/enemy/idle/${direction}.png`
const toPlayerIdlePngPath = (direction: RotationKey) => `/player/idle/${direction}.png`

const ENEMY_WALK_FRAMES_BY_FACING: Record<RotationKey, number> = {
  north: 8,
  south: 8,
  east: 8,
  west: 8,
  'north-east': 8,
  'north-west': 8,
  'south-east': 8,
  'south-west': 8,
}

// Your player walk export uses hashed folder names for some directions.
const PLAYER_WALK_DIR_BY_FACING: Record<RotationKey, string> = {
  north: 'north',
  south: 'south',
  east: 'east-9b803dd5',
  west: 'west-44afc449',
  'north-east': 'north-east-76d09498',
  'north-west': 'north-west-6213b10b',
  'south-east': 'south-east-b3963b75',
  'south-west': 'south-west-326192d3',
}

function framePath(baseDir: string, frames: number, tick: number): string {
  const safeFrames = Math.max(1, Math.floor(frames))
  const frame = ((tick % safeFrames) + safeFrames) % safeFrames
  const name = `frame_${String(frame).padStart(3, '0')}.png`
  return `${baseDir}/${name}`
}

function toEnemyWalkFramePath(direction: RotationKey, tick: number): string {
  return framePath(`/enemy/walk/${direction}`, ENEMY_WALK_FRAMES_BY_FACING[direction] ?? 8, tick)
}

function toEnemyRunningFramePath(direction: RotationKey, tick: number): string {
  return framePath(`/enemy/running/${direction}`, 8, tick)
}

function toPlayerWalkFramePath(direction: RotationKey, tick: number): string {
  const dir = PLAYER_WALK_DIR_BY_FACING[direction] ?? direction
  return framePath(`/player/walk/${dir}`, 8, tick)
}

function toPlayerRunningFramePath(direction: RotationKey, tick: number): string {
  return framePath(`/player/running/${direction}`, 8, tick)
}

/** 与 ai-rpg-poc PixelLab pack `meta.json` 中 `directions` 数组行顺序一致 */
const PIXELLAB_ROW_BY_FACING: Record<RotationKey, number> = {
  south: 0,
  'south-west': 1,
  west: 2,
  'north-west': 3,
  north: 4,
  'north-east': 5,
  east: 6,
  'south-east': 7,
}

type PixelLabPackMeta = {
  id: string
  imageSize: { width: number; height: number }
  framesPerDirection: number
  layout: { rows: number; cols: number }
  files: { previewPng: string; sheetPng: string }
}

function pixelLabSheetActorStyle(
  meta: PixelLabPackMeta,
  facing: RotationKey,
  isWalking: boolean,
  tick: number,
  displaySize: number,
): CSSProperties {
  const fw = meta.imageSize.width
  const fh = meta.imageSize.height
  const cols = meta.layout?.cols ?? meta.framesPerDirection ?? 1
  const rows = meta.layout?.rows ?? 8
  const row = PIXELLAB_ROW_BY_FACING[facing] ?? 0
  const frames = Math.max(1, meta.framesPerDirection)
  const frame = isWalking ? tick % frames : 0
  const rel = meta.files.sheetPng
  const sheetUrl = rel.startsWith('/') ? rel : `/${rel.replace(/^\/+/, '')}`
  return {
    width: displaySize,
    height: displaySize,
    backgroundImage: `url("${sheetUrl}")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${fw * cols}px ${fh * rows}px`,
    backgroundPosition: `${-frame * fw}px ${-row * fh}px`,
    imageRendering: 'pixelated',
  }
}

const resolveDirectionByDelta = (dx: number, dy: number): RotationKey => {
  if (dx === 0 && dy === 0) return DEFAULT_DIRECTION
  if (dx > 0 && dy < 0) return 'north-east'
  if (dx < 0 && dy < 0) return 'north-west'
  if (dx > 0 && dy > 0) return 'south-east'
  if (dx < 0 && dy > 0) return 'south-west'
  if (dx > 0) return 'east'
  if (dx < 0) return 'west'
  if (dy < 0) return 'north'
  return 'south'
}

/** battle-core 地图战 tick 间隔（越大越慢） */
const BASE_BATTLE_TICK_MS = 340

type BattleSpeedMultiplier = 0.5 | 1 | 2

type MapFloatText = {
  id: string
  target: 'player' | 'enemy'
  text: string
  variant: 'damage' | 'heal'
  offsetX: number
}

type MapMoveFx = {
  id: string
  target: 'player' | 'enemy'
  x: number
  y: number
}

type MapProjectileFx = {
  id: string
  kind: ProjectileKind
  from: 'player' | 'enemy'
  startX: number
  startY: number
  deltaX: number
  deltaY: number
  durationMs: number
}

type MapImpactFx = {
  id: string
  kind: 'hit' | 'dodge'
  target: 'player' | 'enemy'
  x: number
  y: number
}

type CombatAnim = 'idle' | 'attack' | 'cast' | 'hit'

type CombatFxState = {
  anim: CombatAnim
  untilMs: number
  offsetX: number
  offsetY: number
}

/** 地图上与战斗同步的格子位移动画时长 */
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

  const keysRef = useRef<Record<string, boolean>>({
    w: false,
    a: false,
    s: false,
    d: false,
    arrowup: false,
    arrowdown: false,
    arrowleft: false,
    arrowright: false,
  })
  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(null)
  const [tilesetReady, setTilesetReady] = useState(false)
  const [availableMaps, setAvailableMaps] = useState<Array<{ id: string; fileName: string }>>([])
  const [selectedMapId, setSelectedMapId] = useState<string>('demo-project')
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
  const [mapBgUrl, setMapBgUrl] = useState<string | null>(null)
  const [mapBgImage, setMapBgImage] = useState<HTMLImageElement | null>(null)
  const prevEnemyGridRef = useRef<Record<number, { x: number; y: number }>>({})
  const prevPlayerGridRef = useRef<{ x: number; y: number } | null>(null)

  // 避免 SSR hydration 不匹配
  useEffect(() => {
    setMounted(true)
  }, [])

  // 敌人独立位置状态（用于随机移动）
  const [enemyPositions, setEnemyPositions] = useState<Record<number, { x: number; y: number }>>({})
  // 敌人消息气泡
  const [enemyMessages, setEnemyMessages] = useState<Record<number, string>>({})
  const [enemyFacings, setEnemyFacings] = useState<Record<number, RotationKey>>({})
  const enemyTargetsRef = useRef<Record<number, { x: number; y: number }>>({})
  const lastKeyboardMoveAtRef = useRef(0)

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
    ],
  )

  const playerPosRef = useRef(playerPos)
  playerPosRef.current = playerPos
  const isWalkableRef = useRef(isWalkable)
  isWalkableRef.current = isWalkable

  const mapAspect = mapInfo.width / Math.max(1, mapInfo.height)
  const viewAspect = viewportSize.width / Math.max(1, viewportSize.height)
  const renderWidth =
    viewAspect > mapAspect ? Math.floor(viewportSize.height * mapAspect) : Math.floor(viewportSize.width)
  const renderHeight =
    viewAspect > mapAspect ? Math.floor(viewportSize.height) : Math.floor(viewportSize.width / mapAspect)
  const renderOffsetX = Math.max(0, Math.floor((viewportSize.width - renderWidth) / 2))
  const renderOffsetY = Math.max(0, Math.floor((viewportSize.height - renderHeight) / 2))
  const mapCellDisplayPx =
    Math.min(renderWidth / Math.max(1, mapInfo.width), renderHeight / Math.max(1, mapInfo.height)) * 0.92

  /** 玩家与敌人统一显示尺寸，随格子缩放，与 ai-rpg-poc 观感对齐 */
  const actorPx = Math.max(32, Math.round(mapCellDisplayPx * 1.5))

  const gridToScreen = (x: number, y: number) => ({
    x: renderOffsetX + ((x + 0.5) / mapInfo.width) * renderWidth,
    y: renderOffsetY + ((y + 0.5) / mapInfo.height) * renderHeight,
  })

  function skillCooldownRemaining(endAt: Record<string, number>, skillId: string): number {
    const t = endAt[skillId]
    if (t === undefined) return 0
    return Math.max(0, t - Date.now())
  }

  const mapBattleControllerRef = useRef<MapBattleController | null>(null)
  /** 胜利结算关闭弹窗时再同 id 重生野怪 */
  const pendingRespawnEnemyIdRef = useRef<number | null>(null)
  const manualFleeRequestedRef = useRef(false)
  const lastManualFleeRequestAtRef = useRef(0)
  const autoFleePendingRef = useRef(false)
  const autoFleeConsumedMapRef = useRef(false)
  const mapBattleEndedRef = useRef(false)
  const nextAttackSkillRef = useRef<string | null>(null)
  nextAttackSkillRef.current = nextAttackSkillId
  /** 自动化模式中：不弹胜利/失败结算，直接继续下一场 */
  const automationModeRef = useRef(false)
  automationModeRef.current = !!automationTask
  /** 战斗 timer ID（用于自动化重启时清理） */
  const battleTimerRef = useRef<number | null>(null)
  const cdTimerRef = useRef<number | null>(null)
  const tickTimeoutRef = useRef<number | null>(null)

  const [battleTimeSec, setBattleTimeSec] = useState(0)
  /** 结算用：battle-core 已推进的 tick（墙钟不足 1s 时仍可读） */
  const [lastBattleTickCount, setLastBattleTickCount] = useState(0)
  const [battleSpeed, setBattleSpeed] = useState<BattleSpeedMultiplier>(1)
  const battleSpeedRef = useRef<BattleSpeedMultiplier>(1)
  battleSpeedRef.current = battleSpeed
  const [floatTexts, setFloatTexts] = useState<MapFloatText[]>([])
  const [moveFx, setMoveFx] = useState<MapMoveFx[]>([])
  const [projectileFx, setProjectileFx] = useState<MapProjectileFx[]>([])
  const [impactFx, setImpactFx] = useState<MapImpactFx[]>([])
  const [playerCombatFx, setPlayerCombatFx] = useState<CombatFxState>({
    anim: 'idle',
    untilMs: 0,
    offsetX: 0,
    offsetY: 0,
  })
  const [enemyCombatFx, setEnemyCombatFx] = useState<Record<number, CombatFxState>>({})
  const projectileTargetByCommandRef = useRef<Record<string, { target: 'player' | 'enemy' }>>({})
  const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null)
  const [, setCdUiTick] = useState(0)

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
      setFloatTexts([])
      setMoveFx([])
      setProjectileFx([])
      setImpactFx([])
      setPlayerCombatFx({ anim: 'idle', untilMs: 0, offsetX: 0, offsetY: 0 })
      setEnemyCombatFx({})
      projectileTargetByCommandRef.current = {}
    }
  }, [showBattle])

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
        if (data.defaultMapId) {
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
          setEnemies(data.enemies)
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
        // - has background: hide grid by default; only show blocked cells faintly to help navigation
        if (hasBg) {
          if (blocked) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)'
            ctx.lineWidth = 1
            ctx.strokeRect(dx, dy, cellW, cellH)
          }
        } else {
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

  // 初始化敌人位置
  useEffect(() => {
    const initial: Record<number, { x: number; y: number }> = {}
    const facings: Record<number, RotationKey> = {}
    enemies.forEach(e => {
      initial[e.id] = { x: e.x, y: e.y }
      facings[e.id] = ROTATION_KEYS[Math.abs(e.id) % ROTATION_KEYS.length]
    })
    setEnemyPositions(initial)
    setEnemyFacings(facings)
    enemyTargetsRef.current = { ...initial }
  }, [enemies])

  // NPC 平滑巡逻：持续移动（非跳格），并根据位移实时转向
  useEffect(() => {
    const tickMs = 80
    const speedCellPerSec = 0.95
    const moveInterval = window.setInterval(() => {
      setEnemyPositions((prev) => {
        const next = { ...prev }
        const facingUpdates: Record<number, RotationKey> = {}
        const nextTargets = { ...enemyTargetsRef.current }

        enemies.forEach((enemy) => {
          if (showBattle && combatEnemyId !== null && enemy.id === combatEnemyId) return

          const from = next[enemy.id] ?? { x: enemy.x, y: enemy.y }
          let target = nextTargets[enemy.id] ?? from

          let dx = target.x - from.x
          let dy = target.y - from.y
          let distance = Math.hypot(dx, dy)

          if (distance < 0.02) {
            const baseX = Math.round(from.x)
            const baseY = Math.round(from.y)
            const candidates = [
              { x: baseX + 1, y: baseY },
              { x: baseX - 1, y: baseY },
              { x: baseX, y: baseY + 1 },
              { x: baseX, y: baseY - 1 },
            ].filter((c) => isWalkable(c.x, c.y, { ignoreEnemyIds: [enemy.id] }))

            if (candidates.length > 0) {
              target = candidates[Math.floor(Math.random() * candidates.length)]
              nextTargets[enemy.id] = target
              dx = target.x - from.x
              dy = target.y - from.y
              distance = Math.hypot(dx, dy)
            }
          }

          if (distance <= 0) {
            next[enemy.id] = from
            return
          }

          const step = (speedCellPerSec * tickMs) / 1000
          const move = Math.min(step, distance)
          const nx = from.x + (dx / distance) * move
          const ny = from.y + (dy / distance) * move
          next[enemy.id] = { x: nx, y: ny }
          facingUpdates[enemy.id] = resolveDirectionByDelta(nx - from.x, ny - from.y)
        })

        if (Object.keys(facingUpdates).length > 0) {
          setEnemyFacings((prevFacing) => ({ ...prevFacing, ...facingUpdates }))
        }
        enemyTargetsRef.current = nextTargets
        return next
      })
    }, tickMs)

    return () => window.clearInterval(moveInterval)
  }, [combatEnemyId, enemies, isWalkable, showBattle])

  // 敌人随机消息
  useEffect(() => {
    const msgInterval = setInterval(() => {
      const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)]
      if (randomEnemy) {
        const randomMsg = ENEMY_MESSAGES[Math.floor(Math.random() * ENEMY_MESSAGES.length)]
        setEnemyMessages(prev => ({ ...prev, [randomEnemy.id]: randomMsg }))
        // 3秒后清除消息
        setTimeout(() => {
          setEnemyMessages(prev => {
            const next = { ...prev }
            delete next[randomEnemy.id]
            return next
          })
        }, 3000)
      }
    }, 5000)
    return () => clearInterval(msgInterval)
  }, [enemies])

  // 玩家键盘移动增强：支持 WASD + 方向键 控制移动，并保持按移动方向切换朝向
  useEffect(() => {
    const CONTROL_KEYS = new Set([
      'w',
      'a',
      's',
      'd',
      'arrowup',
      'arrowdown',
      'arrowleft',
      'arrowright',
    ])

    const CODE_TO_KEY: Record<string, string> = {
      keyw: 'w',
      keya: 'a',
      keys: 's',
      keyd: 'd',
      arrowup: 'arrowup',
      arrowdown: 'arrowdown',
      arrowleft: 'arrowleft',
      arrowright: 'arrowright',
    }
    const resolveControlKey = (e: KeyboardEvent): string => {
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : ''
      if (CONTROL_KEYS.has(key)) return key
      const code = typeof e.code === 'string' ? e.code.toLowerCase() : ''
      return CODE_TO_KEY[code] ?? ''
    }
    const isTypingInEditableField = (): boolean => {
      const el = document.activeElement
      if (!el || !(el instanceof HTMLElement)) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      return el.isContentEditable
    }
    const debugInput = (...args: unknown[]) => {
      if (typeof window === 'undefined') return
      if ((window as Window & { __MAP_DEBUG_INPUT__?: boolean }).__MAP_DEBUG_INPUT__) {
        console.debug('[map-input]', ...args)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = resolveControlKey(e)
      if (!key) return
      e.preventDefault()
      if (!(key in keysRef.current)) return
      keysRef.current[key] = true
      debugInput('keydown', { key: e.key, code: e.code, resolved: key, keys: { ...keysRef.current } })
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = resolveControlKey(e)
      if (!key) return
      e.preventDefault()
      if (!(key in keysRef.current)) return
      keysRef.current[key] = false
      debugInput('keyup', { key: e.key, code: e.code, resolved: key, keys: { ...keysRef.current } })
    }

    const move = () => {
      if (showBattle) {
        debugInput('skip:showBattle')
        return
      }
      if (isTypingInEditableField()) {
        debugInput('skip:typing')
        return
      }

      const k = keysRef.current
      const dx = (k.d || k.arrowright ? 1 : 0) + (k.a || k.arrowleft ? -1 : 0)
      const dy = (k.s || k.arrowdown ? 1 : 0) + (k.w || k.arrowup ? -1 : 0)
      if (dx === 0 && dy === 0) return

      // 只走直线；同时按下时按“先纵后横”规则取一轴，避免对角穿模
      const stepDx = dy !== 0 ? 0 : Math.sign(dx)
      const stepDy = dy !== 0 ? Math.sign(dy) : 0
      if (stepDx === 0 && stepDy === 0) return

      const now = Date.now()
      if (now - lastKeyboardMoveAtRef.current < 90) {
        debugInput('skip:cooldown')
        return
      }
      lastKeyboardMoveAtRef.current = now

      const p = playerPosRef.current
      const baseX = Math.floor(p.x)
      const baseY = Math.floor(p.y)
      const nx = baseX + stepDx
      const ny = baseY + stepDy
      if (!isWalkableRef.current(nx, ny)) {
        debugInput('skip:notWalkable', { from: { x: p.x, y: p.y }, to: { x: nx, y: ny } })
        return
      }

      setPlayerFacing(resolveDirectionByDelta(stepDx, stepDy))
      setPlayerPos({ x: nx, y: ny })
      debugInput('move', { from: { x: p.x, y: p.y }, to: { x: nx, y: ny } })
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    const handleBlur = () => {
      Object.keys(keysRef.current).forEach((k) => {
        keysRef.current[k] = false
      })
      debugInput('blur:reset')
    }
    window.addEventListener('blur', handleBlur)
    const intervalId = window.setInterval(move, 130)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', handleBlur)
    }
  }, [setPlayerFacing, setPlayerPos, showBattle])

  // battle-core tick：仅在地图上更新交战双方格子坐标（无 Phaser、无全屏遮罩）
  // 必须用 combatEnemyId 而非 nearbyEnemy：拉扯后双方距离会超过 INTERACTION_RANGE，
  // nearbyEnemy 会被置空，若本 effect 依赖它会 cleanup 并停掉 scheduleTick，表现为战斗卡死。
  useEffect(() => {
    if (!showBattle || !battleGridAnchor || combatEnemyId == null || !mounted) {
      mapBattleControllerRef.current = null
      return
    }
    // 重置结束标记，确保新战斗的 runTick 能正常推进
    mapBattleEndedRef.current = false

    const battleEnemy = enemies.find((e) => e.id === combatEnemyId)
    if (!battleEnemy) {
      mapBattleControllerRef.current = null
      return
    }

    mapBattleEndedRef.current = false
    autoFleePendingRef.current = false
    autoFleeConsumedMapRef.current = false

    /** 交战双方走位仍由 battle-core 处理；此处仅把「未参战」的野怪格当成地形外的阻挡，避免穿怪 */
    const isWalkableForBattle = (gx: number, gy: number) => {
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

    const cfg = {
      mapWidth: mapInfo.width,
      mapHeight: mapInfo.height,
      isWalkable: isWalkableForBattle,
      playerName: `战士 Lv.${playerLevel}`,
      playerGrid: { ...battleGridAnchor.player },
      playerStats: totalStats,
      playerHp: playerHP,
      playerMp: playerMP,
      playerMaxMp: playerMaxMp,
      playerSkillIds: getAvailableSkills().filter((s) => s.action === 'cast_skill' && !!s.coreSkillId).map((s) => s.coreSkillId!),
      enemyName: battleEnemy.name,
      enemyId: `enemy-${battleEnemy.id}`,
      enemyGrid: { ...battleGridAnchor.enemy },
      enemyStats: enemyCombatStats,
    }
    const ctrl = new MapBattleController(cfg)
    mapBattleControllerRef.current = ctrl
    setBattleTimeSec(0)
    setLastBattleTickCount(0)
    setFloatTexts([])
    setBattleLog((prev) => [...prev, '准备阶段开始'])

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

    const pushFloat = (item: Omit<MapFloatText, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setFloatTexts((prev) => [...prev, { ...item, id }])
      window.setTimeout(() => {
        setFloatTexts((prev) => prev.filter((h) => h.id !== id))
      }, 1050)
    }

    const pushMoveFx = (item: Omit<MapMoveFx, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setMoveFx((prev) => [...prev, { ...item, id }])
      window.setTimeout(() => {
        setMoveFx((prev) => prev.filter((h) => h.id !== id))
      }, 380)
    }

    const pushProjectileFx = (item: Omit<MapProjectileFx, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setProjectileFx((prev) => [...prev, { ...item, id }])
      window.setTimeout(() => {
        setProjectileFx((prev) => prev.filter((h) => h.id !== id))
      }, item.durationMs + 80)
      return id
    }

    const pushImpactFx = (item: Omit<MapImpactFx, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setImpactFx((prev) => [...prev, { ...item, id }])
      window.setTimeout(() => {
        setImpactFx((prev) => prev.filter((h) => h.id !== id))
      }, item.kind === 'dodge' ? 420 : 320)
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
            `自动逃跑触发：敌方单次伤害 ${lastEnemyDamage} 超过当前生命值 10%（阈值 ${Math.floor(autoFleeDamageThreshold)}）`,
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
        setBattleLog((prev) => [...prev, '准备阶段结束'])
      }
      const evStart = Math.max(0, s.events.length - step.newEventCount)

      setPlayerHP(s.left.resources.hp)
      setPlayerMP(s.left.resources.mp)
      setEnemyHP(s.right.resources.hp)
      // 战斗中保留小数坐标，避免位移被整格取整吞掉导致“看起来不动”。
      setPlayerPos({ x: s.left.position.x, y: s.left.position.y })
      if (s.phase === 'preparation') {
        // 准备阶段仅调整朝向：双方相互面向，不改任何坐标。
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
          const actorRole = roleByEntityId(actorId)
          const targetRole = roleByEntityId(targetId)
          const actorPos = posByEntityId(actorId)
          const targetPos = posByEntityId(targetId)
          const action = String(ev.payload.action ?? '')
          const skillId = String(ev.payload.skillId ?? '')
          if (actorRole && targetRole && actorPos && targetPos) {
            // 攻击/施法发生时强制对向目标，避免位移后出现背对背出手。
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
          const actStr = actionLabel(ev.payload.action)
          const md = (ev.payload.metadata ?? {}) as Record<string, unknown>
          const strategy = strategyLabel(md.strategy)
          const reason = reasonLabel(md.reason)
          const actorName = actorId === 'poc-player' ? '玩家' : '敌方'
          const head = `${actorName}${actStr}`
          const parts = [head]
          if (strategy) parts.push(`[${strategy}]`)
          // metadata.reason 与「玩家+行动名」同文案时不重复拼接（否则「玩家普通攻击 · 玩家普通攻击」）
          if (reason && reason !== head) parts.push(`· ${reason}`)
          setBattleLog((prev) => [...prev, parts.join(' ')])
        }
        if (ev.type === 'action_executed') {
          const actorId = String(ev.payload.actorId ?? '')
          const action = String(ev.payload.action ?? '')
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
            setBattleLog((prev) => [...prev, `受到 ${dmg} 伤害`])
            if (dmg > 0) {
              pushFloat({
                target: 'player',
                text: `-${dmg}`,
                variant: 'damage',
                offsetX: (Math.random() - 0.5) * 28,
              })
            }
          } else if (tid === s.right.id) {
            setBattleLog((prev) => [...prev, `造成 ${dmg} 伤害`])
            if (dmg > 0) {
              pushFloat({
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
            `追逐开始：${st}→${ex} tick，被追上则逃脱失败（战斗继续）、抵达边缘或拉开≥3.0 则逃脱成功`,
          ])
        }
        if (ev.type === 'chase_resolved') {
          const typ = ev.payload.type
          if (typ === 'captured') {
            setBattleLog((prev) => [...prev, '追逐结束：被追上，逃跑失败，战斗继续'])
          } else if (typ === 'escaped') {
            const by = ev.payload.escapedBy === 'edge' ? '抵达边缘' : '拉开距离'
            setBattleLog((prev) => [...prev, `追逐结束：逃脱（${by}）`])
          } else if (typ === 'escape_failed') {
            setBattleLog((prev) => [...prev, '追逐结束：未满足逃脱条件，战斗继续'])
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
          if (reason === 'flee_failed' && actorId === s.left.id) {
            setBattleLog((prev) => [...prev, '逃跑失败（概率未通过），靠向地图边缘或再次尝试'])
          } else if (actorId === s.left.id) {
            setBattleLog((prev) => [...prev, `玩家行动被拒绝：${rejectReasonLabel(reason)}`])
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

      // 处理自动化任务
      const battleOutcome: 'win' | 'lose' | null = ui === 'win' ? 'win' : ui === 'lose' ? 'lose' : null
      const automationResult = processAutomationAfterBattle(battleOutcome)

      if (automationResult.message) {
        setBattleLog((prev) => [...prev, automationResult.message!])
      }

      if (automationResult.continue) {
        // 自动化模式：弹结算UI，但用 useEffect 自动点 Continue
        if (ui === 'win') {
          pendingRespawnEnemyIdRef.current = combatEnemyId
          completeMapBattleVictory('战斗胜利！')
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
          finalizeMapBattleFleeSuccess({ successMessage: '成功脱离战斗。', clearBattleLog: false })
        }
      } else {
        // 非自动化模式：正常弹结算UI
        if (ui === 'win') {
          pendingRespawnEnemyIdRef.current = combatEnemyId
          completeMapBattleVictory('战斗胜利！')
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
          finalizeMapBattleFleeSuccess({ successMessage: '成功脱离战斗。', clearBattleLog: false })
        }
        cancelAutomation()
      }
    }

    scheduleTick()

    return () => {
      clearTimers()
      mapBattleControllerRef.current = null
    }
    // 会话由 battleSessionNonce / combatEnemyId 标识；仅依赖开战瞬间与地图尺寸。
    // 勿加入 HP/坐标/playerPos，否则会每 tick 重建控制器导致战斗卡死。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showBattle,
    battleSessionNonce,
    mounted,
    battleGridAnchor,
    combatEnemyId,
    mapInfo.width,
    mapInfo.height,
    mapInfo.collision,
    mapInfo.ground,
    mapInfo.tileset?.id,
  ])

  // 检测附近敌人（使用动态位置）
  useEffect(() => {
    // 战斗中坐标由 battle-core 驱动，若用距离判定会清空 nearbyEnemy，进而误伤其它逻辑；开战时 nearbyEnemy 已由 startBattle 设置
    if (showBattle) return
    const found = enemies.find(enemy => {
      const pos = enemyPositions[enemy.id] || { x: enemy.x, y: enemy.y }
      const dx = pos.x - playerPos.x
      const dy = pos.y - playerPos.y
      return Math.sqrt(dx * dx + dy * dy) < INTERACTION_RANGE
    })
    setNearbyEnemy(found || null)
    setShowInteraction(!!found)
  }, [playerPos, enemies, enemyPositions, setNearbyEnemy, setShowInteraction, playerLevel, showBattle])

  /** 自动化：检测到附近敌人时自动开始战斗 */
  useEffect(() => {
    if (!automationTask) return
    if (showBattle) return
    if (!nearbyEnemy) return
    const ep = enemyPositions[nearbyEnemy.id] || { x: nearbyEnemy.x, y: nearbyEnemy.y }
    startBattle({ player: { ...playerPos }, enemy: { ...ep } })
  }, [automationTask, showBattle, nearbyEnemy, enemyPositions, playerPos, startBattle])

  /** 击败后保留同一 id，换名/换属性/换出生点，相当于野点刷新 */
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
            visualId: e.visualId === 'archerGreen' ? 'warriorBlue' : e.visualId,
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
    // 回到大地图前收敛为整格，确保寻路/碰撞继续按网格语义工作。
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

  /** 自动化：结算页面出现时，自动点击 Continue */
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
        setBattleLog((logPrev) => [...logPrev, `已就绪：下次行动使用「${skill.name}」`])
        return skill.id
      })
    },
    [isGameOver, skillCooldownEndAt, setNextAttackSkillId, setBattleLog],
  )

  // 点击地图移动（可走格内）
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (showBattle) return
    const rect = e.currentTarget.getBoundingClientRect()
    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    if (
      localX < renderOffsetX ||
      localY < renderOffsetY ||
      localX > renderOffsetX + renderWidth ||
      localY > renderOffsetY + renderHeight
    ) {
      return
    }
    const px = (localX - renderOffsetX) / Math.max(1, renderWidth)
    const py = (localY - renderOffsetY) / Math.max(1, renderHeight)
    const x = Math.min(mapInfo.width - 1, Math.max(0, Math.floor(px * mapInfo.width)))
    const y = Math.min(mapInfo.height - 1, Math.max(0, Math.floor(py * mapInfo.height)))
    if (!isWalkable(x, y)) return
    setPlayerFacing(resolveDirectionByDelta(x - playerPos.x, y - playerPos.y))
    setPlayerPos({ x, y })
  }

  const enemyLevelRangeMin = Math.max(1, playerLevel - 2)
  const enemyLevelRangeMax = Math.max(1, playerLevel - 1)

  const handlePixellabSync = useCallback(async () => {
    setPixellabSyncHint('同步中…')
    try {
      const res = await fetch('/api/pixellab-sync', { method: 'POST' })
      const data = (await res.json()) as { ok?: boolean; copiedFiles?: number; errors?: string[] }
      if (data.ok) {
        setPixellabSyncHint(`已同步 ${data.copiedFiles ?? 0} 个文件`)
      } else {
        setPixellabSyncHint(data.errors?.[0] ?? '同步未完成')
      }
      const mapRes = await fetch(`/api/airpg-map?map=${encodeURIComponent(selectedMapId)}`)
      if (mapRes.ok) {
        const d = (await mapRes.json()) as {
          enemies: typeof enemies
          playerVisualId?: MapCharacterVisualId
        }
        if (d.playerVisualId) setPlayerVisualId(d.playerVisualId)
        if (d.enemies?.length) setEnemies(d.enemies)
      }
    } catch (e) {
      setPixellabSyncHint(e instanceof Error ? e.message : '同步失败')
    }
    window.setTimeout(() => setPixellabSyncHint(null), 4200)
  }, [selectedMapId, setEnemies])

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      {/* 全屏地图：画布与角色同一视口、同一坐标系，避免「浮在地图外一层」 */}
      <div
        ref={mapViewportRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleMapClick}
      >
        <canvas ref={mapCanvasRef} className="absolute inset-0 z-0 block h-full w-full" />
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {/* 敌人标记 - SSR 时使用固定位置避免 hydration 不匹配 */}
          {enemies.map(enemy => {
            const pos = mounted ? (enemyPositions[enemy.id] || { x: enemy.x, y: enemy.y }) : { x: enemy.x, y: enemy.y }
            const message = mounted ? enemyMessages[enemy.id] : undefined
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
                className="absolute pointer-events-none z-20"
                style={{
                  left: `${gridToScreen(pos.x, pos.y).x}px`,
                  top: `${gridToScreen(pos.x, pos.y).y}px`,
                  transform: 'translate(-50%, -50%)',
                  ...enemyTransitionStyle,
                }}
              >
                {/* 消息气泡 */}
                {message && (
                  <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-yellow-100 border-2 border-orange-500 rounded-lg px-3 py-1 text-xs text-gray-800 whitespace-nowrap animate-bounce shadow-lg z-50">
                    {message}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-orange-500" />
                  </div>
                )}
                {(() => {
                  const facing = enemyFacings[enemy.id] || DEFAULT_DIRECTION
                  const vid = enemy.visualId
                  const plMeta = typeof vid === 'string' && vid.startsWith('pixellab:') ? pixelLabPacks[vid] : undefined
                  const movedAt = enemyLastMoveAt[enemy.id]
                  const nowMs = Date.now()
                  const fx = enemyCombatFx[enemy.id]
                  const activeFx = fx && nowMs < fx.untilMs ? fx : null
                  const isWalking = movedAt !== undefined && Date.now() - movedAt < 480
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
                  /* 非 PixelLab：统一用 battle-poc public/enemy 方向精灵（gif/png） */
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
                        target.onerror = null
                        // If a frame is missing (incomplete export), fall back to idle.
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

          {/* 玩家标记 - SSR 使用固定默认值避免 hydration 不匹配 */}
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
                    aria-label="你"
                  />
                ) : (
                  <div
                    className="object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]"
                    style={mapCharacterIdleStyle(playerVisualId, actorPx)}
                    role="img"
                    aria-label="你"
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
                  alt="你"
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
              你
            </div>
          </div>

          {/* 战斗飘字（伤害 / 治疗），与网格角色对齐 */}
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
              知道了
            </button>
          </div>
        </div>
      )}

      {/* 左上角玩家信息 */}
      <div
        onClick={() => setShowCharacter(true)}
        className="absolute top-4 left-4 z-20 bg-gray-900/80 backdrop-blur-md rounded-xl p-4 border border-blue-500/30 min-w-48 cursor-pointer hover:bg-gray-900/90 transition-colors"
      >
        <div className="flex items-center gap-3 mb-3">
          <img src="/player/idle/south.png" alt="Player" className="w-12 h-12 object-contain rounded-lg bg-gray-800" />
          <div>
            <div className="text-white font-bold">战士</div>
            <div className="text-yellow-400 text-sm">Lv.{playerLevel}</div>
          </div>
        </div>
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>HP</span>
              <span>{playerHP}/{totalStats.maxHp}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${(playerHP / totalStats.maxHp) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>MP</span>
              <span>{playerMP}/{playerMaxMp}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${(playerMP / Math.max(1, playerMaxMp)) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-yellow-300 text-xs">💰 {playerGold} 金币</div>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 rounded-lg border border-sky-500/40 bg-black/60 px-3 py-2 text-xs text-sky-100">
        地图: {mapInfo.mapId} · {mapInfo.width}x{mapInfo.height}（网格）{tilesetReady ? ' · 精灵图' : ' · 回退渲染'}
      </div>
      <div className="absolute top-16 right-4 z-20 rounded-lg border border-sky-500/40 bg-black/60 px-3 py-2 text-xs text-sky-100">
        <label className="mr-2">地图</label>
        <select
          className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-100"
          value={selectedMapId}
          onChange={(e) => setSelectedMapId(e.target.value)}
        >
          {availableMaps.map((map) => (
            <option key={map.id} value={map.id}>
              {map.id}
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
          同步 PixelLab 资源
        </button>
        <button
          type="button"
          onClick={() => setShowPixellabMapGen(true)}
          className="rounded bg-sky-700/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-600"
        >
          生成 PixelLab 地图
        </button>
        <button
          type="button"
          onClick={() => setShowCollisionEditor(true)}
          className="rounded bg-emerald-700/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
        >
          编辑碰撞
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

      {/* 右下角 Dock：深色圆角方块，active 为橙色+绿色描边；悬停左侧气泡标签
          z-index 高于 Chat 侧栏，保证在侧栏开启时仍可切换 */}
      <div className="pointer-events-auto absolute bottom-6 right-4 z-[60] flex flex-col items-center gap-2">
        {dockItems.map(({ id, label, Icon }) => {
          const active = dockPanel === id
          return (
            <div key={id} className="oc-dock-btn-wrap relative">
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => setDockPanel(active ? null : id)}
                className={`oc-dock-btn ${active ? 'oc-dock-btn-active' : ''}`}
              >
                <Icon size={18} strokeWidth={2.2} />
              </button>
              <span className="oc-dock-tooltip">{label}</span>
            </div>
          )
        })}
      </div>

      {dockPanel && <DockFeatureModal game={game} />}

      {/* 大地图战斗：无跳转、无全屏遮罩；仅底部一条操作条 + 结算卡片（不铺幕布） */}
      {showBattle && (
        <>
          <div className="pointer-events-auto fixed bottom-4 left-4 z-30 flex h-[clamp(320px,58vh,560px)] w-[clamp(240px,28vw,380px)] flex-col rounded-xl border border-amber-500/60 bg-slate-900/95 px-2 py-2 shadow-xl">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 text-[11px] text-amber-100">
              <span className="font-semibold">战斗中 · battle-core session</span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className="text-sky-300">MP {playerMP}/{playerMaxMp}</span>
                <span className="text-slate-500">速度</span>
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
              {!isGameOver && (
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
                  逃跑
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
                <div className="mt-1 text-slate-400">MP: {hoveredSkill.mpCost} · 冷却: {hoveredSkill.cooldownTicks}t</div>
                {/* 射程保留：当前大地图战斗模式先不做前端射程判定，仍以 domain/engine 为准 */}
                <div className="text-slate-500">射程: {hoveredSkill.range ?? '-'}（保留）</div>
              </div>
            )}
            <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-black/45 px-2 py-1.5">
              <div className="mb-1 border-b border-white/10 pb-1 text-[11px] font-semibold text-slate-200">战斗日志</div>
              <div className="h-[calc(100%-1.5rem)] overflow-y-auto pr-1 text-[11px] leading-snug text-slate-300">
                {battleLog.length === 0 ? (
                  <div className="text-slate-500">等待战斗事件...</div>
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

      {/* 交互按钮（战斗中隐藏，由底部技能栏操作） */}
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

      {/* 敌人信息弹窗 */}
      <EnemyInfoModal
        open={!!(showEnemyInfo && nearbyEnemy)}
        enemyName={nearbyEnemy?.name ?? 'Enemy'}
        enemyPreview={enemyPreview}
        onClose={() => setShowEnemyInfo(false)}
      />
    </main>
  )
}
