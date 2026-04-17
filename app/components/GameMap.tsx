'use client'

import { useEffect, useRef, useState } from 'react'
import { GameState } from '../hooks/useGameState'
import { INTERACTION_RANGE, calcEnemyStats } from '../constants'
import type { DockPanelId } from '../hooks/useGameState'
import DockFeatureModal from './DockFeatureModal'

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

const toPlayerSpritePath = (direction: RotationKey) => `/player/${direction}.png`
const toEnemySpritePath = (direction: RotationKey) => `/enemy/${direction}.png`

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
    playerLevel,
    playerHP,
    totalStats,
    playerGold,
    setShowCharacter,
    fleeSuccessMessage,
    dismissFleeSuccessMessage,
    dockPanel,
    setDockPanel,
  } = game

  const dockItems: { id: DockPanelId; label: string; icon: string }[] = [
    { id: 'achievements', label: '成就', icon: '🏆' },
    { id: 'log', label: '日志', icon: '📜' },
    { id: 'chat', label: '聊天', icon: '💬' },
    { id: 'battle_system', label: '战斗系统', icon: '⚔️' },
    { id: 'character_login', label: '角色登录', icon: '👤' },
  ]

  useEffect(() => {
    if (!fleeSuccessMessage) return
    const t = window.setTimeout(() => dismissFleeSuccessMessage(), 4500)
    return () => window.clearTimeout(t)
  }, [fleeSuccessMessage, dismissFleeSuccessMessage])

  const [enemyPreviewLevel, setEnemyPreviewLevel] = useState(1)
  const keysRef = useRef<Record<string, boolean>>({ w: false, a: false, s: false, d: false })
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

  // 避免 SSR hydration 不匹配
  useEffect(() => {
    setMounted(true)
  }, [])

  // 敌人独立位置状态（用于随机移动）
  const [enemyPositions, setEnemyPositions] = useState<Record<number, { x: number; y: number }>>({})
  // 敌人消息气泡
  const [enemyMessages, setEnemyMessages] = useState<Record<number, string>>({})
  const [enemyFacings, setEnemyFacings] = useState<Record<number, RotationKey>>({})
  const [playerFacing, setPlayerFacing] = useState<RotationKey>(DEFAULT_DIRECTION)

  const isWalkable = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= mapInfo.width || y >= mapInfo.height) return false
    const idx = y * mapInfo.width + x
    return mapInfo.collision[idx] !== 1
  }

  const mapAspect = mapInfo.width / Math.max(1, mapInfo.height)
  const viewAspect = viewportSize.width / Math.max(1, viewportSize.height)
  const renderWidth =
    viewAspect > mapAspect ? Math.floor(viewportSize.height * mapAspect) : Math.floor(viewportSize.width)
  const renderHeight =
    viewAspect > mapAspect ? Math.floor(viewportSize.height) : Math.floor(viewportSize.width / mapAspect)
  const renderOffsetX = Math.max(0, Math.floor((viewportSize.width - renderWidth) / 2))
  const renderOffsetY = Math.max(0, Math.floor((viewportSize.height - renderHeight) / 2))

  const gridToScreen = (x: number, y: number) => ({
    x: renderOffsetX + ((x + 0.5) / mapInfo.width) * renderWidth,
    y: renderOffsetY + ((y + 0.5) / mapInfo.height) * renderHeight,
  })

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
          enemies: Array<{
            id: number
            name: string
            x: number
            y: number
            level: number
            profile?: { maxHp?: number | null; atk?: number | null; def?: number | null; spd?: number | null }
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
        setPlayerPos({
          x: Math.max(0, Math.min(data.width - 1, Math.round(data.playerSpawn.x))),
          y: Math.max(0, Math.min(data.height - 1, Math.round(data.playerSpawn.y))),
        })
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
        const blocked = mapInfo.collision[idx] === 1
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
  }, [enemies])

  // 敌人随机移动
  useEffect(() => {
    const moveInterval = setInterval(() => {
      setEnemyPositions(prev => {
        const next = { ...prev }
        const facingUpdates: Record<number, RotationKey> = {}
        enemies.forEach(enemy => {
          if (!next[enemy.id]) return
          const from = next[enemy.id]
          const candidates = [
            { x: from.x + 1, y: from.y },
            { x: from.x - 1, y: from.y },
            { x: from.x, y: from.y + 1 },
            { x: from.x, y: from.y - 1 },
          ].filter(c => isWalkable(c.x, c.y))
          if (candidates.length === 0) return
          const pick = candidates[Math.floor(Math.random() * candidates.length)]
          next[enemy.id] = pick
          facingUpdates[enemy.id] = resolveDirectionByDelta(pick.x - from.x, pick.y - from.y)
        })
        if (Object.keys(facingUpdates).length > 0) {
          setEnemyFacings(prevFacing => ({ ...prevFacing, ...facingUpdates }))
        }
        return next
      })
    }, 2000)
    return () => clearInterval(moveInterval)
  }, [enemies, mapInfo.collision, mapInfo.height, mapInfo.width])

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

  // 键盘移动：网格步进
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (!(key in keysRef.current)) return
      if (e.repeat) return
      keysRef.current[key] = true
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (!(key in keysRef.current)) return
      keysRef.current[key] = false
    }

    const move = () => {
      const k = keysRef.current
      let nx = playerPos.x
      let ny = playerPos.y
      if (k.w) ny -= 1
      else if (k.s) ny += 1
      else if (k.a) nx -= 1
      else if (k.d) nx += 1
      if (nx === playerPos.x && ny === playerPos.y) return
      if (!isWalkable(nx, ny)) return
      setPlayerFacing(resolveDirectionByDelta(nx - playerPos.x, ny - playerPos.y))
      setPlayerPos({ x: nx, y: ny })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    const intervalId = window.setInterval(move, 130)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isWalkable, playerPos.x, playerPos.y, setPlayerPos])

  // 检测附近敌人（使用动态位置）
  useEffect(() => {
    const found = enemies.find(enemy => {
      const pos = enemyPositions[enemy.id] || { x: enemy.x, y: enemy.y }
      const dx = pos.x - playerPos.x
      const dy = pos.y - playerPos.y
      return Math.sqrt(dx * dx + dy * dy) < INTERACTION_RANGE
    })
    setNearbyEnemy(found || null)
    setShowInteraction(!!found)
    // 缓存敌人预览等级（开战为玩家−1～−2，用中位作属性代表）
    if (found) {
      setEnemyPreviewLevel(Math.max(1, playerLevel - 1))
    }
  }, [playerPos, enemies, enemyPositions, setNearbyEnemy, setShowInteraction, playerLevel])

  // 点击地图移动（所有区域可达）
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
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

  const getEnemyPreviewLevel = () => {
    // SSR 时使用稳定值避免 hydration 不匹配
    if (!mounted) return 1
    if (!nearbyEnemy) return enemyPreviewLevel
    return Math.max(1, playerLevel - 1)
  }

  const getEnemyPreviewStats = () => {
    if (nearbyEnemy?.profile?.maxHp || nearbyEnemy?.profile?.atk || nearbyEnemy?.profile?.def || nearbyEnemy?.profile?.spd) {
      return {
        maxHp: Math.max(1, Math.round(nearbyEnemy.profile.maxHp ?? calcEnemyStats(Math.max(1, playerLevel - 1)).maxHp)),
        atk: Math.max(1, Math.round(nearbyEnemy.profile.atk ?? calcEnemyStats(Math.max(1, playerLevel - 1)).atk)),
        def: Math.max(0, Math.round(nearbyEnemy.profile.def ?? calcEnemyStats(Math.max(1, playerLevel - 1)).def)),
        spd: Math.max(1, Math.round(nearbyEnemy.profile.spd ?? calcEnemyStats(Math.max(1, playerLevel - 1)).spd)),
      }
    }
    const lv = !mounted ? 1 : Math.max(1, playerLevel - 1)
    return calcEnemyStats(lv)
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      {/* 全屏地图背景 */}
      <div
        ref={mapViewportRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleMapClick}
      >
        <canvas ref={mapCanvasRef} className="h-full w-full" />
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
          <div className="text-yellow-300 text-xs">💰 {playerGold} 金币</div>
        </div>
      </div>

      {/* 出生点标记 */}
      <div
        className="absolute bottom-0 left-0 pointer-events-none"
        style={{ left: '15%', bottom: '20%' }}
      >
        <div className="w-20 h-20 border-2 border-orange-500/50 rounded-full animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-orange-400 bg-black/50 px-2 py-1 rounded">出生点</span>
        </div>
      </div>

      {/* 敌人标记 - SSR 时使用固定位置避免 hydration 不匹配 */}
      {enemies.map(enemy => {
        const pos = mounted ? (enemyPositions[enemy.id] || { x: enemy.x, y: enemy.y }) : { x: enemy.x, y: enemy.y }
        const message = mounted ? enemyMessages[enemy.id] : undefined
        return (
          <div
            key={enemy.id}
            className="absolute pointer-events-none"
            style={{
              left: `${gridToScreen(pos.x, pos.y).x}px`,
              top: `${gridToScreen(pos.x, pos.y).y}px`,
            }}
          >
            {/* 消息气泡 */}
            {message && (
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-yellow-100 border-2 border-orange-500 rounded-lg px-3 py-1 text-xs text-gray-800 whitespace-nowrap animate-bounce shadow-lg z-50">
                {message}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-orange-500" />
              </div>
            )}
            <img
              src={toEnemySpritePath(enemyFacings[enemy.id] || DEFAULT_DIRECTION)}
              alt={enemy.name}
              className="h-12 w-12 animate-pulse object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
              onError={(e) => {
                const target = e.currentTarget
                target.onerror = null
                target.src = toEnemySpritePath(DEFAULT_DIRECTION)
              }}
            />
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-red-400 bg-black/70 px-2 py-0.5 rounded whitespace-nowrap">
              {enemy.name} Lv.{enemyLevelRangeMin}~{enemyLevelRangeMax}
            </div>
          </div>
        )
      })}

      {/* 玩家标记 - SSR 使用固定默认值避免 hydration 不匹配 */}
      <div
        className="absolute pointer-events-none transition-all duration-200"
        style={{
          left: mounted ? `${gridToScreen(playerPos.x, playerPos.y).x}px` : '15%',
          top: mounted ? `${gridToScreen(playerPos.x, playerPos.y).y}px` : '80%',
        }}
      >
        <img
          src={toPlayerSpritePath(playerFacing)}
          alt="你"
          className="h-8 w-8 object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]"
          onError={(e) => {
            const target = e.currentTarget
            target.onerror = null
            target.src = toPlayerSpritePath(DEFAULT_DIRECTION)
          }}
        />
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-white bg-black/70 px-2 py-0.5 rounded whitespace-nowrap">
          你
        </div>
      </div>

      {/* 左下角 home-left */}
      <div className="absolute bottom-0 left-0 z-20 pointer-events-none">
        <img src="/home-left.png" alt="home-left" className="w-auto h-auto" />
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

      {/* 右下角：五个小图标自上而下（悬停见名称） */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-40 flex flex-col items-center gap-1 rounded-xl border-2 border-yellow-500/50 bg-gray-900/90 p-1.5 shadow-lg backdrop-blur-sm">
        {dockItems.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={dockPanel === item.id}
            onClick={() => setDockPanel(dockPanel === item.id ? null : item.id)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[15px] leading-none transition-colors ${
              dockPanel === item.id
                ? 'border-amber-400 bg-amber-500/35 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.5)]'
                : 'border-transparent bg-gray-800/90 text-gray-100 hover:bg-gray-700 hover:border-gray-600'
            }`}
          >
            <span aria-hidden className="select-none">
              {item.icon}
            </span>
          </button>
        ))}
      </div>

      {dockPanel && <DockFeatureModal game={game} />}

      {/* 交互按钮 */}
      {showInteraction && nearbyEnemy && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="flex gap-4 pointer-events-auto">
            <button
              onClick={startBattle}
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
                  Lv.{enemyLevelRangeMin}～{enemyLevelRangeMax}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">类型</span>
                <span className="font-bold text-red-400">恶魔族</span>
              </div>
              <div className="text-xs text-gray-500 -mt-1 mb-1">
                以下为 Lv.{getEnemyPreviewLevel()} 参考（成长较角色 +20%）
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">HP</span>
                <span className="font-bold text-green-400">{getEnemyPreviewStats().maxHp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">攻击</span>
                <span className="font-bold text-red-400">{getEnemyPreviewStats().atk}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">防御</span>
                <span className="font-bold text-blue-400">{getEnemyPreviewStats().def}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">速度</span>
                <span className="font-bold text-yellow-400">{getEnemyPreviewStats().spd}</span>
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
