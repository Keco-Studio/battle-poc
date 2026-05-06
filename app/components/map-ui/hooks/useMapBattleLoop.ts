import { useEffect } from 'react'
import type React from 'react'
import { getSkillById } from '@/app/constants'
import { MapBattleController } from '@/src/map-battle/MapBattleController'
import { isDemoDungeonCellWalkable } from '@/src/map-battle/dungeonDemoFootTiles'
import { processMapBattleEvents } from '../utils/processMapBattleEvents'
import { prepareMapBattleStep } from '../utils/prepareMapBattleStep'
import { applyMapBattleStepState } from '../utils/applyMapBattleStepState'
import { finalizeMapBattleTick } from '../utils/finalizeMapBattleTick'

export function useMapBattleLoop(params: {
  showBattle: boolean
  battleGridAnchor: { player: { x: number; y: number }; enemy: { x: number; y: number } } | null
  combatEnemyId: number | null
  mounted: boolean
  mapBattleControllerRef: React.MutableRefObject<any>
  mapBattleEndedRef: React.MutableRefObject<boolean>
  autoFleePendingRef: React.MutableRefObject<boolean>
  autoFleeConsumedMapRef: React.MutableRefObject<boolean>
  manualFleeRequestedRef: React.MutableRefObject<boolean>
  nextAttackSkillRef: React.MutableRefObject<string | null>
  enemies: Array<{ id: number; name: string }>
  enemiesRef: React.MutableRefObject<any[]>
  enemyPositionsRef: React.MutableRefObject<Record<number, { x: number; y: number }>>
  isPVPMode: boolean
  mapInfo: { width: number; height: number; collision: number[]; ground: number[]; tileset: { id: string } | null }
  playerLevel: number
  totalStats: any
  playerHP: number
  playerMP: number
  playerMaxMp: number
  getAvailableSkills: () => any[]
  pvpOpponentCarriedSkillIds: string[]
  battleSessionNonce: number
  battleEnemyStats: any
  battleSpeedRef: React.MutableRefObject<0.5 | 1 | 2>
  battleTimerRef: React.MutableRefObject<number | null>
  cdTimerRef: React.MutableRefObject<number | null>
  tickTimeoutRef: React.MutableRefObject<number | null>
  setPlayerPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  setEnemyPositions: React.Dispatch<React.SetStateAction<Record<number, { x: number; y: number }>>>
  setBattlePlayerMaxHp: React.Dispatch<React.SetStateAction<number>>
  setBattleTimeSec: React.Dispatch<React.SetStateAction<number>>
  setLastBattleTickCount: React.Dispatch<React.SetStateAction<number>>
  clearTransientFx: () => void
  setBattleLog: React.Dispatch<React.SetStateAction<string[]>>
  setCdUiTick: React.Dispatch<React.SetStateAction<number>>
  setNextAttackSkillId: React.Dispatch<React.SetStateAction<string | null>>
  setSkillCooldownEndAt: React.Dispatch<React.SetStateAction<Record<string, number>>>
  setPlayerHP: React.Dispatch<React.SetStateAction<number>>
  setPlayerMP: React.Dispatch<React.SetStateAction<number>>
  setEnemyHP: React.Dispatch<React.SetStateAction<number>>
  setEnemyMaxHp: React.Dispatch<React.SetStateAction<number>>
  setPlayerFacing: React.Dispatch<React.SetStateAction<any>>
  setEnemyFacings: React.Dispatch<React.SetStateAction<Record<number, any>>>
  setIsDefending: React.Dispatch<React.SetStateAction<boolean>>
  pushMoveFx: (item: { target: 'player' | 'enemy'; x: number; y: number }) => void
  commandMetaByIdRef: React.MutableRefObject<Record<string, any>>
  projectileTargetByCommandRef: React.MutableRefObject<Record<string, { target: 'player' | 'enemy' }>>
  triggerCombatFx: (role: 'player' | 'enemy', anim: 'idle' | 'attack' | 'cast' | 'hit', enemyId: number | null, opts?: any) => void
  resolveSkillFxProfile: (input: { action: string; skillId: string; actorRole: 'player' | 'enemy' }) => { projectileKind: any; durationMs: number }
  pushProjectileFx: (item: any) => void
  pushFloatText: (item: any) => void
  pushImpactFx: (item: any) => void
  pendingRespawnEnemyIdRef: React.MutableRefObject<number | null>
  completeMapBattleVictory: (message: string) => void
  completeMapBattleDefeat: () => void
  finalizeMapBattleFleeSuccess: (params: { successMessage: string; clearBattleLog: boolean }) => void
  processAutomationAfterBattle: (battleOutcome: 'win' | 'lose' | null) => { continue: boolean; message?: string }
  cancelAutomation: () => void
  isWalkable: (x: number, y: number, opts?: { ignoreEnemyIds?: number[]; ignorePlayerOnCell?: { x: number; y: number } }) => boolean
}) {
  const {
    showBattle,
    battleGridAnchor,
    combatEnemyId,
    mounted,
    mapBattleControllerRef,
    mapBattleEndedRef,
    autoFleePendingRef,
    autoFleeConsumedMapRef,
    manualFleeRequestedRef,
    nextAttackSkillRef,
    enemies,
    enemiesRef,
    enemyPositionsRef,
    isPVPMode,
    mapInfo,
    playerLevel,
    totalStats,
    playerHP,
    playerMP,
    playerMaxMp,
    getAvailableSkills,
    pvpOpponentCarriedSkillIds,
    battleSessionNonce,
    battleEnemyStats,
    battleSpeedRef,
    battleTimerRef,
    cdTimerRef,
    tickTimeoutRef,
    setPlayerPos,
    setEnemyPositions,
    setBattlePlayerMaxHp,
    setBattleTimeSec,
    setLastBattleTickCount,
    clearTransientFx,
    setBattleLog,
    setCdUiTick,
    setNextAttackSkillId,
    setSkillCooldownEndAt,
    setPlayerHP,
    setPlayerMP,
    setEnemyHP,
    setEnemyMaxHp,
    setPlayerFacing,
    setEnemyFacings,
    setIsDefending,
    pushMoveFx,
    commandMetaByIdRef,
    projectileTargetByCommandRef,
    triggerCombatFx,
    resolveSkillFxProfile,
    pushProjectileFx,
    pushFloatText,
    pushImpactFx,
    pendingRespawnEnemyIdRef,
    completeMapBattleVictory,
    completeMapBattleDefeat,
    finalizeMapBattleFleeSuccess,
    processAutomationAfterBattle,
    cancelAutomation,
    isWalkable,
  } = params

  useEffect(() => {
    if (!showBattle || !battleGridAnchor || combatEnemyId == null || !mounted) {
      mapBattleControllerRef.current = null
      return
    }
    mapBattleEndedRef.current = false
    const battleEnemy = enemies.find((e) => e.id === combatEnemyId)
    if (!battleEnemy) {
      mapBattleControllerRef.current = null
      return
    }
    mapBattleEndedRef.current = false
    autoFleePendingRef.current = false
    autoFleeConsumedMapRef.current = false

    const isWalkableForBattle = (gx: number, gy: number) => {
      if (isPVPMode) return true
      if (
        !isDemoDungeonCellWalkable({
          x: gx,
          y: gy,
          mapW: mapInfo.width,
          mapH: mapInfo.height,
          collision: mapInfo.collision,
          ground: mapInfo.ground,
          tilesetId: mapInfo.tileset?.id ?? null,
        })
      ) {
        return false
      }
      for (const er of enemiesRef.current) {
        if (er.id === combatEnemyId) continue
        const p = enemyPositionsRef.current[er.id] ?? { x: er.x, y: er.y }
        if (Math.round(p.x) === gx && Math.round(p.y) === gy) return false
      }
      return true
    }

    const battleDecisionMode: 'manual' | 'dual_llm' =
      process.env.NEXT_PUBLIC_BATTLE_DECISION_MODE === 'dual_llm' ? 'dual_llm' : 'manual'
    const llmProvider: 'deepseek' | 'zhipu' | 'custom' =
      process.env.NEXT_PUBLIC_BATTLE_LLM_PROVIDER === 'zhipu' ? 'zhipu' : 'deepseek'
    const aiProxyUrl = process.env.NEXT_PUBLIC_BATTLE_AI_SERVER_URL || 'http://localhost:8787'
    const centerGrid = {
      x: Math.max(1, Math.min(mapInfo.width - 2, Math.floor(mapInfo.width / 2))),
      y: Math.max(1, Math.min(mapInfo.height - 2, Math.floor(mapInfo.height / 2))),
    }
    const pvpPlayerGrid = { x: Math.max(0, centerGrid.x - 1), y: centerGrid.y }
    const pvpEnemyGrid = { x: Math.min(mapInfo.width - 1, centerGrid.x + 1), y: centerGrid.y }
    const initialPlayerGrid = isPVPMode ? pvpPlayerGrid : { ...battleGridAnchor.player }
    const initialEnemyGrid = isPVPMode ? pvpEnemyGrid : { ...battleGridAnchor.enemy }

    const cfg = {
      mapWidth: mapInfo.width,
      mapHeight: mapInfo.height,
      battleTickMs: 200,
      isWalkable: isWalkableForBattle,
      playerName: `Warrior Lv.${playerLevel}`,
      playerGrid: initialPlayerGrid,
      playerStats: totalStats,
      playerHp: playerHP,
      playerMp: playerMP,
      playerMaxMp,
      playerSkillIds: getAvailableSkills().filter((s) => s.action === 'cast_skill' && !!s.coreSkillId).map((s) => s.coreSkillId!),
      enemyName: battleEnemy.name,
      enemyId: `enemy-${battleEnemy.id}`,
      enemyGrid: initialEnemyGrid,
      enemyStats: battleEnemyStats,
      enemySkillIds: isPVPMode
        ? pvpOpponentCarriedSkillIds
            .map((id) => getSkillById(id)?.coreSkillId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        : undefined,
      battleDecisionMode,
      llmConfig:
        battleDecisionMode === 'dual_llm'
          ? {
              provider: llmProvider,
              model: process.env.NEXT_PUBLIC_BATTLE_LLM_MODEL,
              proxyUrl: aiProxyUrl,
              timeoutMs: Number(process.env.NEXT_PUBLIC_BATTLE_LLM_TIMEOUT_MS || 7000),
            }
          : undefined,
    }
    const ctrl = new MapBattleController(cfg as any)
    mapBattleControllerRef.current = ctrl
    if (isPVPMode) {
      setPlayerPos({ ...initialPlayerGrid })
      setEnemyPositions((prev) => ({ ...prev, [battleEnemy.id]: { ...initialEnemyGrid } }))
    }
    setBattlePlayerMaxHp(ctrl.session.left.resources.maxHp)
    setBattleTimeSec(0)
    setLastBattleTickCount(0)
    clearTransientFx()
    setBattleLog((prev) => [...prev, 'Preparation phase started'])

    battleTimerRef.current = null
    cdTimerRef.current = null
    tickTimeoutRef.current = null

    const clearTimers = () => {
      if (battleTimerRef.current !== null) window.clearInterval(battleTimerRef.current)
      if (cdTimerRef.current !== null) window.clearInterval(cdTimerRef.current)
      if (tickTimeoutRef.current !== null) window.clearTimeout(tickTimeoutRef.current)
      battleTimerRef.current = null
      cdTimerRef.current = null
      tickTimeoutRef.current = null
    }
    battleTimerRef.current = window.setInterval(() => setBattleTimeSec((s) => s + 1), 1000)
    cdTimerRef.current = window.setInterval(() => setCdUiTick((n) => n + 1), 150)
    const scheduleTick = () => {
      if (tickTimeoutRef.current !== null) window.clearTimeout(tickTimeoutRef.current)
      tickTimeoutRef.current = window.setTimeout(runTick, 200 / battleSpeedRef.current)
    }
    const runTick = () => {
      const c = mapBattleControllerRef.current
      if (!c || mapBattleEndedRef.current) return
      const prevPhase = c.session.phase
      const prevPlayerPos = { ...c.session.left.position }
      const prevEnemyPos = { ...c.session.right.position }
      const preparedStep = prepareMapBattleStep({
        controller: c,
        isPVPMode,
        manualFleeRequestedRef,
        autoFleePendingRef,
        autoFleeConsumedMapRef,
        nextAttackSkillId: nextAttackSkillRef.current,
        setNextAttackSkillId,
        setSkillCooldownEndAt,
        setBattleLog,
        mapWidth: mapInfo.width,
        mapHeight: mapInfo.height,
        isWalkableForBattle,
      })
      const step = preparedStep.step
      const s = preparedStep.session
      if (prevPhase === 'preparation' && s.phase === 'battle') {
        setBattleLog((prev) => [...prev, 'Preparation phase ended'])
      }
      const evStart = Math.max(0, s.events.length - step.newEventCount)
      applyMapBattleStepState({
        session: s,
        combatEnemyId,
        prevPlayerPos,
        prevEnemyPos,
        setPlayerHP,
        setPlayerMP,
        setEnemyHP,
        setEnemyMaxHp,
        setBattlePlayerMaxHp,
        setPlayerPos,
        setPlayerFacing,
        setEnemyFacings,
        setEnemyPositions,
        setIsDefending,
        pushMoveFx,
      })
      const roleByEntityId = (entityId: string): 'player' | 'enemy' | null =>
        entityId === s.left.id ? 'player' : entityId === s.right.id ? 'enemy' : null
      const posByEntityId = (entityId: string): { x: number; y: number } | null =>
        entityId === s.left.id ? s.left.position : entityId === s.right.id ? s.right.position : null
      processMapBattleEvents({
        session: s,
        evStart,
        combatEnemyId,
        commandMetaStoreRef: commandMetaByIdRef,
        projectileTargetStoreRef: projectileTargetByCommandRef,
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
      })
      const ended = finalizeMapBattleTick({
        ui: step.uiOutcome,
        session: s,
        combatEnemyId,
        scheduleTick,
        mapBattleEndedRef,
        clearTimers,
        mapBattleControllerRef,
        setLastBattleTickCount,
        mapWidth: mapInfo.width,
        mapHeight: mapInfo.height,
        isWalkable,
        pendingRespawnEnemyIdRef,
        completeMapBattleVictory,
        completeMapBattleDefeat,
        finalizeMapBattleFleeSuccess,
        setPlayerFacing,
        setPlayerPos,
        setEnemyPositions,
        processAutomationAfterBattle,
        setBattleLog,
        cancelAutomation,
      })
      if (!ended) return
    }
    scheduleTick()
    return () => {
      clearTimers()
      mapBattleControllerRef.current = null
      setBattlePlayerMaxHp(0)
    }
  }, [
    showBattle,
    battleSessionNonce,
    battleGridAnchor,
    combatEnemyId,
    mounted,
    isPVPMode,
    mapInfo.width,
    mapInfo.height,
    mapInfo.collision,
    mapInfo.ground,
    mapInfo.tileset?.id,
  ])
}
