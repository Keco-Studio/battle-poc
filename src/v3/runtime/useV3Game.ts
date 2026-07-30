'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { V3_CONTENT } from '@/src/content/generated/v3'
import {
  directionFromDelta,
  directionFromPath,
  type V3Direction,
  type V3MoveIntent,
  type V3ViewModel,
} from '@/src/v3/presentation/viewModel'
import { playerEventText, playerNodeText } from '@/src/v3/presentation/playerText'

import { createBattle, resolveDecisionTick } from './battleEngine'
import {
  EMPTY_V3_PROGRESS,
  EMPTY_V3_STAT_MODIFIERS,
  initialV3PhaseState,
  loadV3Progress,
  progressionModifiers,
  recordV3Outcome,
  saveV3Progress,
  transitionV3Phase,
  type V3BattleMode,
  type V3PhaseState,
  type V3Progress,
} from './campaign'
import { buildDecisionInput, requestOptionalDecision, type V3DecisionResult } from './decisionDirector'
import {
  commitTravelArrival,
  planStepTravel,
  planTravel,
  type V3TravelState,
} from './exploration'
import { replayBattle } from './replay'
import type {
  V3ActorId,
  V3BattleConfig,
  V3BattleEvent,
  V3BattleState,
  V3RecordedTick,
} from './types'

export type V3ModelProvider = 'minimax' | 'deepseek'
export type V3ConsoleTab = 'status' | 'decision' | 'timeline'
export type V3TimelineFilter = 'all' | 'patch' | 'action' | 'combat'

export type V3DecisionEvidence = {
  tick: number
  actorId: V3ActorId
  source: V3DecisionResult['source']
  status: V3DecisionResult['status']
  reason: string
  latencyMs: number
  error?: string
}

const directionDelta: Record<V3Direction, { x: number; y: number }> = {
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
  nw: { x: -1, y: -1 },
}

function cloneProgress(progress: V3Progress): V3Progress {
  return {
    ...progress,
    clearedEncounterIds: [...progress.clearedEncounterIds],
    unlockedEncounterIds: [...progress.unlockedEncounterIds],
    drops: [...progress.drops],
    playerPosition: { ...progress.playerPosition },
    battleRecords: [...progress.battleRecords],
  }
}

function modelName(provider: V3ModelProvider): string {
  return provider === 'minimax' ? 'MiniMax-M2.1' : 'deepseek-chat'
}

function latestActionIndex(events: V3BattleEvent[], startAt = 0): number {
  const offset = events.slice(startAt).findIndex((event) => event.type === 'action')
  return offset < 0 ? Math.max(0, events.length - 1) : startAt + offset
}

