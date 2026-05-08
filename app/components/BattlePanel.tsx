/**
 * @deprecated Replaced by GameMap embedded battle-core tick (MapBattleController + flee command).
 * Kept for reference/rollback; can be manually deleted after verification.
 */
'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BattleFxKind, BattleVisualState } from '@/src/renderer/phaser/battleVisualTypes'

const BattlePhaserCanvas = dynamic(
  () => import('./BattlePhaserCanvas').then((m) => m.BattlePhaserCanvas),
  { ssr: false, loading: () => <div className="absolute inset-0 bg-[#1a1a2e]" aria-hidden /> },
)
import { GameState } from '../hooks/useGameState'
import {
  equipmentTypes,
  EquipmentType,
  Skill,
  BASIC_ATTACK,
  getSkillById,
  attackIntervalMsFromSpd,
  mitigatedPhysicalDamage,
  BASIC_DAMAGE_MULTIPLIER,
  SKILL_DAMAGE_MULTIPLIER,
  DEFEND_DAMAGE_REDUCTION,
  DEFEND_SKILL_REDUCTION,
  getBattleRewards,
} from '../constants'

interface Props {
  game: GameState
}

function playerAttackIntervalMs(spd: number): number {
  return Math.max(380, Math.min(2200, 1150 - spd * 28))
}

function enemyAttackIntervalMs(enemySpd: number): number {
  return attackIntervalMsFromSpd(enemySpd) + Math.floor(Math.random() * 200)
}

function skillCooldownRemaining(endAt: Record<string, number>, skillId: string): number {
  const t = endAt[skillId]
  if (t === undefined) return 0
  return Math.max(0, t - Date.now())
}

function ConfettiCelebration() {
  const pieces = Array.from({ length: 48 }, (_, i) => ({
    id: i,
    left: `${(i * 17 + (i % 7) * 13) % 100}%`,
    delay: `${(i % 12) * 0.08}s`,
    duration: `${2.2 + (i % 5) * 0.15}s`,
    hue: (i * 47) % 360,
  }))
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 h-3 w-2 rounded-sm opacity-90 animate-confetti-fall"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            backgroundColor: `hsl(${p.hue} 85% 55%)`,
          }}
        />
      ))}
    </div>
  )
}

type BattleSnap = {
  enemyHP: number
  playerHP: number
  totalStats: { maxHp: number; atk: number; def: number; spd: number }
  isDefending: boolean
  nextAttackSkillId: string | null
  skillCooldownEndAt: Record<string, number>
  enemyLevel: number
}

