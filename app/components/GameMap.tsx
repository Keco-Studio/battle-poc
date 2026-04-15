'use client'

import { useEffect, useRef, useState } from 'react'
import { GameState } from '../hooks/useGameState'
import { INTERACTION_RANGE, calcEnemyStats } from '../constants'
import type { DockPanelId } from '../hooks/useGameState'
import DockFeatureModal from './DockFeatureModal'

interface Props {
  game: GameState
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
  /** 逻辑坐标（0–100），供键盘增量与点击 teleport 共用 */
  const posRef = useRef({ x: playerPos.x, y: playerPos.y })
  const [mounted, setMounted] = useState(false)

  // 避免 SSR hydration 不匹配
  useEffect(() => {
    setMounted(true)
  }, [])

  // 敌人独立位置状态（用于随机移动）
  const [enemyPositions, setEnemyPositions] = useState<Record<number, { x: number; y: number }>>({})
  // 敌人消息气泡
  const [enemyMessages, setEnemyMessages] = useState<Record<number, string>>({})

  // 初始化敌人位置
  useEffect(() => {
    const initial: Record<number, { x: number; y: number }> = {}
    enemies.forEach(e => {
      initial[e.id] = { x: e.x, y: e.y }
    })
    setEnemyPositions(initial)
  }, [enemies])

  // 敌人随机移动
  useEffect(() => {
    const moveInterval = setInterval(() => {
      setEnemyPositions(prev => {
        const next = { ...prev }
        enemies.forEach(enemy => {
          if (!next[enemy.id]) return
          // 2x2范围内随机移动
          const dx = (Math.random() - 0.5) * 4
          const dy = (Math.random() - 0.5) * 4
          const newX = Math.max(0, Math.min(100, next[enemy.id].x + dx))
          const newY = Math.max(0, Math.min(100, next[enemy.id].y + dy))
          next[enemy.id] = { x: newX, y: newY }
        })
        return next
      })
    }, 2000)
    return () => clearInterval(moveInterval)
  }, [enemies])

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

  // 键盘移动：稳定「每秒速度」——用 Δt（秒）积分，不用帧数（帧率波动时仍匀速）
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

    /** 地图 0–100 坐标下，与 160px/s 同量纲的每秒变化量（原 (160/1600)*100） */
    const speedMapUnitsPerSec = (160 / 1600) * 100
    /** 单帧最多按 1/30 秒积分，避免卡顿时 Δt 过大瞬移 */
    const maxDtSec = 1 / 30

    let lastTime = performance.now()
    let rafId = 0
    let active = true

    const move = (time: number) => {
      if (!active) return

      const rawSec = (time - lastTime) / 1000
      lastTime = time
      const dt = Math.min(Math.max(rawSec, 0), maxDtSec)

      let mx = 0
      let my = 0
      const k = keysRef.current
      if (k.w) my -= 1
      if (k.s) my += 1
      if (k.a) mx -= 1
      if (k.d) mx += 1

      if (mx !== 0 || my !== 0) {
        if (mx !== 0 && my !== 0) {
          const inv = 1 / Math.SQRT2
          mx *= inv
          my *= inv
        }
        let nx = posRef.current.x + mx * speedMapUnitsPerSec * dt
        let ny = posRef.current.y + my * speedMapUnitsPerSec * dt
        nx = Math.max(0, Math.min(100, nx))
        ny = Math.max(0, Math.min(100, ny))
        posRef.current = { x: nx, y: ny }
        setPlayerPos({ x: nx, y: ny })
      }

      rafId = requestAnimationFrame(move)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    rafId = requestAnimationFrame(move)

    return () => {
      active = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [setPlayerPos])

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
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    posRef.current = { x, y }
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
    const lv = !mounted ? 1 : Math.max(1, playerLevel - 1)
    return calcEnemyStats(lv)
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      {/* 全屏地图背景 */}
      <div
        className="absolute inset-0 bg-cover bg-center cursor-crosshair"
        style={{ backgroundImage: "url('/home-bg.png')" }}
        onClick={handleMapClick}
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
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            {/* 消息气泡 */}
            {message && (
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-yellow-100 border-2 border-orange-500 rounded-lg px-3 py-1 text-xs text-gray-800 whitespace-nowrap animate-bounce shadow-lg z-50">
                {message}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-orange-500" />
              </div>
            )}
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center animate-pulse">
              <div className="w-8 h-8 bg-red-500/60 rounded" />
            </div>
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-red-400 bg-black/70 px-2 py-0.5 rounded whitespace-nowrap">
              {enemy.name} Lv.{enemyLevelRangeMin}~{enemyLevelRangeMax}
            </div>
          </div>
        )
      })}

      {/* 玩家标记 - SSR 使用固定默认值避免 hydration 不匹配 */}
      <div
        className="absolute pointer-events-none transition-all duration-200"
        style={{ left: mounted ? `${playerPos.x}%` : '15%', top: mounted ? `${playerPos.y}%` : '80%' }}
      >
        <div className="w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-lg shadow-blue-500/50" />
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-white bg-black/70 px-2 py-0.5 rounded whitespace-nowrap">
          你
        </div>
      </div>

      {/* 左下角 home-left */}
      <div className="absolute bottom-0 left-0 z-20 pointer-events-none">
        <img src="/home-left.png" alt="home-left" className="w-auto h-auto" />
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