export function useV3Game() {
  const [progress, setProgress] = useState<V3Progress>(() => cloneProgress(EMPTY_V3_PROGRESS))
  const [phaseState, setPhaseState] = useState<V3PhaseState>(() => initialV3PhaseState())
  const [mode, setMode] = useState<V3BattleMode>('standard')
  const [modelProvider, setModelProvider] = useState<V3ModelProvider>('minimax')
  const [playerSkillIds, setPlayerSkillIds] = useState(() => [...V3_CONTENT.jobs.astra_vanguard.skillIds])
  const [enemySkillIds, setEnemySkillIds] = useState(() => [...V3_CONTENT.enemies.briar_sentinel.skillIds])
  const [playerTreeId, setPlayerTreeId] = useState(V3_CONTENT.jobs.astra_vanguard.treeId)
  const [enemyTreeId, setEnemyTreeId] = useState(V3_CONTENT.enemies.briar_sentinel.treeId)
  const [battle, setBattle] = useState<V3BattleState | null>(null)
  const [exploreFacing, setExploreFacing] = useState<V3Direction>('s')
  const [travel, setTravel] = useState<V3TravelState>(() => ({
    committed: { ...EMPTY_V3_PROGRESS.playerPosition },
    route: [],
    requestId: 0,
  }))
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<0.5 | 1 | 2 | 4>(1)
  const [activeEventIndex, setActiveEventIndex] = useState(0)
  const [decisionEvidence, setDecisionEvidence] = useState<V3DecisionEvidence[]>([])
  const [consoleTab, setConsoleTab] = useState<V3ConsoleTab>('decision')
  const [timelineFilter, setTimelineFilter] = useState<V3TimelineFilter>('all')
  const [durationMs, setDurationMs] = useState(0)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const battleRef = useRef<V3BattleState | null>(null)
  const progressRef = useRef(progress)
  const phaseRef = useRef(phaseState)
  const travelRef = useRef(travel)
  const advancingRef = useRef(false)
  const startedAtRef = useRef(0)
  const finishHandledRef = useRef(false)
  const replayTicksRef = useRef<V3RecordedTick[] | null>(null)
  const replayCursorRef = useRef(0)
  const replayModeRef = useRef(false)

  progressRef.current = progress
  phaseRef.current = phaseState
  travelRef.current = travel
  battleRef.current = battle

  useEffect(() => {
    const loaded = loadV3Progress(window.localStorage)
    setProgress(loaded)
    setTravel((current) => {
      const next = { committed: { ...loaded.playerPosition }, route: [], requestId: current.requestId + 1 }
      travelRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    saveV3Progress(window.localStorage, progress)
  }, [progress])

  const selectedEncounter = phaseState.encounterId
    ? V3_CONTENT.encounters[phaseState.encounterId]
    : null
  const selectedEnemy = selectedEncounter
    ? V3_CONTENT.enemies[selectedEncounter.enemyId]
    : V3_CONTENT.enemies.briar_sentinel
  const player = V3_CONTENT.jobs.astra_vanguard
  const earnedProgressionBonuses = useMemo(() => {
    const drops = new Set(progress.drops)
    return Object.values(V3_CONTENT.progression).filter((bonus) => drops.has(bonus.dropId))
  }, [progress.drops])
  const statModifiers = useMemo(
    () => mode === 'standard' ? progressionModifiers(progress) : { ...EMPTY_V3_STAT_MODIFIERS },
    [mode, progress],
  )

  useEffect(() => {
    if (mode === 'standard' && selectedEnemy) {
      setEnemySkillIds([...selectedEnemy.skillIds])
      setEnemyTreeId(selectedEnemy.treeId)
    }
  }, [mode, selectedEnemy])

  const openEncounter = useCallback((encounterId: string) => {
    if (phaseRef.current.phase !== 'explore') return
    if (!progressRef.current.unlockedEncounterIds.includes(encounterId)) return
    const encounter = V3_CONTENT.encounters[encounterId]
    if (!encounter) return
    const position = progressRef.current.playerPosition
    if (encounter.x !== position.x || encounter.y !== position.y) return
    setPhaseState((current) => transitionV3Phase(current, { type: 'encounter', encounterId }))
  }, [])

  const move = useCallback((intent: V3MoveIntent) => {
    if (phaseRef.current.phase !== 'explore') return
    const map = V3_CONTENT.maps[V3_CONTENT.game.defaultExplorationMapId]
    const bounds = { width: map.width, height: map.height }
    const blocked = map.obstacles.map(([x, y]) => ({ x, y }))
    const current = travelRef.current
    const next = intent.kind === 'target'
      ? planTravel(current, intent.to, bounds, blocked)
      : planStepTravel(current, directionDelta[intent.direction], bounds, blocked)
    if (next === current) return
    travelRef.current = next
    setTravel(next)
    const from = current.committed
    const to = next.route[0]
    if (to) setExploreFacing(directionFromDelta(to.x - from.x, to.y - from.y, exploreFacing))
  }, [exploreFacing])

  const handleTravelArrival = useCallback((requestId: number, point: { x: number; y: number }) => {
    if (phaseRef.current.phase !== 'explore') return
    const current = travelRef.current
    let next = commitTravelArrival(current, requestId, point)
    if (next === current) return
    const encounter = Object.values(V3_CONTENT.encounters).find((item) => (
      progressRef.current.unlockedEncounterIds.includes(item.id)
      && !progressRef.current.clearedEncounterIds.includes(item.id)
      && item.x === point.x
      && item.y === point.y
    ))
    if (encounter) next = { ...next, route: [] }
    travelRef.current = next
    setTravel(next)
    setProgress((value) => ({ ...value, playerPosition: { ...next.committed } }))
    if (next.route[0]) {
      setExploreFacing(directionFromDelta(
        next.route[0].x - next.committed.x,
        next.route[0].y - next.committed.y,
        exploreFacing,
      ))
    }
    if (encounter) setPhaseState((phase) => transitionV3Phase(phase, { type: 'encounter', encounterId: encounter.id }))
  }, [exploreFacing])

  const updatePlayerSkill = useCallback((index: number, skillId: string) => {
    setPlayerSkillIds((current) => current.map((value, slot) => slot === index ? skillId : value))
  }, [])

  const updateEnemySkill = useCallback((index: number, skillId: string) => {
    if (mode !== 'sandbox') return
    setEnemySkillIds((current) => current.map((value, slot) => slot === index ? skillId : value))
  }, [mode])

  const finishBattle = useCallback((completed: V3BattleState) => {
    if (finishHandledRef.current || !selectedEncounter) return
    finishHandledRef.current = true
    setDurationMs(Math.max(0, Date.now() - startedAtRef.current))
    if (!replayModeRef.current) {
      setProgress((current) => recordV3Outcome(current, {
        encounterId: selectedEncounter.id,
        result: completed.result,
        seed: completed.initialConfig.seed,
        ticks: completed.tick,
      }, mode))
    }
    setPhaseState((current) => transitionV3Phase(current, { type: 'battle_complete' }))
  }, [mode, selectedEncounter])

  const advanceBattle = useCallback(async () => {
    const current = battleRef.current
    if (!current || current.result !== 'ongoing' || advancingRef.current) return
    advancingRef.current = true
    try {
      let decisions: V3RecordedTick['decisions']
      const replayTicks = replayTicksRef.current
      if (replayTicks) {
        const recorded = replayTicks[replayCursorRef.current]
        if (!recorded) {
          const final = replayBattle({ initialConfig: current.initialConfig, ticks: replayTicks })
          setBattle(final)
          battleRef.current = final
          finishBattle(final)
          return
        }
        replayCursorRef.current += 1
        decisions = recorded.decisions
      } else {
        const provider = modelProvider
        const model = { provider, model: modelName(provider) }
        const online = process.env.NEXT_PUBLIC_V3_AI_ENABLED === '1'
        const [left, right] = await Promise.all([
          requestOptionalDecision(buildDecisionInput(current, 'left', model), { online }),
          requestOptionalDecision(buildDecisionInput(current, 'right', model), { online }),
        ])
        decisions = { left: left.patch, right: right.patch }
        setDecisionEvidence((items) => [...items,
          { tick: current.tick, actorId: 'left', source: left.source, status: left.status, reason: left.patch.reason, latencyMs: left.latencyMs, error: left.error },
          { tick: current.tick, actorId: 'right', source: right.source, status: right.status, reason: right.patch.reason, latencyMs: right.latencyMs, error: right.error },
        ])
      }

      if (battleRef.current !== current) return
      const previousEventCount = current.events.length
      const next = resolveDecisionTick(current, decisions)
      battleRef.current = next
      setBattle(next)
      setActiveEventIndex(latestActionIndex(next.events, previousEventCount))
      if (next.result !== 'ongoing') finishBattle(next)
    } finally {
      advancingRef.current = false
    }
  }, [finishBattle, modelProvider])

  useEffect(() => {
    if (phaseState.phase !== 'battle' || paused || !battle || battle.result !== 'ongoing') return
    const delay = Math.max(150, 900 / speed)
    const timer = window.setTimeout(() => void advanceBattle(), delay)
    return () => window.clearTimeout(timer)
  }, [advanceBattle, battle, paused, phaseState.phase, speed])

  const startFromConfig = useCallback((config: V3BattleConfig, replayTicks: V3RecordedTick[] | null = null) => {
    const next = createBattle(config)
    battleRef.current = next
    replayTicksRef.current = replayTicks
    replayCursorRef.current = 0
    replayModeRef.current = replayTicks !== null
    finishHandledRef.current = false
    startedAtRef.current = Date.now()
    setBattle(next)
    setDecisionEvidence([])
    setActiveEventIndex(0)
    setPaused(false)
    setDurationMs(0)
    setConsoleTab('decision')
    setPhaseState((current) => transitionV3Phase(current, {
      type: current.phase === 'report' ? 'replay' : 'start_battle',
      battleId: `v3-${config.seed}-${Date.now()}`,
    }))
  }, [])

  const startBattle = useCallback(() => {
    if (!selectedEncounter || !selectedEnemy) return
    const errors: string[] = []
    if (new Set(playerSkillIds).size !== 4) errors.push('Player skill slots must be unique.')
    if (new Set(enemySkillIds).size !== 4) errors.push('Enemy skill slots must be unique.')
    if (!V3_CONTENT.trees[playerTreeId]) errors.push('Select a valid player behavior tree.')
    if (!V3_CONTENT.trees[enemyTreeId]) errors.push('Select a valid enemy behavior tree.')
    setValidationErrors(errors)
    if (errors.length > 0) return

    startFromConfig({
      seed: V3_CONTENT.rules.defaultSeed,
      mapId: selectedEncounter.battleMapId,
      maxDecisionTicks: V3_CONTENT.rules.maxDecisionTicks,
      left: {
        templateType: 'job',
        templateId: player.id,
        skillIds: [...playerSkillIds],
        treeId: playerTreeId,
        modifiers: { ...statModifiers },
      },
      right: {
        templateType: 'enemy',
        templateId: selectedEnemy.id,
        skillIds: [...enemySkillIds],
        treeId: enemyTreeId,
        modifiers: { ...EMPTY_V3_STAT_MODIFIERS },
      },
      versions: {
        content: V3_CONTENT.game.contentVersion,
        rules: V3_CONTENT.game.rulesetVersion,
        visual: V3_CONTENT.game.visualVersion,
        modelProvider,
        model: modelName(modelProvider),
      },
    })
  }, [enemySkillIds, enemyTreeId, modelProvider, player.id, playerSkillIds, playerTreeId, selectedEncounter, selectedEnemy, startFromConfig, statModifiers])

  const cancelPreparation = useCallback(() => {
    setValidationErrors([])
    setPhaseState((current) => transitionV3Phase(current, { type: 'cancel_prepare' }))
  }, [])

  const togglePause = useCallback(() => setPaused((current) => !current), [])

  const step = useCallback(() => {
    setPaused(true)
    const current = battleRef.current
    if (!current) return
    const nextAction = current.events.findIndex((event, index) => index > activeEventIndex && event.type === 'action')
    if (nextAction >= 0) setActiveEventIndex(nextAction)
    else void advanceBattle()
  }, [activeEventIndex, advanceBattle])

  const handleAnimationComplete = useCallback((eventId: string) => {
    if (paused || !battleRef.current) return
    const index = battleRef.current.events.findIndex((event) => event.id === eventId)
    const next = battleRef.current.events.findIndex((event, eventIndex) => eventIndex > index && event.type === 'action')
    if (next >= 0) setActiveEventIndex(next)
  }, [paused])

  const replay = useCallback(() => {
    if (!battle) return
    startFromConfig(battle.initialConfig, battle.history.map((tick) => ({
      tick: tick.tick,
      decisions: JSON.parse(JSON.stringify(tick.decisions)) as V3RecordedTick['decisions'],
    })))
  }, [battle, startFromConfig])

  const rematch = useCallback(() => {
    if (!battle) return
    startFromConfig(battle.initialConfig)
  }, [battle, startFromConfig])

  const returnToMap = useCallback(() => {
    replayTicksRef.current = null
    replayModeRef.current = false
    setBattle(null)
    setPaused(false)
    const nextTravel = {
      committed: { ...progressRef.current.playerPosition },
      route: [],
      requestId: travelRef.current.requestId + 1,
    }
    travelRef.current = nextTravel
    setTravel(nextTravel)
    setPhaseState((current) => transitionV3Phase(current, { type: 'return_to_map' }))
  }, [])

  const activeEvent = battle?.events[activeEventIndex] ?? null
  const latestDecisionEvidence = decisionEvidence.at(-1) ?? null
  const latestPatch = battle?.patchRecords.at(-1) ?? null

  const viewModel = useMemo<V3ViewModel>(() => {
    const explorationMap = V3_CONTENT.maps[V3_CONTENT.game.defaultExplorationMapId]
    const battlePath = (actorId: V3ActorId) => battle ? [
      battle.map.spawns[actorId] ?? battle.actors[actorId].position,
      ...battle.events
        .filter((event) => event.type === 'move' && event.actorId === actorId && event.position)
        .map((event) => event.position!),
    ] : []
    const leftPath = battlePath('left')
    const rightPath = battlePath('right')
    return {
      phase: phaseState.phase,
      exploration: {
        mapId: explorationMap.id,
        playerPosition: progress.playerPosition,
        travelRoute: travel.route,
        travelRequestId: travel.requestId,
        playerVisualAssetId: player.visualAssetId,
        playerFacing: exploreFacing,
        safeBeacon: explorationMap.safeBeacon ?? { x: 3, y: 16 },
        encounters: Object.values(V3_CONTENT.encounters).map((encounter) => ({
          id: encounter.id,
          name: encounter.name,
          position: { x: encounter.x, y: encounter.y },
          unlocked: progress.unlockedEncounterIds.includes(encounter.id),
          cleared: progress.clearedEncounterIds.includes(encounter.id),
          boss: encounter.boss,
        })),
        pickups: [
          { id: 'starlight-west', position: { x: 6, y: 10 }, collected: progress.starlight >= 30 },
          { id: 'starlight-east', position: { x: 27, y: 12 }, collected: progress.starlight >= 65 },
          { id: 'starlight-north', position: { x: 11, y: 4 }, collected: progress.starlight >= 105 },
        ],
      },
      battle: battle ? {
        mapId: battle.map.id,
        obstacles: battle.map.obstacles.map(([x, y]) => ({ x, y })),
        actors: {
          left: {
            id: 'left',
            name: battle.actors.left.name,
            visualAssetId: battle.actors.left.visualAssetId,
            position: battle.actors.left.position,
            facing: directionFromPath(leftPath, 'e'),
            hp: battle.actors.left.hp,
            maxHp: battle.actors.left.maxHp,
            shield: battle.actors.left.shield,
            path: leftPath.slice(-6),
          },
          right: {
            id: 'right',
            name: battle.actors.right.name,
            visualAssetId: battle.actors.right.visualAssetId,
            position: battle.actors.right.position,
            facing: directionFromPath(rightPath, 'w'),
            hp: battle.actors.right.hp,
            maxHp: battle.actors.right.maxHp,
            shield: battle.actors.right.shield,
            path: rightPath.slice(-6),
          },
        },
        activeEvent,
        activeActionLabel: activeEvent ? playerEventText(activeEvent, battle) : 'Waiting for both AIs to decide',
        activeNodeLabel: activeEvent?.actorId
          ? playerNodeText(activeEvent.nodeId, activeEvent.actorId, battle)
          : 'Waiting for both AIs to decide',
        latestPatch,
        paused,
        speed,
      } : null,
    }
  }, [activeEvent, battle, exploreFacing, latestPatch, paused, phaseState.phase, player.visualAssetId, progress, speed, travel])

  return {
    progress,
    phaseState,
    mode,
    modelProvider,
    player,
    selectedEncounter,
    selectedEnemy,
    playerSkillIds,
    enemySkillIds,
    playerTreeId,
    enemyTreeId,
    battle,
    paused,
    speed,
    activeEvent,
    latestDecisionEvidence,
    decisionEvidence,
    consoleTab,
    timelineFilter,
    durationMs,
    validationErrors,
    earnedProgressionBonuses,
    statModifiers,
    viewModel,
    setMode,
    setModelProvider,
    setPlayerTreeId,
    setEnemyTreeId,
    setSpeed,
    setConsoleTab,
    setTimelineFilter,
    updatePlayerSkill,
    updateEnemySkill,
    openEncounter,
    move,
    handleTravelArrival,
    startBattle,
    cancelPreparation,
    togglePause,
    step,
    replay,
    rematch,
    returnToMap,
    handleAnimationComplete,
  }
}
