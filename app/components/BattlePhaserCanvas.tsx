'use client'

import { useEffect, useRef } from 'react'
import * as Phaser from 'phaser'
import { GAME_CONFIG } from '@/src/renderer/phaser/config'
import { BattleScene } from '@/src/renderer/phaser/BattleScene'
import type { BattleVisualState } from '@/src/renderer/phaser/battleVisualTypes'

type Props = {
  stateRef: React.MutableRefObject<BattleVisualState>
  className?: string
}

export function BattlePhaserCanvas({ stateRef, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    const config: Phaser.Types.Core.GameConfig = {
      ...GAME_CONFIG,
      parent: containerRef.current,
    }
    const game = new Phaser.Game(config)
    gameRef.current = game
    let disposed = false

    game.events.once('ready', () => {
      if (disposed || gameRef.current !== game) return

      const sceneManager = game.scene
      const existing = sceneManager.getScene('BattleScene')
      if (existing) {
        sceneManager.start('BattleScene', { getState: () => stateRef.current })
        return
      }

      sceneManager.add('BattleScene', new BattleScene(), true, {
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
      aria-label="Battle scene"
    />
  )
}
