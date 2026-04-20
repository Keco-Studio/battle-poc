'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, ScrollText, MessageSquare, Swords, User } from 'lucide-react'
import { GameState } from '../hooks/useGameState'
import {
  INTERACTION_RANGE,
  BASIC_ATTACK,
  getSkillById,
  createEnemyEncounter,
  type Skill,
  type Enemy,
  type MapCharacterVisualId,
} from '../constants'
import type { DockPanelId } from '../hooks/useGameState'
import DockFeatureModal from './DockFeatureModal'
import { MapBattleController } from '../../src/map-battle/MapBattleController'
import { isDemoDungeonCellWalkable, snapGridSpawnToWalkable } from '../../src/map-battle/dungeonDemoFootTiles'
import { snapPositionToWalkable } from '../../src/map-battle/walkability'
import { mapCharacterIdleStyle, mapTileSpriteStyle } from '../lib/mapEntitySpriteStyles'

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

function EnemyMapAvatar({
  enemy,
  facing,
  tileset,
}: {
  enemy: Enemy
  facing: RotationKey
  tileset: MapTileset | null
}) {
  if (enemy.visualId) {
    return (
      <div
        className="h-12 w-12 animate-pulse object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
        style={mapCharacterIdleStyle(enemy.visualId, 48)}
        role="img"
        aria-label={enemy.name}
      />
    )
  }
  const idx = enemy.mapSpriteTileIndex
  const ts = tileset
  if (ts && typeof idx === 'number' && idx > 0) {
    const imageUrl = ts.publicImagePath ?? ts.imagePath
    if (imageUrl.startsWith('/') || imageUrl.startsWith('http')) {
      return (
        <div
          className="h-12 w-12 animate-pulse object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
          style={mapTileSpriteStyle(
            {
              imageUrl,
              columns: ts.columns,
              tileWidth: ts.tileWidth,
              tileHeight: ts.tileHeight,
              tileCount: ts.tileCount,
              tileIndex: idx,
            },
            48,
          )}
          role="img"
          aria-label={enemy.name}
        />
      )
    }
  }
  return (
    <img
      src={toEnemyGifPath(facing)}
      alt={enemy.name}
      className="h-12 w-12 animate-pulse object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
      onError={(e) => {
        const target = e.currentTarget
        target.onerror = null
        target.src = toEnemySpritePath(facing)
      }}
    />
  )
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

const toEnemyGifPath = (direction: RotationKey) => `/enemy/${direction}.gif`
const toEnemySpritePath = (direction: RotationKey) => `/enemy/${direction}.png`

const toPixelLabPreviewPath = (visualId: string) =>
  `/assets/characters/${encodeURIComponent(visualId.slice('pixellab:'.length))}.png`

type PixelLabPackMeta = {
  id: string
  imageSize: { width: number; height: number }
  framesPerDirection: number
  layout?: { rows?: number; cols?: number }
}

type PixelLabPackRuntime = {
  id: string
  frameW: number
  frameH: number
  rows: number
  cols: number
  sheetUrl: string
}

const PIXELLAB_ROW_BY_FACING: Record<RotationKey, number> = {
  // ai-rpg-poc pack order: south, south-west, west, north-west, north, north-east, east, south-east
  south: 0,
  'south-west': 1,
  west: 2,
  'north-west': 3,
  north: 4,
  'north-east': 5,
  east: 6,
  'south-east': 7,
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
  kind: 'arrow' | 'fireball' | 'arcane_bolt' | 'generic'
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

/** 地图上与战斗同步的格子位移动画时长 */
const BATTLE_MOVE_TRANSITION_MS = 300
const MANUAL_FLEE_DEBOUNCE_MS = 450

type TacticalMode = 'aggressive_finish' | 'kite_and_cast' | 'flee_and_reset' | 'steady_trade'

function strategyLabel(strategy: unknown): string | null {
  if (typeof strategy !== 'string') return null
  const map: Record<TacticalMode, string> = {
    aggressive_finish: '强攻收割',
    kite_and_cast: '拉扯施法',
    flee_and_reset: '撤离重整',
    steady_trade: '稳态换血',
  }
  return map[strategy as TacticalMode] ?? null
}

function reasonLabel(reason: unknown): string | null {
  if (typeof reason !== 'string') return null
  const map: Record<string, string> = {
    manual_flee: '手动逃跑',
    auto_flee: '自动逃跑',
    enemy_cast_control: '敌方控制施法',
    enemy_cast_burst: '敌方爆发施法',
    enemy_dodge_retreat: '敌方规避后撤',
    enemy_dash_retreat: '敌方拉开距离',
    enemy_dash_approach: '敌方贴近走位',
    enemy_dash_kite: '敌方风筝后撤',
    enemy_basic_attack: '敌方普通攻击',
    player_dash_approach: '为技能贴近走位',
    player_dash_kite: '为技能拉扯后撤',
    player_dodge_retreat: '玩家规避后撤',
    player_basic_attack: '玩家普通攻击',
    player_basic_attack_fallback: '技能不可用，回退普攻',
    player_defend: '玩家防御',
    player_cast_skill: '玩家施放技能',
  }
  return map[reason] ?? reason
}

function rejectReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    battle_ended: '战斗已结束',
    actor_not_found: '执行者不存在',
    actor_dead: '执行者已阵亡',
    actor_controlled: '处于受控状态',
    target_not_found: '目标不存在',
    target_out_of_range: '超出射程',
    not_enough_stamina: '耐力不足',
    not_enough_mp: '法力不足',
    missing_skill_id: '技能参数缺失',
    skill_not_found: '技能不存在',
    skill_not_equipped: '技能未装备',
    skill_on_cooldown: '技能冷却中',
    flee_failed: '逃跑概率未通过',
    action_not_implemented: '动作未实现',
  }
  return map[reason] ?? reason
}

