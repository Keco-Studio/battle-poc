'use client'

export type EnemyInfoModalProps = {
  open: boolean
  enemyName: string
  enemyPreview: { level: number; stats: { maxHp: number; atk: number; def: number; spd: number } }
  onBattle: () => void
  onChat: () => void
  onClose: () => void
}

function toPercent(value: number, maxValue: number) {
  return `${Math.max(8, Math.min(100, (value / maxValue) * 100))}%`
}

export default function EnemyInfoModal(props: EnemyInfoModalProps) {
  const { open, enemyName, enemyPreview, onBattle, onChat, onClose } = props
  if (!open) return null

  const hpPercent = toPercent(enemyPreview.stats.maxHp, 240)
  const atkPercent = toPercent(enemyPreview.stats.atk, 120)
  const defPercent = toPercent(enemyPreview.stats.def, 120)

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/80 bg-gradient-to-br from-pink-100 via-blue-50 to-cyan-100 p-5 shadow-[0_20px_45px_rgba(76,29,149,0.22)]">
        <div className="font-arcade rounded-2xl border border-white/90 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-sm">
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-gradient-to-r from-white/85 to-sky-100/90 p-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-gradient-to-b from-sky-50 to-indigo-100 shadow-[inset_0_2px_0_rgba(255,255,255,0.8)]">
              <img src="/enemy/idle/south.png" alt="Enemy" className="h-16 object-contain pixelated" />
            </div>
            <div className="flex min-h-20 flex-1 flex-col justify-between py-0.5">
              <h3 className="text-xl font-black leading-none text-slate-800">{enemyName}</h3>
              <div className="inline-flex w-fit rounded-xl border border-violet-200 bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
                Level Lv.{enemyPreview.level}
              </div>
              <div className="inline-flex w-fit rounded-xl border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-600">
                Race: Demon
              </div>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onBattle}
              className="rounded-xl border border-emerald-300 bg-gradient-to-b from-emerald-300 to-emerald-500 py-2 text-sm font-black tracking-wide text-white shadow-[0_4px_0_rgba(5,150,105,0.55)] transition hover:brightness-105"
            >
              BATTLE
            </button>
            <button
              type="button"
              onClick={onChat}
              className="rounded-xl border border-fuchsia-300 bg-gradient-to-b from-fuchsia-300 to-fuchsia-500 py-2 text-sm font-black tracking-wide text-white shadow-[0_4px_0_rgba(192,38,211,0.5)] transition hover:brightness-105"
            >
              CHAT
            </button>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/85 p-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-slate-500">BATTLE STATS</p>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm font-bold text-slate-700">
                <span>HP</span>
                <span className="text-emerald-500">{enemyPreview.stats.maxHp}</span>
              </div>
              <div className="h-2 rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-400"
                  style={{ width: hpPercent }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm font-bold text-slate-700">
                <span>Attack</span>
                <span className="text-fuchsia-500">{enemyPreview.stats.atk}</span>
              </div>
              <div className="h-2 rounded-full bg-fuchsia-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500"
                  style={{ width: atkPercent }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm font-bold text-slate-700">
                <span>Defense</span>
                <span className="text-orange-500">{enemyPreview.stats.def}</span>
              </div>
              <div className="h-2 rounded-full bg-orange-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500"
                  style={{ width: defPercent }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm font-bold text-slate-700">
              <span>Speed</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-600">{enemyPreview.stats.spd}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-slate-300 bg-white/80 py-2 font-bold text-slate-600 transition hover:bg-white"
        >
          Close
        </button>
      </div>
    </div>
  )
}

