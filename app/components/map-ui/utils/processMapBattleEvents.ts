import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { cooldownMsFromTicks, type Skill } from '@/app/constants'
import { rejectReasonLabel } from '../battleText'
import { buildActionExecutedBattleLogLine } from './battleLogUtils'
import { buildProjectileFxInput } from './projectileFxUtils'
import { buildDamageFloatText, buildDamageLogLine, resolveDamageUiSide } from './damageEventUtils'
import { computeCombatFacingUpdate } from './combatEventFacingUtils'
import { resolveActorCombatAnim, toHitFromVector, toTowardVector } from './combatFxEventUtils'
import { shouldApplyDodgeImpact, shouldClearQueuedSkill } from './commandRejectedUtils'
import { deleteCommandMeta, getCommandMeta, setCommandMeta } from './commandMetaUtils'

type GridPos = { x: number; y: number }

type ReceivedCommandMeta = {
  actorId: string
  targetId: string
  action: string
  skillId: string
  metadata: Record<string, unknown>
}

type ProcessParams = {
  session: any
  evStart: number
  combatEnemyId: number
  commandMetaStoreRef: MutableRefObject<Record<string, ReceivedCommandMeta>>
  projectileTargetStoreRef: MutableRefObject<Record<string, { target: 'player' | 'enemy' }>>
  roleByEntityId: (entityId: string) => 'player' | 'enemy' | null
  posByEntityId: (entityId: string) => GridPos | null
  triggerCombatFx: (
    role: 'player' | 'enemy',
    anim: 'idle' | 'attack' | 'cast' | 'hit',
    enemyId: number | null,
    opts?: { toward?: { x: number; y: number }; from?: { x: number; y: number }; durationMs?: number },
  ) => void
  setPlayerFacing: Dispatch<SetStateAction<any>>
  setEnemyFacings: Dispatch<SetStateAction<Record<number, any>>>
  resolveSkillFxProfile: (input: { action: string; skillId: string; actorRole: 'player' | 'enemy' }) => { projectileKind: any; durationMs: number }
  pushProjectileFx: (item: any) => void
  setBattleLog: Dispatch<SetStateAction<string[]>>
  getAvailableSkills: () => Skill[]
  setNextAttackSkillId: Dispatch<SetStateAction<string | null>>
  setSkillCooldownEndAt: Dispatch<SetStateAction<Record<string, number>>>
  pushFloatText: (item: any) => void
  pushImpactFx: (item: any) => void
}