function actionLabel(action: unknown): string {
  if (typeof action !== 'string') return '行动'
  if (action === 'basic_attack') return '普通攻击'
  if (action === 'cast_skill') return '施放技能'
  if (action === 'defend') return '防御'
  if (action === 'dash') return '位移'
  if (action === 'dodge') return '闪避'
  if (action === 'flee') return '逃跑'
  return action
}

// 敌人消息
const ENEMY_MESSAGES = [
  '我是魔王我很强！',
  '再看就把你吃掉！',
  '劝你早点逃跑吧...',
  '这片区域是我的！',
  '哼，不自量力的人类',
  '别惹我，我很危险！',
  '你已经引起了我的注意',
  '愚蠢的冒险者...',
]

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
    battleResult,
    gainedExp,
    gainedGold,
    getAvailableSkills,
    finalizeMapBattleFleeSuccess,
    closeBattle,
    completeMapBattleVictory,
    completeMapBattleDefeat,
    battleLootDrop,
    combatEnemyId,
    setEnemyLevel,
    setEnemyCombatStats,
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
  const [syncStatus, setSyncStatus] = useState<{ state: 'idle' | 'syncing' | 'ok' | 'error'; message?: string }>({ state: 'idle' })
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
  /** 地图 JSON `config.playerVisualId`，缺省为弓手 */
  const [playerMapVisual, setPlayerMapVisual] = useState<MapCharacterVisualId>('archerGreen')

  // 避免 SSR hydration 不匹配
  useEffect(() => {
    setMounted(true)
  }, [])

  const syncPixelLabAssets = useCallback(async () => {
    if (syncStatus.state === 'syncing') return
    setSyncStatus({ state: 'syncing', message: '同步中…' })
    try {
      const res = await fetch('/api/pixellab-sync', { method: 'POST' })
      const data = (await res.json()) as {
        ok?: boolean
        copiedFiles?: number
        skippedFiles?: number
        errors?: string[]
      }
      if (!res.ok || !data.ok) {
        const detail = (data.errors ?? []).slice(0, 2).join(' | ')
        setSyncStatus({ state: 'error', message: `同步失败${detail ? `：${detail}` : ''}` })
        window.setTimeout(() => setSyncStatus({ state: 'idle' }), 4500)
        return
      }
      setSyncStatus({
        state: 'ok',
        message: `同步完成：新增/更新 ${data.copiedFiles ?? 0} 个文件`,
      })
      window.setTimeout(() => setSyncStatus({ state: 'idle' }), 2500)
    } catch (e) {
      setSyncStatus({ state: 'error', message: `同步异常：${e instanceof Error ? e.message : String(e)}` })
      window.setTimeout(() => setSyncStatus({ state: 'idle' }), 4500)
    }
  }, [syncStatus.state])

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

  // PixelLab packs cache: visualId -> spritesheet info
  const [pixelLabPacks, setPixelLabPacks] = useState<Record<string, PixelLabPackRuntime>>({})
  // Used to decide walk vs idle (move in last N ms)
  const enemyLastMoveAtRef = useRef<Record<number, number>>({})

  const pixelLabEnemyVisualIds = useMemo(() => {
    const vids = enemies
      .map((e) => e.visualId)
      .filter((v): v is `pixellab:${string}` => typeof v === 'string' && v.startsWith('pixellab:'))
    return Array.from(new Set(vids))
  }, [enemies])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (pixelLabEnemyVisualIds.length === 0) return
      const missing = pixelLabEnemyVisualIds.filter((vid) => !pixelLabPacks[String(vid)])
      if (missing.length === 0) return
      await Promise.all(
        missing.map(async (vid) => {
          const id = String(vid).slice('pixellab:'.length)
          if (!id) return
          try {
            const metaUrl = `/assets/characters/packs/${encodeURIComponent(id)}/meta.json`
            const metaRes = await fetch(metaUrl)
            if (!metaRes.ok) return
            const meta = (await metaRes.json()) as PixelLabPackMeta
            const cols = Math.max(1, meta.layout?.cols ?? meta.framesPerDirection ?? 1)
            const rows = Math.max(1, meta.layout?.rows ?? 8)
            const pack: PixelLabPackRuntime = {
              id,
              frameW: meta.imageSize?.width ?? 64,
              frameH: meta.imageSize?.height ?? 64,
              rows,
              cols,
              sheetUrl: `/assets/characters/packs/${encodeURIComponent(id)}/sheet.png`,
            }
            if (!cancelled) {
              setPixelLabPacks((prev) => ({ ...prev, [String(vid)]: pack }))
            }
          } catch (e) {
            console.warn('[battle-poc] load pixellab pack failed:', vid, e)
          }
        }),
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [pixelLabEnemyVisualIds, pixelLabPacks])

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

  // Unified actor sprite display size (player + enemies).
  // We scale with cell size so it feels consistent across maps/viewport sizes.
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
  const projectileTargetByCommandRef = useRef<Record<string, { target: 'player' | 'enemy' }>>({})
  const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null)
  const [, setCdUiTick] = useState(0)

  useEffect(() => {
    if (!showBattle) {
      setFloatTexts([])
      setMoveFx([])
      setProjectileFx([])
      setImpactFx([])
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
        setPlayerMapVisual(data.playerVisualId === 'warriorBlue' ? 'warriorBlue' : 'archerGreen')
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

    const cellW = renderWidth / mapInfo.width
    const cellH = renderHeight / mapInfo.height
    const tileset = mapInfo.tileset
    const useSprite = !!(tileset && tilesetImage && tilesetReady)

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
        if (useSprite && tileId > 0 && tileset && tileId <= tileset.tileCount) {
          const tile = tileId - 1
          const sx = (tile % tileset.columns) * tileset.tileWidth
          const sy = Math.floor(tile / tileset.columns) * tileset.tileHeight
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(tilesetImage!, sx, sy, tileset.tileWidth, tileset.tileHeight, dx, dy, cellW, cellH)
        } else {
          if (tileId >= 40) ctx.fillStyle = 'rgba(71, 85, 105, 0.85)'
          else if (tileId >= 9) ctx.fillStyle = 'rgba(6, 95, 70, 0.85)'
          else ctx.fillStyle = 'rgba(20, 83, 45, 0.85)'
          ctx.fillRect(dx, dy, cellW, cellH)
        }
        ctx.strokeStyle = blocked ? 'rgba(239, 68, 68, 0.35)' : 'rgba(0, 0, 0, 0.18)'
        ctx.lineWidth = 1
        ctx.strokeRect(dx, dy, cellW, cellH)
      }
    }
  }, [
    mapInfo,
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
          const ddx = nx - from.x
          const ddy = ny - from.y
          if (Math.hypot(ddx, ddy) > 0.0005) {
            enemyLastMoveAtRef.current[enemy.id] = Date.now()
          }
          facingUpdates[enemy.id] = resolveDirectionByDelta(ddx, ddy)
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

    const normalizeKey = (rawKey: unknown): string => {
      if (typeof rawKey !== 'string') return ''
      return rawKey.toLowerCase()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = normalizeKey(e.key)
      if (!key) return
      if (!CONTROL_KEYS.has(key)) return
      e.preventDefault()
      if (!(key in keysRef.current)) return
      keysRef.current[key] = true
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = normalizeKey(e.key)
      if (!key) return
      if (!CONTROL_KEYS.has(key)) return
      e.preventDefault()
      if (!(key in keysRef.current)) return
      keysRef.current[key] = false
    }

    const move = () => {
      if (showBattle) return

      const k = keysRef.current
      const dx = (k.d || k.arrowright ? 1 : 0) + (k.a || k.arrowleft ? -1 : 0)
      const dy = (k.s || k.arrowdown ? 1 : 0) + (k.w || k.arrowup ? -1 : 0)
      if (dx === 0 && dy === 0) return

      // 只走直线；同时按下时按“先纵后横”规则取一轴，避免对角穿模
      const stepDx = dy !== 0 ? 0 : Math.sign(dx)
      const stepDy = dy !== 0 ? Math.sign(dy) : 0
      if (stepDx === 0 && stepDy === 0) return

      const now = Date.now()
      if (now - lastKeyboardMoveAtRef.current < 90) return
      lastKeyboardMoveAtRef.current = now

      const nx = playerPos.x + stepDx
      const ny = playerPos.y + stepDy
      if (!isWalkable(nx, ny)) return

      setPlayerPos({ x: nx, y: ny })
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    const intervalId = window.setInterval(move, 130)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
    }
  }, [isWalkable, playerPos.x, playerPos.y, setPlayerPos, showBattle])

  // battle-core tick：仅在地图上更新交战双方格子坐标（无 Phaser、无全屏遮罩）
  // 必须用 combatEnemyId 而非 nearbyEnemy：拉扯后双方距离会超过 INTERACTION_RANGE，
  // nearbyEnemy 会被置空，若本 effect 依赖它会 cleanup 并停掉 scheduleTick，表现为战斗卡死。
  useEffect(() => {
    if (!showBattle || !battleGridAnchor || combatEnemyId == null || !mounted) {
      mapBattleControllerRef.current = null
      return
    }

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

    let battleTimer = 0
    let cdTimer = 0
    let tickTimeout: number | undefined

    const clearTimers = () => {
      window.clearInterval(battleTimer)
      window.clearInterval(cdTimer)
      if (tickTimeout !== undefined) window.clearTimeout(tickTimeout)
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

    battleTimer = window.setInterval(() => setBattleTimeSec((s) => s + 1), 1000)
    cdTimer = window.setInterval(() => setCdUiTick((n) => n + 1), 150)

    const scheduleTick = () => {
      tickTimeout = window.setTimeout(runTick, BASE_BATTLE_TICK_MS / battleSpeedRef.current)
    }

    const runTick = () => {
      const c = mapBattleControllerRef.current
      if (!c || mapBattleEndedRef.current) return
      const prevPlayerPos = { ...c.session.left.position }
      const prevEnemyPos = { ...c.session.right.position }

      const left = c.session.left.resources
      const right = c.session.right.resources
      const leftHpRatio = left.maxHp > 0 ? left.hp / left.maxHp : 1
      const rightHpRatio = right.maxHp > 0 ? right.hp / right.maxHp : 1
      const hasCombatStarted = c.session.events.some((ev) => ev.type === 'action_executed' || ev.type === 'damage_applied')
      const shouldAutoFlee =
        hasCombatStarted &&
        left.hp > 0 &&
        right.hp > 0 &&
        leftHpRatio < 0.3 &&
        rightHpRatio > leftHpRatio &&
        c.session.chaseState.status !== 'flee_pending'
      if (shouldAutoFlee) {
        autoFleePendingRef.current = true
        if (!autoFleeConsumedMapRef.current) {
          autoFleeConsumedMapRef.current = true
          setBattleLog((prev) => [...prev, '自动逃跑触发：我方血量低于 30%，且敌方血量占比更高'])
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
      const evStart = Math.max(0, s.events.length - step.newEventCount)

      setPlayerHP(s.left.resources.hp)
      setPlayerMP(s.left.resources.mp)
      setEnemyHP(s.right.resources.hp)
      // 战斗中保留小数坐标，避免位移被整格取整吞掉导致“看起来不动”。
      setPlayerPos({ x: s.left.position.x, y: s.left.position.y })
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
            let projectileKind: MapProjectileFx['kind'] | null = null
            if (action === 'basic_attack' && actorRole === 'player') {
              projectileKind = 'arrow'
            } else if (action === 'cast_skill' && skillId === 'fireball') {
              projectileKind = 'fireball'
            } else if (action === 'cast_skill' && skillId === 'arcane_bolt') {
              projectileKind = 'arcane_bolt'
            } else if (action === 'cast_skill') {
              projectileKind = 'generic'
            }
            if (projectileKind) {
              pushProjectileFx({
                kind: projectileKind,
                from: actorRole,
                startX: actorPos.x,
                startY: actorPos.y,
                deltaX: targetPos.x - actorPos.x,
                deltaY: targetPos.y - actorPos.y,
                durationMs: projectileKind === 'arrow' ? 300 : 360,
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
        if (ev.type === 'damage_applied') {
          const dmg = Math.max(0, Number(ev.payload.damage ?? 0))
          const commandId = String(ev.payload.commandId ?? '')
          const tid = String(ev.payload.targetId ?? '')
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
          setBattleLog((prev) => [...prev, `追逐开始：${st}→${ex} tick，被追上则败、抵达边缘或拉开≥3.0 则胜`])
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
        setPlayerPos(sep.player)
        setEnemyPositions((prev) => ({ ...prev, [combatEnemyId]: sep.enemy }))
        finalizeMapBattleFleeSuccess({ successMessage: '成功脱离战斗。', clearBattleLog: false })
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
    setPlayerPos({ x, y })
  }

  const enemyLevelRangeMin = Math.max(1, playerLevel - 2)
  const enemyLevelRangeMax = Math.max(1, playerLevel - 1)

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
          {enemies.map((enemy) => {
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
                {message && (
                  <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-yellow-100 border-2 border-orange-500 rounded-lg px-3 py-1 text-xs text-gray-800 whitespace-nowrap animate-bounce shadow-lg z-50">
                    {message}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-orange-500" />
                  </div>
                )}
                {enemy.visualId && typeof enemy.visualId === 'string' && enemy.visualId.startsWith('pixellab:') ? (
                  (() => {
                    const vid = enemy.visualId
                    const pack = pixelLabPacks[vid]
                    const displaySize = actorPx
                    const lastMoveAt = enemyLastMoveAtRef.current[enemy.id] ?? 0
                    const isWalking = Date.now() - lastMoveAt < 220
                    const facing = enemyFacings[enemy.id] || DEFAULT_DIRECTION
                    const row = PIXELLAB_ROW_BY_FACING[facing] ?? 0
                    const col = pack && isWalking && pack.cols >= 2 ? Math.floor((Date.now() / 120) % pack.cols) : 0

                    if (!pack) {
                      return (
                        <img
                          src={toPixelLabPreviewPath(vid)}
                          alt={enemy.name}
                          className="animate-pulse object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
                          style={{ width: displaySize, height: displaySize, imageRendering: 'pixelated' }}
                          onError={(e) => {
                            const target = e.currentTarget
                            target.onerror = null
                            target.src = toEnemySpritePath(facing)
                          }}
                        />
                      )
                    }

                    const scale = displaySize / Math.max(1, pack.frameW)
                    const sheetW = pack.cols * pack.frameW * scale
                    const sheetH = pack.rows * pack.frameH * scale
                    const bgX = -col * pack.frameW * scale
                    const bgY = -row * pack.frameH * scale
                    return (
                      <div
                        aria-label={enemy.name}
                        className="drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
                        style={{
                          width: displaySize,
                          height: displaySize,
                          backgroundImage: `url("${pack.sheetUrl}")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: `${sheetW}px ${sheetH}px`,
                          backgroundPosition: `${bgX}px ${bgY}px`,
                          imageRendering: 'pixelated',
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        }}
                      />
                    )
                  })()
                ) : (
                  <EnemyMapAvatar
                    enemy={enemy}
                    facing={enemyFacings[enemy.id] || DEFAULT_DIRECTION}
                    tileset={mapInfo.tileset}
                  />
                )}
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
            <div
              className="object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]"
              style={mapCharacterIdleStyle(playerMapVisual, Math.max(32, Math.round(actorPx)))}
              role="img"
              aria-label="你"
            />
            <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] text-sky-100 bg-black/75 px-1.5 py-0.5 rounded whitespace-nowrap">
              你
            </div>
          </div>

          {/* 战斗飘字（伤害 / 治疗），与网格角色对齐；z 高于玩家/敌人标记，避免投射物被遮挡 */}
          {showBattle && combatEnemyId !== null && (
            <div className="pointer-events-none absolute inset-0 z-[40] overflow-hidden">
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
          <img src="/player.png" alt="Player" className="w-12 h-12 object-contain rounded-lg bg-gray-800" />
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
        <button
          type="button"
          onClick={syncPixelLabAssets}
          disabled={syncStatus.state === 'syncing'}
          className="ml-2 rounded bg-emerald-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
          title="把 ai-rpg-poc 生成的 PixelLab 素材同步到 battle-poc/public"
        >
          {syncStatus.state === 'syncing' ? '同步中…' : '同步 PixelLab'}
        </button>
      </div>
      {syncStatus.state !== 'idle' && (
        <div
          className={`absolute top-28 right-4 z-20 rounded-lg border px-3 py-2 text-xs ${
            syncStatus.state === 'ok'
              ? 'border-emerald-400/60 bg-emerald-950/80 text-emerald-100'
              : syncStatus.state === 'error'
                ? 'border-red-400/60 bg-red-950/80 text-red-100'
                : 'border-sky-400/60 bg-slate-950/80 text-sky-100'
          }`}
        >
          {syncStatus.message ?? ''}
        </div>
      )}

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
          <div className="pointer-events-auto fixed bottom-20 left-1/2 z-30 w-[min(560px,calc(100vw-1rem))] -translate-x-1/2 rounded-xl border border-amber-500/60 bg-slate-900/95 px-2 py-2 shadow-xl">
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
            <div className="mt-1 max-h-16 overflow-y-auto border-t border-white/10 px-1 pt-1 text-[10px] leading-snug text-slate-300">
              {battleLog.slice(-8).map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </div>

          {isGameOver && (
            <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
              {/* 结果颜色蒙版（胜利淡绿/失败红色 vignette） */}
              <div
                className={`absolute inset-0 ${battleResult === 'win'
                  ? 'bg-emerald-900/40'
                  : 'oc-defeat-vignette'
                  }`}
              />

              {/* 胜利彩带 */}
              {battleResult === 'win' && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <span
                      key={i}
                      className="animate-confetti-fall absolute top-0 h-3 w-2 rounded-sm opacity-90"
                      style={{
                        left: `${(i * 13 + (i % 5) * 7) % 100}%`,
                        animationDelay: `${(i % 10) * 0.08}s`,
                        animationDuration: `${2 + (i % 5) * 0.2}s`,
                        backgroundColor: `hsl(${(i * 37) % 360} 80% 58%)`,
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="relative z-10 flex w-[min(460px,calc(100vw-1rem))] flex-col items-center gap-5 text-center">
                <h2
                  className={`font-arcade text-[44px] leading-none ${battleResult === 'win' ? 'oc-title-victory' : 'oc-title-defeat'
                    }`}
                >
                  {battleResult === 'win' ? 'VICTORY!' : 'DEFEAT'}
                </h2>

                <div className="font-arcade text-[14px] tracking-[0.12em] text-white/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]">
                  {battleResult === 'win' ? (
                    <>
                      <span className="text-yellow-200">◆ YOU DEFEATED </span>
                      <span className="text-orange-300">
                        {nearbyEnemy?.name?.toUpperCase() ?? 'ENEMY'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-yellow-200">◆ YOU WERE DEFEATED BY </span>
                      <span className="text-orange-300">
                        {nearbyEnemy?.name?.toUpperCase() ?? 'ENEMY'}
                      </span>
                    </>
                  )}
                </div>

                {/* 奖励 / 惩罚信息（小卡片） */}
                <div className="flex w-full flex-col gap-1 rounded-xl bg-black/40 px-4 py-2 text-[11px] text-white backdrop-blur-sm">
                  <div>
                    时长{' '}
                    <span className="font-mono font-bold">
                      {battleTimeSec >= 1 ? `${battleTimeSec}s` : '<1s'}
                      {lastBattleTickCount > 0 ? ` · ${lastBattleTickCount} tick` : ''}
                    </span>
                  </div>
                  {battleResult === 'win' && (
                    <div className="text-yellow-200">
                      💰 +{gainedGold} · ⭐ +{gainedExp}
                      {battleLootDrop ? ` · 掉落 ${battleLootDrop.icon} ${battleLootDrop.name}` : ''}
                    </div>
                  )}
                  {battleResult === 'lose' && (
                    <div className="text-rose-200">已失去全部金币；装备与背包保留。</div>
                  )}
                </div>

                <div className="flex w-full max-w-[320px] flex-col gap-3">
                  <button
                    type="button"
                    onClick={finishBattleAndClose}
                    className={`oc-arcade-btn ${battleResult === 'win'
                      ? 'oc-arcade-btn-primary'
                      : 'oc-arcade-btn-danger'
                      }`}
                  >
                    CONTINUE
                  </button>
                  <button
                    type="button"
                    onClick={finishBattleAndClose}
                    className="oc-arcade-btn"
                    style={{
                      background: battleResult === 'win' ? '#fff' : '#0f172a',
                      color: battleResult === 'win' ? '#0f172a' : '#f3f4f6',
                      borderColor: battleResult === 'win' ? '#cbd5e1' : '#7f1d1d',
                      boxShadow:
                        battleResult === 'win'
                          ? '0 4px 0 0 #cbd5e1'
                          : '0 4px 0 0 #7f1d1d',
                    }}
                  >
                    BATTLE AGAIN
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 交互按钮（战斗中隐藏，由底部技能栏操作） */}
      {showInteraction && nearbyEnemy && !showBattle && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="flex gap-4 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                if (!nearbyEnemy) return
                const ep = enemyPositions[nearbyEnemy.id] || { x: nearbyEnemy.x, y: nearbyEnemy.y }
                startBattle({ player: { ...playerPos }, enemy: { ...ep } })
              }}
              className="w-20 h-20 bg-blue-600/80 hover:bg-blue-500/80 backdrop-blur-sm rounded-xl border-2 border-blue-400 flex flex-col items-center justify-center text-white font-bold transition-all hover:scale-105"
            >
              <span className="text-2xl">⚔️</span>
              <span className="text-xs mt-1">挑战</span>
            </button>
            <button
              onClick={() => setShowEnemyInfo(true)}
              className="w-20 h-20 bg-gray-600/80 hover:bg-gray-500/80 backdrop-blur-sm rounded-xl border-2 border-gray-400 flex flex-col items-center justify-center text-white font-bold transition-all hover:scale-105"
            >
              <span className="text-2xl">🔍</span>
              <span className="text-xs mt-1">查看</span>
            </button>
            <button
              onClick={() => setShowInteraction(false)}
              className="w-20 h-20 bg-gray-600/80 hover:bg-gray-500/80 backdrop-blur-sm rounded-xl border-2 border-gray-400 flex flex-col items-center justify-center text-white font-bold transition-all hover:scale-105"
            >
              <span className="text-2xl">←</span>
              <span className="text-xs mt-1">返回</span>
            </button>
          </div>
        </div>
      )}

      {/* 敌人信息弹窗 */}
      {showEnemyInfo && nearbyEnemy && (
        <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/50">
          <div className="bg-gray-900/90 backdrop-blur-md rounded-xl p-6 w-72 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4 text-center">{nearbyEnemy.name}</h3>
            <div className="flex justify-center mb-4">
              <img src="/enemy.png" alt="Enemy" className="h-32 object-contain" />
            </div>
            <div className="space-y-2 text-white">
              <div className="flex justify-between">
                <span className="text-gray-400">等级</span>
                <span className="font-bold text-yellow-400">
                  Lv.{enemyPreview.level}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">类型</span>
                <span className="font-bold text-red-400">恶魔族</span>
              </div>
              <div className="text-xs text-gray-500 -mt-1 mb-1">
                以下为本次遭遇的实际战斗属性
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">HP</span>
                <span className="font-bold text-green-400">{enemyPreview.stats.maxHp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">攻击</span>
                <span className="font-bold text-red-400">{enemyPreview.stats.atk}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">防御</span>
                <span className="font-bold text-blue-400">{enemyPreview.stats.def}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">速度</span>
                <span className="font-bold text-yellow-400">{enemyPreview.stats.spd}</span>
              </div>
            </div>
            <button
              onClick={() => setShowEnemyInfo(false)}
              className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
