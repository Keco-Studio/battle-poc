'use client'

import { useEffect, useRef, useState } from 'react'
import { GameState } from '../hooks/useGameState'
import { COLLISION_SCALE, INTERACTION_RANGE } from '../constants'

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
  } = game

  const collisionCanvasRef = useRef<HTMLCanvasElement>(null)
  const [collisionMap, setCollisionMap] = useState<boolean[][]>([])
  const [enemyPreviewLevel, setEnemyPreviewLevel] = useState(1)
  const keysRef = useRef<Record<string, boolean>>({ w: false, a: false, s: false, d: false })
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

  // 加载障碍图
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = '/black-white.jpg'
    img.onload = () => {
      const canvas = collisionCanvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = img.width / COLLISION_SCALE
      canvas.height = img.height / COLLISION_SCALE

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      const map: boolean[][] = []
      for (let y = 0; y < canvas.height; y++) {
        const row: boolean[] = []
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4
          const isBlack = data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128
          row.push(isBlack)
        }
        map.push(row)
      }

      setCollisionMap(map)
    }
  }, [])

  // 检查位置是否可通行
  const isWalkable = (x: number, y: number): boolean => {
    if (collisionMap.length === 0) return true

    const canvasWidth = collisionMap[0]?.length || 0
    const canvasHeight = collisionMap.length

    const px = Math.floor((x / 100) * canvasWidth)
    const py = Math.floor((y / 100) * canvasHeight)

    if (px < 0 || px >= canvasWidth || py < 0 || py >= canvasHeight) {
      return false
    }

    return !collisionMap[py][px]
  }

  // 检查移动是否有效
  const canMoveTo = (x: number, y: number): boolean => {
    if (x < 0 || x > 100 || y < 0 || y > 100) return false
    const radius = 2
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (!isWalkable(x + dx, y + dy)) return false
      }
    }
    return true
  }

  // 键盘移动
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key in keysRef.current) keysRef.current[key] = true
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key in keysRef.current) keysRef.current[key] = false
    }

    const move = () => {
      const speed = 1.5
      let dx = 0, dy = 0
      if (keysRef.current.w) dy -= speed
      if (keysRef.current.s) dy += speed
      if (keysRef.current.a) dx -= speed
      if (keysRef.current.d) dx += speed

      if (dx !== 0 || dy !== 0) {
        setPlayerPos(prev => {
          const newX = Math.max(0, Math.min(100, prev.x + dx))
          const newY = Math.max(0, Math.min(100, prev.y + dy))
          if (!canMoveTo(newX, newY)) {
            if (canMoveTo(newX, prev.y)) {
              return { x: newX, y: prev.y }
            }
            if (canMoveTo(prev.x, newY)) {
              return { x: prev.x, y: newY }
            }
            return prev
          }
          return { x: newX, y: newY }
        })
      }
      requestAnimationFrame(move)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    const frameId = requestAnimationFrame(move)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      cancelAnimationFrame(frameId)
    }
  }, [collisionMap, setPlayerPos])

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
    // 缓存敌人预览等级
    if (found) {
      setEnemyPreviewLevel(Math.max(1, playerLevel - 1 - Math.floor(Math.random() * 2)))
    }
  }, [playerPos, enemies, enemyPositions, setNearbyEnemy, setShowInteraction, playerLevel])

  // 点击地图移动
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    if (canMoveTo(x, y)) {
      setPlayerPos({ x, y })
    }
  }

  const getEnemyPreviewLevel = () => {
    // SSR 时使用稳定值避免 hydration 不匹配
    if (!mounted) return 1
    if (!nearbyEnemy) return enemyPreviewLevel
    const diff = 1 + (nearbyEnemy.id % 2)
    return Math.max(1, playerLevel - diff)
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <canvas ref={collisionCanvasRef} style={{ display: 'none' }} />

      {/* 全屏地图背景 */}
      <div
        className="absolute inset-0 bg-cover bg-center cursor-crosshair"
        style={{ backgroundImage: "url('/home-bg.png')" }}
        onClick={handleMapClick}
      />

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

      {/* 敌人标记 */}
      {enemies.map(enemy => {
        // 敌人实际等级 = max(1, 玩家等级 - 1到2级)，使用敌人ID作为种子保持一致
        const diff = 1 + (enemy.id % 2) // 敌人1用1，敌人2用2
        const actualLevel = Math.max(1, playerLevel - diff)
        const pos = enemyPositions[enemy.id] || { x: enemy.x, y: enemy.y }
        const message = enemyMessages[enemy.id]
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
              {enemy.name} Lv.{actualLevel}
            </div>
          </div>
        )
      })}

      {/* 玩家标记 */}
      <div
        className="absolute pointer-events-none transition-all duration-200"
        style={{ left: `${playerPos.x}%`, top: `${playerPos.y}%` }}
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
                <span className="font-bold text-yellow-400">Lv.{getEnemyPreviewLevel()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">类型</span>
                <span className="font-bold text-red-400">恶魔族</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">HP</span>
                <span className="font-bold text-green-400">{30 + getEnemyPreviewLevel() * 10}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">攻击</span>
                <span className="font-bold text-red-400">{3 + getEnemyPreviewLevel() * 2}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">防御</span>
                <span className="font-bold text-blue-400">{2 + getEnemyPreviewLevel() * 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">速度</span>
                <span className="font-bold text-yellow-400">{2 + getEnemyPreviewLevel() * 1}</span>
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
