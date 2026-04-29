import { useEffect, useRef } from 'react'
import { resolveDirectionByDelta, type RotationKey } from '@/app/components/map-ui/gameMapUtils'

type GridPos = { x: number; y: number }

type UseMapKeyboardMovementParams = {
  showBattle: boolean
  playerPos: GridPos
  isWalkable: (x: number, y: number) => boolean
  setPlayerFacing: (facing: RotationKey) => void
  setPlayerPos: (pos: GridPos) => void
}

export function useMapKeyboardMovement({
  showBattle,
  playerPos,
  isWalkable,
  setPlayerFacing,
  setPlayerPos,
}: UseMapKeyboardMovementParams): void {
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
  const lastKeyboardMoveAtRef = useRef(0)
  const playerPosRef = useRef(playerPos)
  playerPosRef.current = playerPos
  const isWalkableRef = useRef(isWalkable)
  isWalkableRef.current = isWalkable

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
      if (isTypingInEditableField()) return
      e.preventDefault()
      if (!(key in keysRef.current)) return
      keysRef.current[key] = true
      debugInput('keydown', { key: e.key, code: e.code, resolved: key, keys: { ...keysRef.current } })
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = resolveControlKey(e)
      if (!key) return
      if (isTypingInEditableField()) return
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

      // Keep axis-aligned movement to avoid diagonal clipping.
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
}
