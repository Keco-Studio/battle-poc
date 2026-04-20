'use client'

import { useEffect, useRef } from 'react'
import * as Phaser from 'phaser'
import { GAME_CONFIG } from '@/src/renderer/phaser/config'
import { MapBattleScene } from '@/src/renderer/phaser/MapBattleScene'
import type { MapBattleVisualState } from '@/src/renderer/phaser/battleVisualTypes'

type Props = {
  stateRef: React.MutableRefObject<MapBattleVisualState>
  className?: string
}

/** 大地图战斗层：客户端动态加载 Phaser，避免 SSR 访问 DOM */
export function MapBattlePhaserCanvas({ stateRef, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    // 必须与大地图 tile 画布叠层：禁用 GAME_CONFIG 的不透明底色，否则会整块盖住地图背景
    const { backgroundColor: _bg, ...restGameConfig } = GAME_CONFIG
    const config: Phaser.Types.Core.GameConfig = {
      ...restGameConfig,
      parent: containerRef.current,
      width: Math.max(320, containerRef.current.clientWidth || 800),
      height: Math.max(240, containerRef.current.clientHeight || 600),
      transparent: true,
      backgroundColor: 'rgba(0,0,0,0)',
    }
    const game = new Phaser.Game(config)
    gameRef.current = game
    let disposed = false

    game.events.once('ready', () => {
      if (disposed || gameRef.current !== game) return

      const sceneManager = game.scene
      const existing = sceneManager.getScene('MapBattleScene')
      if (existing) {
        sceneManager.start('MapBattleScene', { getState: () => stateRef.current })
        return
      }

      sceneManager.add('MapBattleScene', new MapBattleScene(), true, {
        getState: () => stateRef.current,
      })
    })

    return () => {
      disposed = true
      game.destroy(true)
      if (gameRef.current === game) {
        gameRef.current = null
      }
    }
  }, [stateRef])

  return (
    <div
      ref={containerRef}
      className={className}
      tabIndex={0}
      role="application"
      aria-label="地图战斗演出"
    />
  )
}
