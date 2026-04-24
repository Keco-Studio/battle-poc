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

/** Map battle layer: client-side dynamic Phaser loading to avoid SSR DOM access */
export function MapBattlePhaserCanvas({ stateRef, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    // Must overlay with map tile canvas: disable GAME_CONFIG's opaque background, otherwise it would completely cover the map background
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
      aria-label="Map battle presentation"
    />
  )
}