export default function BattlePanel({ game }: Props) {
  const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null)
  const [droppedEquipment, setDroppedEquipment] = useState<{ name: string; icon: string } | null>(null)
  const [battleFx, setBattleFx] = useState<BattleFxKind>('none')
  const [floatTexts, setFloatTexts] = useState<Array<{ id: number; text: string; side: 'left' | 'right' }>>([])
  const [battleTimeSec, setBattleTimeSec] = useState(0)
  const [, setCdUiTick] = useState(0)
  /** Center ⚔ icon only shows for about 1 second when battle starts */
  const [showCenterBattleIcon, setShowCenterBattleIcon] = useState(true)
  /** Heavy strike: player charges forward + enemy takes hit */
  const [heavyStrikePlaying, setHeavyStrikePlaying] = useState(false)

  const battleVisualRef = useRef<BattleVisualState>({
    playerName: 'Player',
    enemyName: 'Enemy',
    playerHP: 1,
    playerMaxHp: 1,
    enemyHP: 1,
    enemyMaxHp: 1,
    isDefending: false,
    battleFx: 'none',
    heavyStrikePlaying: false,
    isGameOver: false,
    battleResult: null,
    floatTexts: [],
  })

  const floatIdRef = useRef(0)
  const isGameOverRef = useRef(false)
  const nextPlayerAtkAtRef = useRef(0)
  const nextEnemyAtkAtRef = useRef(0)
  /** Synced with defense skill to avoid enemy not reading newly set defense in same tick */
  const defendingRef = useRef(false)
  const snapRef = useRef<BattleSnap>({
    enemyHP: 0,
    playerHP: 0,
    totalStats: { maxHp: 1, atk: 1, def: 1, spd: 1 },
    isDefending: false,
    nextAttackSkillId: null,
    skillCooldownEndAt: {},
    enemyLevel: 1,
  })

  const {
    playerLevel,
    playerHP,
    setPlayerHP,
    totalStats,
    enemyHP,
    enemyMaxHp,
    enemyLevel,
    enemyCombatStats,
    nearbyEnemy,
    showBattle,
    isGameOver,
    battleResult,
    isDefending,
    setIsDefending,
    gainedExp,
    battleLog,
    setBattleLog,
    closeBattle,
    handleFlee,
    getAvailableSkills,
    tryLevelUp,
    playerExp,
    setPlayerExp,
    setPlayerGold,
    setInventory,
    setEnemyHP,
    setIsGameOver,
    setBattleResult,
    setGainedExp,
    setGainedGold,
    nextAttackSkillId,
    setNextAttackSkillId,
    skillCooldownEndAt,
    setSkillCooldownEndAt,
    setSelectedSkill,
  } = game

  snapRef.current = {
    enemyHP,
    playerHP,
    totalStats,
    isDefending,
    nextAttackSkillId,
    skillCooldownEndAt,
    enemyLevel,
  }

  battleVisualRef.current = {
    playerName: `Player Lv.${playerLevel}`,
    enemyName: nearbyEnemy?.name ? `${nearbyEnemy.name} Lv.${enemyLevel}` : `Enemy Lv.${enemyLevel}`,
    playerHP,
    playerMaxHp: totalStats.maxHp,
    enemyHP,
    enemyMaxHp,
    isDefending,
    battleFx,
    heavyStrikePlaying,
    isGameOver,
    battleResult,
    floatTexts,
  }

  useEffect(() => {
    defendingRef.current = isDefending
  }, [isDefending])

  useEffect(() => {
    isGameOverRef.current = isGameOver
  }, [isGameOver])

  /** Skill cooldown overlay needs periodic redraw */
  useEffect(() => {
    if (!showBattle || isGameOver) return
    const id = window.setInterval(() => setCdUiTick((n) => n + 1), 150)
    return () => window.clearInterval(id)
  }, [showBattle, isGameOver])

  useEffect(() => {
    if (!showBattle) return
    setShowCenterBattleIcon(true)
    const t = window.setTimeout(() => setShowCenterBattleIcon(false), 1000)
    return () => window.clearTimeout(t)
  }, [showBattle])

  const pushFloat = useCallback((text: string, side: 'left' | 'right') => {
    const id = ++floatIdRef.current
    setFloatTexts((prev) => [...prev, { id, text, side }])
    window.setTimeout(() => {
      setFloatTexts((prev) => prev.filter((x) => x.id !== id))
    }, 900)
  }, [])

  const flashFx = useCallback((kind: Exclude<BattleFxKind, 'none'>) => {
    setBattleFx(kind)
    window.setTimeout(() => setBattleFx('none'), 220)
  }, [])

  const triggerHeavyStrikeVfx = useCallback(() => {
    setHeavyStrikePlaying(true)
    window.setTimeout(() => setHeavyStrikePlaying(false), 500)
  }, [])

  const handleVictory = useCallback(
    (closingLog: string) => {
      if (isGameOverRef.current) return
      isGameOverRef.current = true
      setIsGameOver(true)
      setBattleResult('win')
      const { exp: expGain, gold: goldGain } = getBattleRewards(enemyLevel)
      setGainedExp(expGain)
      setGainedGold(goldGain)
      setPlayerGold((prev) => prev + goldGain)
      if (Math.random() < 0.1) {
        const types: EquipmentType[] = ['weapon', 'ring', 'armor', 'shoes']
        const randomType = types[Math.floor(Math.random() * types.length)]
        const eq = equipmentTypes[randomType]
        setInventory((prev) => [...prev, { type: randomType, name: eq.name, icon: eq.icon }])
        setDroppedEquipment({ name: eq.name, icon: eq.icon })
        setBattleLog((prev) => [...prev, `Lucky! Got ${eq.icon}${eq.name}!`])
      }
      const afterLevelUp = tryLevelUp(playerExp + expGain)
      setPlayerExp(afterLevelUp.exp)
      setBattleLog((prev) => [...prev, closingLog, `获得 ${expGain} 经验！`])
      if (afterLevelUp.level > playerLevel) {
        setBattleLog((prev) => [...prev, `Level up! Now Lv.${afterLevelUp.level}`])
      }
    },
    [
      enemyLevel,
      playerExp,
      playerLevel,
      setBattleLog,
      setBattleResult,
      setGainedExp,
      setGainedGold,
      setInventory,
      setIsGameOver,
      setPlayerExp,
      setPlayerGold,
      tryLevelUp,
    ],
  )

  const beginSkillCooldown = useCallback(
    (skillId: string, ms: number) => {
      if (skillId === BASIC_ATTACK.id || ms <= 0) return
      setSkillCooldownEndAt((prev) => ({ ...prev, [skillId]: Date.now() + ms }))
    },
    [setSkillCooldownEndAt],
  )

  useEffect(() => {
    if (playerHP <= 0 && !isGameOver) {
      setIsGameOver(true)
      setBattleResult('lose')
      // Defeat penalty: only reset gold, don't modify backpack or equipped (don't call setInventory / setEquippedGear)
      setPlayerGold(0)
      setPlayerHP(totalStats.maxHp)
    }
  }, [playerHP, isGameOver, setBattleResult, setIsGameOver, setPlayerHP, setPlayerGold, totalStats.maxHp])

  useEffect(() => {
    if (!showBattle || isGameOver) return

    const now = Date.now()
    nextPlayerAtkAtRef.current = now + 450
    nextEnemyAtkAtRef.current = now + 800
    setBattleTimeSec(0)

    const tickBattleTime = window.setInterval(() => {
      setBattleTimeSec((s) => s + 1)
    }, 1000)

    const id = window.setInterval(() => {
      if (isGameOverRef.current) return
      const t = Date.now()
      const s = snapRef.current

      if (t >= nextPlayerAtkAtRef.current) {
        nextPlayerAtkAtRef.current = t + playerAttackIntervalMs(s.totalStats.spd)

        let skill: Skill = BASIC_ATTACK
        if (s.nextAttackSkillId !== null) {
          const q = getSkillById(s.nextAttackSkillId)
          const cd = skillCooldownRemaining(s.skillCooldownEndAt, s.nextAttackSkillId)
          if (q && cd <= 0) {
            skill = q
            setNextAttackSkillId(null)
          }
        }

        let log = ''
        const hits = skill.hits || 1

        if (skill.type === 'damage' || skill.type === 'counter') {
          flashFx(skill.id === BASIC_ATTACK.id ? 'enemy-hit' : 'player-skill-offense')
          const enemyDef = enemyCombatStats.def
          let totalDamage = 0
          for (let i = 0; i < hits; i++) {
            const raw =
              skill.id === BASIC_ATTACK.id
                ? (s.totalStats.atk - enemyDef * 0.5 + Math.random() * 2) * BASIC_DAMAGE_MULTIPLIER
                : (s.totalStats.atk * Math.max(0.5, skill.multiplier) - enemyDef * 0.45 + Math.random() * 2.5) *
                SKILL_DAMAGE_MULTIPLIER
            const defendingReduction = skill.id === BASIC_ATTACK.id ? DEFEND_DAMAGE_REDUCTION : DEFEND_SKILL_REDUCTION
            const reduced = s.isDefending ? raw * defendingReduction : raw
            totalDamage += mitigatedPhysicalDamage(Math.floor(reduced), enemyDef)
          }
          setEnemyHP((prev) => {
            const newHP = Math.max(0, prev - totalDamage)
            if (newHP <= 0) {
              queueMicrotask(() => handleVictory(`"${skill.name}" defeated the enemy!`))
            }
            return newHP
          })
          pushFloat(`-${totalDamage}`, 'right')
          log = `${skill.name} dealt ${totalDamage} damage`
        } else if (skill.type === 'heal') {
          flashFx('player-skill-support')
          const heal = Math.floor(s.totalStats.atk * skill.multiplier)
          setPlayerHP((prev) => {
            const next = Math.min(s.totalStats.maxHp, prev + heal)
            const g = next - prev
            if (g > 0) queueMicrotask(() => pushFloat(`+${g}`, 'left'))
            return next
          })
          log = `${skill.name} restored health`
        } else if (skill.type === 'defense') {
          flashFx('player-skill-support')
          defendingRef.current = true
          setIsDefending(true)
          log = `${skill.name} preparing defense`
        }

        setBattleLog((prev) => [...prev, log])
        if (skill.id !== BASIC_ATTACK.id && skill.cooldownMs) {
          beginSkillCooldown(skill.id, skill.cooldownMs)
        }
      }

      if (t >= nextEnemyAtkAtRef.current) {
        const enemyCombat = enemyCombatStats
        nextEnemyAtkAtRef.current = t + enemyAttackIntervalMs(enemyCombat.spd)

        const rawEnemyHit = (enemyCombat.atk - snapRef.current.totalStats.def * 0.5 + Math.random() * 2) * BASIC_DAMAGE_MULTIPLIER
        let damage = mitigatedPhysicalDamage(rawEnemyHit, snapRef.current.totalStats.def)
        let logMsg = `Enemy attacks!`
        if (defendingRef.current) {
          damage = Math.floor(damage * 0.5)
          logMsg += ` (Defense halved)`
          defendingRef.current = false
          setIsDefending(false)
        }
        flashFx('player-hit')
        pushFloat(`-${damage}`, 'left')
        setPlayerHP((prev) => Math.max(0, prev - damage))
        setBattleLog((prev) => [...prev, `${logMsg} ${damage} damage`])
      }
    }, 40)

    return () => {
      window.clearInterval(id)
      window.clearInterval(tickBattleTime)
    }
  }, [
    showBattle,
    isGameOver,
    enemyCombatStats,
    beginSkillCooldown,
    flashFx,
    handleVictory,
    pushFloat,
    setBattleLog,
    setEnemyHP,
    setIsDefending,
    setNextAttackSkillId,
    setPlayerHP,
    triggerHeavyStrikeVfx,
  ])

  const queueSkill = (skill: Skill) => {
    if (isGameOver) return
    if (skillCooldownRemaining(skillCooldownEndAt, skill.id) > 0) return
    setSelectedSkill(skill.id)
    setNextAttackSkillId(skill.id)
    setBattleLog((prev) => [...prev, `Ready: next auto-attack will use "${skill.name}"`])
  }

  const availableSkills = getAvailableSkills()
  const atkPerSec = (1000 / playerAttackIntervalMs(totalStats.spd)).toFixed(2)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto p-3 transition-opacity duration-300 ease-out">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/home-bg.png')" }} />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative w-[1360px] max-w-[min(1360px,calc(100vw-1.5rem))] min-h-[min(800px,calc(100vh-2rem))] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="h-12 shrink-0 bg-gradient-to-b from-yellow-400 to-yellow-500 flex items-center justify-center border-b-4 border-orange-500 px-3">
          <span className="text-orange-900 font-bold text-base">Real-time Battle · {battleTimeSec}s</span>
        </div>

        <div className="relative w-full h-[720px] max-h-[calc(100vh-12rem)] shrink-0 bg-black/20">
          <BattlePhaserCanvas stateRef={battleVisualRef} className="absolute inset-0 h-full w-full outline-none" />

          <div className="pointer-events-none absolute left-3 top-3 z-30 flex max-w-[min(200px,42vw)] flex-col gap-1 rounded-lg bg-black/45 px-2 py-1.5 text-[11px] leading-tight text-white shadow-md backdrop-blur-sm">
            <span className="font-semibold text-sky-200">Player</span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${(playerHP / totalStats.maxHp) * 100}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-slate-200">
              {playerHP}/{totalStats.maxHp}
            </span>
          </div>

          <div className="pointer-events-none absolute right-3 top-3 z-30 flex max-w-[min(200px,42vw)] flex-col items-end gap-1 rounded-lg bg-black/45 px-2 py-1.5 text-[11px] leading-tight text-white shadow-md backdrop-blur-sm">
            <span className="font-semibold text-rose-200">{nearbyEnemy?.name || 'Enemy'}</span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-red-500 transition-all"
                style={{ width: `${(enemyHP / Math.max(enemyMaxHp, 1)) * 100}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-slate-200">
              {enemyHP}/{enemyMaxHp}
            </span>
          </div>

          <div className="pointer-events-none absolute left-3 top-[5.25rem] z-30 flex max-w-[160px] flex-col gap-0.5 text-[10px] leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
            <span>
              Attack Speed <span className="font-mono text-cyan-200">{atkPerSec}</span>/s
            </span>
            {nextAttackSkillId !== null && (
              <span className="truncate text-amber-200">
                Next: {getSkillById(nextAttackSkillId)?.name ?? '?'}
              </span>
            )}
          </div>

          {showCenterBattleIcon && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
              <div className="bg-orange-500/95 text-white font-black text-2xl px-5 py-2.5 rounded-xl border-4 border-yellow-400 shadow-lg animate-pulse">
                ⚔
              </div>
            </div>
          )}
        </div>

        <div className="relative shrink-0 bg-gradient-to-t from-yellow-500 to-yellow-400 border-t-4 border-orange-500 p-4">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {!isGameOver && (
              <button
                type="button"
                onClick={() => handleFlee({ successMessage: 'Flee success! Left battle.' })}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-400 rounded-lg text-white font-bold text-sm border-2 border-gray-300"
              >
                Flee
              </button>
            )}
            {availableSkills.map((skill) => {
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
                  className={`relative w-16 h-14 rounded-xl flex flex-col items-center justify-center shadow-lg border-2 ${nextAttackSkillId === skill.id
                      ? 'bg-orange-500 border-orange-300 ring-2 ring-white'
                      : locked
                        ? 'bg-gray-600 border-gray-500 opacity-70'
                        : 'bg-blue-500 border-blue-300 hover:bg-blue-400'
                    }`}
                >
                  <span className="text-xl">{skill.icon}</span>
                  <span className="text-xs text-white font-bold">{skill.name}</span>
                  {cd > 0 && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55 text-white text-sm font-black">
                      {(cd / 1000).toFixed(1)}s
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {hoveredSkill && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900/95 border-2 border-yellow-400 rounded-xl p-3 w-48 shadow-xl z-50">
              <div className="text-center mb-2">
                <span className="text-2xl">{hoveredSkill.icon}</span>
                <div className="text-white font-bold">{hoveredSkill.name}</div>
              </div>
              <div className="text-gray-300 text-xs text-center mb-1">{hoveredSkill.desc}</div>
              <div className="text-yellow-400 text-xs text-center">
                Click: Use for next auto-attack · CD {((hoveredSkill.cooldownMs ?? 0) / 1000).toFixed(1)}s
              </div>
            </div>
          )}
        </div>
        <div className="absolute left-4 bottom-[calc(100%+0.75rem)] z-30 w-64 max-h-48 bg-black/70 rounded-lg p-2 overflow-y-auto">
          {battleLog.map((log, idx) => (
            <div key={idx} className="text-white text-xs mb-1">
              {log}
            </div>
          ))}
        </div>
      </div>

      {isGameOver && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
          <div className="relative bg-gradient-to-b from-yellow-400 to-orange-500 border-4 border-orange-600 rounded-3xl p-8 w-80 text-center overflow-hidden">
            {battleResult === 'win' && <ConfettiCelebration />}
            <div className="relative z-10 bg-red-500 text-white font-black text-xl px-6 py-2 rounded-xl border-4 border-red-300 mx-auto mb-4 -mt-10">
              {battleResult === 'win' ? 'Victory!' : 'Defeat...'}
            </div>
            <div className="relative z-10 bg-white/30 rounded-xl p-4 mb-4">
              <div className="text-orange-900 text-sm">Battle Duration</div>
              <div className="text-4xl font-black text-orange-900">{battleTimeSec}s</div>
            </div>
            {battleResult === 'win' && (
              <div className="relative z-10 bg-white/30 rounded-xl p-4 mb-4">
                <div className="text-orange-900 text-sm mb-2">战斗奖励</div>
                <div className="flex justify-around">
                  <div>
                    <div className="text-2xl text-center">⭐</div>
                    <div className="text-xs text-orange-900">经验+{gainedExp}</div>
                  </div>
                </div>
              </div>
            )}
            {battleResult === 'lose' && (
              <div className="relative z-10 bg-white/30 rounded-xl p-4 mb-4">
                <div className="text-orange-900 text-sm leading-relaxed">
                  战斗失败；装备与背包保留。
                </div>
              </div>
            )}
            {droppedEquipment && (
              <div className="relative z-10 bg-green-500/80 rounded-xl p-4 mb-4 animate-bounce">
                <div className="text-white font-bold mb-1">🎉 Equipment Drop!</div>
                <div className="text-4xl mb-1">{droppedEquipment.icon}</div>
                <div className="text-white text-sm">{droppedEquipment.name}</div>
              </div>
            )}
            <button
              type="button"
              onClick={closeBattle}
              className="relative z-10 w-full py-2 bg-blue-500 hover:bg-blue-400 rounded-xl text-white font-bold border-2 border-blue-300"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
