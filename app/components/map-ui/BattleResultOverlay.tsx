'use client'

import type { ReactNode } from 'react'

export type BattleResultOverlayProps = {
  open: boolean
  battleResult: 'win' | 'lose' | null
  enemyName: string
  battleTimeSec: number
  lastBattleTickCount: number
  gainedExp: number
  battleLootDrop: { name: string; icon: string } | null
  onContinue: () => void
}

export default function BattleResultOverlay(props: BattleResultOverlayProps) {
  const {
    open,
    battleResult,
    enemyName,
    battleTimeSec,
    lastBattleTickCount,
    gainedExp,
    battleLootDrop,
    onContinue,
  } = props

  if (!open) return null

  const title = battleResult === 'win' ? 'VICTORY!' : 'DEFEAT'
  const subtitle: ReactNode =
    battleResult === 'win' ? (
      <>
        <span className="text-yellow-200">◆ YOU DEFEATED </span>
        <span className="text-orange-300">{enemyName.toUpperCase()}</span>
      </>
    ) : (
      <>
        <span className="text-yellow-200">◆ YOU WERE DEFEATED BY </span>
        <span className="text-orange-300">{enemyName.toUpperCase()}</span>
      </>
    )

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      {/* Result color overlay (victory light green / defeat red vignette) */}
      <div
        className={`absolute inset-0 ${battleResult === 'win' ? 'bg-emerald-900/40' : 'oc-defeat-vignette'}`}
      />

      {/* Victory ribbons */}
      {battleResult === 'win' && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 36 }).map((_, i) => (
            <span
              key={i}
              className="animate-confetti-fall absolute top-0 h-3 w-2 rounded-sm opacity-90"
              style={{
                left: `${(i * 13 + (i % 5) * 7) % 100}%`,
                animationDelay: `${(i % 10) * 0.08}s`,
                animationDuration: `${2 + (i % 5) * 0.2}s`,
                backgroundColor: `hsl(${(i * 37) % 360} 80% 58%)`,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 flex w-[min(460px,calc(100vw-1rem))] flex-col items-center gap-5 text-center">
        <h2
          className={`font-arcade text-[44px] leading-none ${battleResult === 'win' ? 'oc-title-victory' : 'oc-title-defeat'}`}
        >
          {title}
        </h2>

        <div className="font-arcade text-[14px] tracking-[0.12em] text-white/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]">
          {subtitle}
        </div>

        {/* Reward / penalty info (small card) */}
        <div className="flex w-full flex-col gap-1 rounded-xl bg-black/40 px-4 py-2 text-[11px] text-white backdrop-blur-sm">
          <div>
            Duration{' '}
            <span className="font-mono font-bold">
              {battleTimeSec >= 1 ? `${battleTimeSec}s` : '<1s'}
              {lastBattleTickCount > 0 ? ` · ${lastBattleTickCount} tick` : ''}
            </span>
          </div>
          {battleResult === 'win' && (
            <div className="text-yellow-200">
              ⭐ +{gainedExp}
              {battleLootDrop ? ` · 掉落 ${battleLootDrop.icon} ${battleLootDrop.name}` : ''}
            </div>
          )}
          {battleResult === 'lose' && <div className="text-rose-200">战斗失败；装备与背包保留。</div>}
        </div>

        <div className="flex w-full max-w-[320px] flex-col gap-3">
          <button
            type="button"
            onClick={onContinue}
            className={`oc-arcade-btn ${battleResult === 'win' ? 'oc-arcade-btn-primary' : 'oc-arcade-btn-danger'}`}
          >
            CONTINUE
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="oc-arcade-btn"
            style={{
              background: battleResult === 'win' ? '#fff' : '#0f172a',
              color: battleResult === 'win' ? '#0f172a' : '#f3f4f6',
              borderColor: battleResult === 'win' ? '#cbd5e1' : '#7f1d1d',
              boxShadow: battleResult === 'win' ? '0 4px 0 0 #cbd5e1' : '0 4px 0 0 #7f1d1d',
            }}
          >
            BATTLE AGAIN
          </button>
        </div>
      </div>
    </div>
  )
}

