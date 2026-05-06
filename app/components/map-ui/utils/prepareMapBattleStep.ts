import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { snapPositionToWalkable } from '@/src/map-battle/walkability'
import { BASIC_ATTACK } from '@/app/constants'

export function prepareMapBattleStep(params: {
  controller: any
  isPVPMode: boolean
  manualFleeRequestedRef: MutableRefObject<boolean>
  autoFleePendingRef: MutableRefObject<boolean>
  autoFleeConsumedMapRef: MutableRefObject<boolean>
  nextAttackSkillId: string | null
  setNextAttackSkillId: Dispatch<SetStateAction<string | null>>
  setSkillCooldownEndAt: Dispatch<SetStateAction<Record<string, number>>>
  setBattleLog: Dispatch<SetStateAction<string[]>>
  mapWidth: number
  mapHeight: number
  isWalkableForBattle: (x: number, y: number) => boolean
}): { step: any; session: any } {
  const {
    controller: c,
    isPVPMode,
    manualFleeRequestedRef,
    autoFleePendingRef,
    autoFleeConsumedMapRef,
    nextAttackSkillId,
    setNextAttackSkillId,
    setSkillCooldownEndAt,
    setBattleLog,
    mapWidth,
    mapHeight,
    isWalkableForBattle,
  } = params

  const left = c.session.left.resources
  const right = c.session.right.resources
  const leftHpRatio = left.maxHp > 0 ? left.hp / left.maxHp : 1
  const hasCombatStarted = c.session.events.some((ev: any) => ev.type === 'action_executed' || ev.type === 'damage_applied')
  const latestEnemyDamageToPlayer = [...c.session.events]
    .reverse()
    .find(
      (ev: any) =>
        ev.type === 'damage_applied' &&
        String(ev.payload.actorId ?? '') === c.session.right.id &&
        String(ev.payload.targetId ?? '') === c.session.left.id,
    )
  const lastEnemyDamage = latestEnemyDamageToPlayer ? Math.max(0, Number(latestEnemyDamageToPlayer.payload.damage ?? 0)) : 0
  const autoFleeDamageThreshold = Math.max(1, left.hp * 0.1)
  const shouldAutoFlee =
    !isPVPMode &&
    hasCombatStarted &&
    left.hp > 0 &&
    right.hp > 0 &&
    leftHpRatio <= 0.38 &&
    lastEnemyDamage > autoFleeDamageThreshold &&
    c.session.chaseState.status !== 'flee_pending'
  if (shouldAutoFlee) {
    autoFleePendingRef.current = true
    if (!autoFleeConsumedMapRef.current) {
      autoFleeConsumedMapRef.current = true
      setBattleLog((prev) => [
        ...prev,
        `Auto-flee triggered: Enemy single damage ${lastEnemyDamage} exceeds 10% of current HP (threshold ${Math.floor(autoFleeDamageThreshold)})`,
      ])
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
    nextAttackSkillId,
    pendingFlee: manualFleeRequestedRef.current || autoFleePendingRef.current,
    pendingFleeSource,
    onClearQueuedSkill: () => setNextAttackSkillId(null),
    onSkillCooldown: (skillId: string, ms: number) => {
      if (skillId === BASIC_ATTACK.id || ms <= 0) return
      setSkillCooldownEndAt((prev) => ({ ...prev, [skillId]: Date.now() + ms }))
    },
  })

  manualFleeRequestedRef.current = false
  autoFleePendingRef.current = false

  const snappedLeft = snapPositionToWalkable({
    pos: step.session.left.position,
    mapW: mapWidth,
    mapH: mapHeight,
    isWalkable: isWalkableForBattle,
  })
  const snappedRight = snapPositionToWalkable({
    pos: step.session.right.position,
    mapW: mapWidth,
    mapH: mapHeight,
    isWalkable: isWalkableForBattle,
  })
  const session = {
    ...step.session,
    left: { ...step.session.left, position: snappedLeft },
    right: { ...step.session.right, position: snappedRight },
  }
  c.session = session

  return { step, session }
}
