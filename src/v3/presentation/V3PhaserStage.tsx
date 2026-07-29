'use client'

import { useEffect, useRef, useState } from 'react'

import type { V3MoveIntent, V3ViewModel } from './viewModel'

export type V3PhaserStageProps = {
  viewModel: V3ViewModel
  onMoveIntent: (intent: V3MoveIntent) => void
  onEncounter: (encounterId: string) => void
  onAnimationComplete: (eventId: string) => void
  className?: string
}

export function V3PhaserStage({
  viewModel,
  onMoveIntent,
  onEncounter,
  onAnimationComplete,
  className,
}: V3PhaserStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<import('phaser').Game | null>(null)
  const viewModelRef = useRef(viewModel)
  const callbackRef = useRef({ onMoveIntent, onEncounter, onAnimationComplete })
  const [ready, setReady] = useState(false)

  viewModelRef.current = viewModel
  callbackRef.current = { onMoveIntent, onEncounter, onAnimationComplete }

  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (!containerRef.current || gameRef.current) return
      const [Phaser, { V3WorldScene }] = await Promise.all([
        import('phaser'),
        import('./V3WorldScene'),
      ])
      if (cancelled || !containerRef.current) return

      const scene = new V3WorldScene({
        getViewModel: () => viewModelRef.current,
        onMoveIntent: (intent) => callbackRef.current.onMoveIntent(intent),
        onEncounter: (encounterId) => callbackRef.current.onEncounter(encounterId),
        onAnimationComplete: (eventId) => callbackRef.current.onAnimationComplete(eventId),
      })
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 1280,
        height: 720,
        transparent: true,
        pixelArt: true,
        roundPixels: true,
        render: { antialias: false, pixelArt: true, roundPixels: true },
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        physics: {
          default: 'arcade',
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scene: [scene],
      })
      gameRef.current = game
      game.events.once(Phaser.Core.Events.READY, () => {
        if (!cancelled) setReady(true)
      })
    }

    void boot()
    return () => {
      cancelled = true
      gameRef.current?.destroy(true)
      gameRef.current = null
      setReady(false)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="v3-phaser-stage"
      data-ready={ready ? 'true' : 'false'}
      role="application"
      aria-label="星辉边境像素战场"
      tabIndex={0}
      onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
      style={{ width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', imageRendering: 'pixelated' }}
    />
  )
}
