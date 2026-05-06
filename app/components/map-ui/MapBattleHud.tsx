import type { MutableRefObject } from 'react'
import type { Skill } from '@/app/constants'
import BattleResultOverlay from './BattleResultOverlay'

type Props = {
  showBattle: boolean
  isGameOver: boolean
  isPVPMode: boolean
  playerMP: number
  playerMaxMp: number
  battleSpeed: 0.5 | 1 | 2
  setBattleSpeed: (sp: 0.5 | 1 | 2) => void
  battleTimeSec: number
  lastBattleTickCount: number
  manualFleeRequestedRef: MutableRefObject<boolean>
  lastManualFleeRequestAtRef: MutableRefObject<number>
  manualFleeDebounceMs: number
  mapBattleControllerRef: MutableRefObject<any>
  getAvailableSkills: () => Skill[]
  skillCooldownRemaining: (cdEnd: Record<string, number>, id: string) => number
  skillCooldownEndAt: Record<string, number>
  nextAttackSkillId: string | null
  queueSkill: (skill: Skill) => void
  hoveredSkill: Skill | null
  setHoveredSkill: (skill: Skill | null) => void
  battleLog: string[]
  battleResult: 'win' | 'lose' | null
  nearbyEnemyName: string
  gainedExp: number
  battleLootDrop: { name: string; icon: string } | null
  onContinue: () => void
}

export default function MapBattleHud(props: Props) {
  const {
    showBattle,
    isGameOver,
    isPVPMode,
    playerMP,
    playerMaxMp,
    battleSpeed,
    setBattleSpeed,
    battleTimeSec,
    lastBattleTickCount,
    manualFleeRequestedRef,
    lastManualFleeRequestAtRef,
    manualFleeDebounceMs,
    mapBattleControllerRef,
    getAvailableSkills,
    skillCooldownRemaining,
    skillCooldownEndAt,
    nextAttackSkillId,
    queueSkill,
    hoveredSkill,
    setHoveredSkill,
    battleLog,
    battleResult,
    nearbyEnemyName,
    gainedExp,
    battleLootDrop,
    onContinue,
  } = props

  if (!showBattle) return null

  return (
    <>
      <div className="pointer-events-auto fixed bottom-4 left-4 z-30 flex h-[clamp(320px,58vh,560px)] w-[clamp(240px,28vw,380px)] flex-col rounded-xl border border-amber-500/60 bg-slate-900/95 px-2 py-2 shadow-xl">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 text-[11px] text-amber-100">
          <span className="font-semibold">In Battle · battle-core session</span>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="text-sky-300">MP {playerMP}/{playerMaxMp}</span>
            <span className="text-slate-500">Speed</span>
            {([0.5, 1, 2] as const).map((sp) => (
              <button key={sp} type="button" onClick={() => setBattleSpeed(sp)} className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${battleSpeed === sp ? 'bg-amber-500 text-slate-950 shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                {sp}×
              </button>
            ))}
            <span className="font-mono text-slate-300">
              {battleTimeSec >= 1 ? `${battleTimeSec}s` : '<1s'}
              {lastBattleTickCount > 0 ? ` · ${lastBattleTickCount}t` : ''}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {!isGameOver && !isPVPMode && (
            <button
              type="button"
              onClick={() => {
                const now = Date.now()
                if (now - lastManualFleeRequestAtRef.current < manualFleeDebounceMs) return
                if (mapBattleControllerRef.current?.session?.chaseState?.status === 'flee_pending') return
                lastManualFleeRequestAtRef.current = now
                manualFleeRequestedRef.current = true
              }}
              className="rounded-lg border border-gray-500 bg-gray-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-gray-600"
            >
              Flee
            </button>
          )}
          {getAvailableSkills().map((skill) => {
            const cd = skillCooldownRemaining(skillCooldownEndAt, skill.id)
            const locked = cd > 0 || isGameOver
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => !locked && queueSkill(skill)}
                onMouseEnter={() => setHoveredSkill(skill)}
                onMouseLeave={() => setHoveredSkill(null)}
                disabled={locked}
                className={`relative flex h-11 w-14 flex-col items-center justify-center rounded-lg border text-[10px] font-bold text-white ${nextAttackSkillId === skill.id ? 'border-orange-300 bg-orange-600 ring-1 ring-white' : locked ? 'border-gray-600 bg-gray-800 opacity-70' : 'border-blue-400 bg-blue-600 hover:bg-blue-500'}`}
              >
                <span className="text-lg">{skill.icon}</span>
                {skill.name}
                <span className="text-[9px] text-slate-100/85">MP {skill.mpCost} · {skill.cooldownTicks}t</span>
                {cd > 0 && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-xs font-black">{(cd / 1000).toFixed(1)}s</span>}
              </button>
            )
          })}
        </div>
        {hoveredSkill && (
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 w-44 -translate-x-1/2 rounded-lg border border-yellow-500/80 bg-slate-950/95 p-2 text-center text-[11px] shadow-lg">
            <div className="text-lg">{hoveredSkill.icon}</div>
            <div className="font-bold text-white">{hoveredSkill.name}</div>
            <div className="text-slate-400">{hoveredSkill.desc}</div>
            <div className="mt-1 text-slate-400">MP: {hoveredSkill.mpCost} · CD: {hoveredSkill.cooldownTicks}t</div>
            <div className="text-slate-500">Range: {hoveredSkill.range ?? '-'} (preserved)</div>
          </div>
        )}
        <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-black/45 px-2 py-1.5">
          <div className="mb-1 border-b border-white/10 pb-1 text-[11px] font-semibold text-slate-200">Battle Log</div>
          <div className="h-[calc(100%-1.5rem)] overflow-y-auto pr-1 text-[11px] leading-snug text-slate-300">
            {battleLog.length === 0 ? <div className="text-slate-500">Waiting for battle events...</div> : battleLog.map((log, idx) => <div key={idx}>{log}</div>)}
          </div>
        </div>
      </div>

      <BattleResultOverlay
        open={isGameOver}
        battleResult={battleResult}
        enemyName={nearbyEnemyName}
        battleTimeSec={battleTimeSec}
        lastBattleTickCount={lastBattleTickCount}
        gainedExp={gainedExp}
        battleLootDrop={battleLootDrop}
        onContinue={onContinue}
      />
    </>
  )
}