export function processMapBattleEvents(params: ProcessParams): void {
  const {
    session: s,
    evStart,
    combatEnemyId,
    commandMetaStoreRef,
    projectileTargetStoreRef,
    roleByEntityId,
    posByEntityId,
    triggerCombatFx,
    setPlayerFacing,
    setEnemyFacings,
    resolveSkillFxProfile,
    pushProjectileFx,
    setBattleLog,
    getAvailableSkills,
    setNextAttackSkillId,
    setSkillCooldownEndAt,
    pushFloatText,
    pushImpactFx,
  } = params

  for (let i = evStart; i < s.events.length; i++) {
    const ev = s.events[i]
    if (s.phase === 'preparation') continue
    if (ev.type === 'command_received') {
      const commandId = String(ev.payload.commandId ?? '')
      const actorId = typeof ev.payload.actorId === 'string' ? ev.payload.actorId : ''
      const targetId = typeof ev.payload.targetId === 'string' ? ev.payload.targetId : ''
      const action = String(ev.payload.action ?? '')
      const skillId = String(ev.payload.skillId ?? '')
      const metadata = (ev.payload.metadata ?? {}) as Record<string, unknown>
      setCommandMeta(commandMetaStoreRef.current, commandId, {
        actorId,
        targetId,
        action,
        skillId,
        metadata,
      })
    }
    if (ev.type === 'action_executed') {
      const commandId = String(ev.payload.commandId ?? '')
      const actorId = String(ev.payload.actorId ?? '')
      const action = String(ev.payload.action ?? '')
      const commandMeta = getCommandMeta(commandMetaStoreRef.current, commandId)
      const targetId = commandMeta?.targetId ?? String(ev.payload.targetId ?? '')
      const skillId = commandMeta?.skillId ?? String(ev.payload.skillId ?? '')
      const metadata = commandMeta?.metadata ?? {}
      const actorRole = roleByEntityId(actorId)
      const targetRole = roleByEntityId(targetId)
      const actorPos = posByEntityId(actorId)
      const targetPos = posByEntityId(targetId)

      if (actorRole && targetRole && actorPos && targetPos) {
        const actorAnim = resolveActorCombatAnim(action)
        if (actorAnim) {
          triggerCombatFx(actorRole, actorAnim, combatEnemyId, { toward: toTowardVector(actorPos, targetPos) })
          const facingUpdate = computeCombatFacingUpdate({
            actorId,
            targetId,
            leftId: s.left.id,
            rightId: s.right.id,
            actorPos,
            targetPos,
          })
          if (facingUpdate.actorIsPlayer) {
            setPlayerFacing(facingUpdate.actorFacing)
          } else if (facingUpdate.actorIsEnemy) {
            setEnemyFacings((prevFacing) => ({ ...prevFacing, [combatEnemyId]: facingUpdate.actorFacing }))
          }
          if (facingUpdate.targetIsPlayer) {
            setPlayerFacing(facingUpdate.targetFacing)
          } else if (facingUpdate.targetIsEnemy) {
            setEnemyFacings((prevFacing) => ({ ...prevFacing, [combatEnemyId]: facingUpdate.targetFacing }))
          }
        }

        const fxProfile = resolveSkillFxProfile({ action, skillId, actorRole })
        const projectileKind = fxProfile.projectileKind
        if (projectileKind) {
          pushProjectileFx(
            buildProjectileFxInput({
              kind: projectileKind,
              from: actorRole,
              actorPos,
              targetPos,
              durationMs: fxProfile.durationMs,
            }),
          )
          if (commandId) projectileTargetStoreRef.current[commandId] = { target: targetRole }
        }
      }

      setBattleLog((prev) => [...prev, buildActionExecutedBattleLogLine({ action, actorId, metadata })])

      if (actorId === s.left.id && action === 'cast_skill') {
        setNextAttackSkillId(null)
        const coreId = String(ev.payload.skillId ?? '')
        if (coreId) {
          const appSkill = getAvailableSkills().find((sk) => sk.coreSkillId === coreId)
          if (appSkill && appSkill.cooldownTicks > 0) {
            setSkillCooldownEndAt((prev) => ({ ...prev, [appSkill.id]: Date.now() + cooldownMsFromTicks(appSkill.cooldownTicks) }))
          }
        }
      }
      deleteCommandMeta(commandMetaStoreRef.current, commandId)
    }
    if (ev.type === 'damage_applied') {
      const dmg = Math.max(0, Number(ev.payload.damage ?? 0))
      const commandId = String(ev.payload.commandId ?? '')
      const tid = String(ev.payload.targetId ?? '')
      const actorId = String(ev.payload.actorId ?? '')
      const actorPos = posByEntityId(actorId)
      const targetPos = posByEntityId(tid)
      const targetRole = roleByEntityId(tid)
      if (targetRole && actorPos && targetPos && dmg > 0) {
        triggerCombatFx(targetRole, 'hit', combatEnemyId, { from: toHitFromVector(actorPos, targetPos) })
      }
      const damageSide = resolveDamageUiSide(tid, s.right.id)
      const damageLogLine = buildDamageLogLine(damageSide, dmg)
      if (damageLogLine) setBattleLog((prev) => [...prev, damageLogLine])
      const damageFloat = buildDamageFloatText(damageSide, dmg, (Math.random() - 0.5) * 28)
      if (damageFloat) pushFloatText(damageFloat)
      const impactedRole = commandId ? projectileTargetStoreRef.current[commandId]?.target : undefined
      if (impactedRole) {
        const impactedPos = impactedRole === 'player' ? s.left.position : s.right.position
        pushImpactFx({ kind: 'hit', target: impactedRole, x: impactedPos.x, y: impactedPos.y })
        delete projectileTargetStoreRef.current[commandId]
      }
    }
    if (ev.type === 'chase_started') {
      const st = typeof ev.payload.startTick === 'number' ? ev.payload.startTick : '?'
      const ex = typeof ev.payload.expireTick === 'number' ? ev.payload.expireTick : '?'
      setBattleLog((prev) => [...prev, `Chase started: ${st}→${ex} tick, escape fails if caught (battle continues), edge reached or distance >= 3.0 escape succeeds`])
    }
    if (ev.type === 'chase_resolved') {
      const typ = ev.payload.type
      if (typ === 'captured') setBattleLog((prev) => [...prev, 'Chase ended: caught, escape failed, battle continues'])
      else if (typ === 'escaped') setBattleLog((prev) => [...prev, `Chase ended: escaped (${ev.payload.escapedBy === 'edge' ? 'edge reached' : 'pulled away distance'})`])
      else if (typ === 'escape_failed') setBattleLog((prev) => [...prev, 'Chase ended: escape conditions not met, battle continues'])
    }
    if (ev.type === 'battle_ended') {
      const reason = String(ev.payload.reason ?? '')
      if (reason === 'timeout_hp_compare') {
        setBattleLog((prev) => [...prev, 'Battle stalemate too long: determining victory/defeat by remaining HP'])
      }
    }
    if (ev.type === 'command_rejected') {
      const reason = String(ev.payload.reason ?? '')
      const actorId = String(ev.payload.actorId ?? '')
      const commandId = String(ev.payload.commandId ?? '')
      const payloadSkillId = ev.payload.skillId !== undefined && ev.payload.skillId !== null ? String(ev.payload.skillId) : ''
      if (actorId === s.left.id && reason !== 'flee_failed' && shouldClearQueuedSkill(payloadSkillId, reason)) {
        setNextAttackSkillId(null)
      }
      if (shouldApplyDodgeImpact(reason)) {
        const dodgedRole = commandId ? projectileTargetStoreRef.current[commandId]?.target : undefined
        if (dodgedRole) {
          const dodgePos = dodgedRole === 'player' ? s.left.position : s.right.position
          pushImpactFx({ kind: 'dodge', target: dodgedRole, x: dodgePos.x, y: dodgePos.y })
          delete projectileTargetStoreRef.current[commandId]
        }
      }
      deleteCommandMeta(commandMetaStoreRef.current, commandId)
      if (reason === 'flee_failed' && actorId === s.left.id) {
        setBattleLog((prev) => [...prev, 'Flee failed (probability check failed), moving toward map edge or trying again'])
      } else if (actorId === s.left.id) {
        setBattleLog((prev) => [...prev, `Player action rejected: ${rejectReasonLabel(reason)}`])
      }
    }
  }
}
