import { useCallback, useState } from 'react'

export type CombatAnim = 'idle' | 'attack' | 'cast' | 'hit'

export type CombatFxState = {
  anim: CombatAnim
  untilMs: number
  offsetX: number
  offsetY: number
}

type CombatVector = { x: number; y: number }

type TriggerCombatFxOptions = {
  toward?: CombatVector
  from?: CombatVector
  durationMs?: number
}

type TriggerCombatFxInput = {
  nowMs: number
  anim: CombatAnim
  opts?: TriggerCombatFxOptions
}

const DEFAULT_COMBAT_FX: CombatFxState = {
  anim: 'idle',
  untilMs: 0,
  offsetX: 0,
  offsetY: 0,
}

export function buildCombatFxState({ nowMs, anim, opts }: TriggerCombatFxInput): CombatFxState {
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
  return {
    anim,
    untilMs: nowMs + durationMs,
    offsetX,
    offsetY,
  }
}

export function useMapCombatFx(): {
  playerCombatFx: CombatFxState
  enemyCombatFx: Record<number, CombatFxState>
  resetCombatFx: () => void
  triggerCombatFx: (
    role: 'player' | 'enemy',
    anim: CombatAnim,
    enemyId: number | null,
    opts?: TriggerCombatFxOptions,
  ) => void
} {
  const [playerCombatFx, setPlayerCombatFx] = useState<CombatFxState>(DEFAULT_COMBAT_FX)
  const [enemyCombatFx, setEnemyCombatFx] = useState<Record<number, CombatFxState>>({})

  const resetCombatFx = useCallback(() => {
    setPlayerCombatFx(DEFAULT_COMBAT_FX)
    setEnemyCombatFx({})
  }, [])

  const triggerCombatFx = useCallback(
    (role: 'player' | 'enemy', anim: CombatAnim, enemyId: number | null, opts?: TriggerCombatFxOptions) => {
      const nextFx = buildCombatFxState({ nowMs: Date.now(), anim, opts })
      if (role === 'player') {
        setPlayerCombatFx(nextFx)
        return
      }
      if (enemyId !== null) {
        setEnemyCombatFx((prev) => ({ ...prev, [enemyId]: nextFx }))
      }
    },
    [],
  )

  return {
    playerCombatFx,
    enemyCombatFx,
    resetCombatFx,
    triggerCombatFx,
  }
}
