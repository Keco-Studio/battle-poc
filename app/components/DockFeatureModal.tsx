'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Trophy,
  ScrollText,
  MessageSquare,
  Swords,
  User,
  Sparkles,
  Search,
} from 'lucide-react'
import type { DockPanelId, GameState } from '../hooks/useGameState'
import { MOCK_PVP_USERS } from '../hooks/useGameState'
import { calcPlayerStats } from '../constants'
import ChatPanel from './ChatPanel'

export type ChatTargetOption = {
  id: string
  label: string
  kind?: 'system' | 'enemy'
  disabled?: boolean
}

const PANEL_META: Record<
  DockPanelId,
  { title: string; subtitle: (game: GameState) => string; Icon: typeof Trophy }
> = {
  achievements: {
    title: 'Battle history',
    subtitle: (g) => `Lv.${g.playerLevel} Warrior · Battle History`,
    Icon: Trophy,
  },
  log: {
    title: 'Battle log',
    subtitle: (g) => `Lv.${g.playerLevel} Warrior · Battle Details`,
    Icon: ScrollText,
  },
  chat: {
    title: 'Chat with Engineer Bolt',
    subtitle: (g) => `Lv.${g.playerLevel} Engineer · Tool Claw`,
    Icon: MessageSquare,
  },
  battle_system: {
    title: 'Start battle',
    subtitle: () => 'AI Agents Living & Thriving',
    Icon: Swords,
  },
  character_login: {
    title: 'Profile',
    subtitle: (g) => `Lv.${g.playerLevel} · Gold ${g.playerGold}`,
    Icon: User,
  },
}

interface Props {
  game: GameState
}

/** Mock Battle history entry: colorful icon + status pill matching the design */
type HistoryItem = {
  id: string
  who: string
  summary: string
  outcome: 'win' | 'lose'
  battleType: 'pve' | 'pvp'
}

function HistoryIcon({ battleType }: { battleType: 'pve' | 'pvp' }) {
  const base = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm'
  if (battleType === 'pvp') {
    return (
      <div className={`${base} bg-violet-500`}>
        <Trophy size={22} strokeWidth={2.4} />
      </div>
    )
  }
  return (
    <div className={`${base} bg-rose-400`}>
      <Swords size={22} strokeWidth={2.4} />
    </div>
  )
}

export default function DockFeatureModal({ game }: Props) {
  const { dockPanel, closeDockPanel, playerLevel, playerGold, battleLog } = game
  const [loginAccount, setLoginAccount] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  useEffect(() => {
    if (!dockPanel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDockPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dockPanel, closeDockPanel])

  const meta = useMemo(() => (dockPanel ? PANEL_META[dockPanel] : null), [dockPanel])
  const [pvpSearchQuery, setPvpSearchQuery] = useState('')

  if (!dockPanel || !meta) return null
  const { title, subtitle, Icon } = meta
  const isChat = dockPanel === 'chat'

  return (
    <div
      className={isChat ? 'oc-chat-panel' : 'oc-floating-panel oc-card'}
      role="dialog"
      aria-modal="false"
      aria-labelledby="dock-modal-title"
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
            <Icon size={18} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <div id="dock-modal-title" className="truncate text-[15px] font-bold text-slate-900">
              {title}
            </div>
            <div className="truncate text-[11px] text-slate-500">{subtitle(game)}</div>
          </div>
          {isChat && (
            <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ONLINE
            </div>
          )}
          <button
            type="button"
            onClick={closeDockPanel}
            aria-label="Close"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content area */}
        {isChat ? (
          <div className="min-h-0 flex-1">
            <ChatPanel
              game={game}
              embedded
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto bg-white p-3 text-sm text-slate-700">
            {dockPanel === 'achievements' && (
              <ul className="space-y-2">
                {game.battleLogs.length === 0 ? (
                  <li className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-slate-400">
                    <Swords size={28} className="opacity-40" />
                    <span className="text-[13px]">No battle records</span>
                    <span className="text-[11px]">Battle history will appear here</span>
                  </li>
                ) : (
                  game.battleLogs.slice().reverse().map((item) => {
                    const date = new Date(item.timestamp)
                    const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
                    const opponentLabel = item.opponentName ? `vs ${item.opponentName}` : item.battleType === 'pvp' ? 'vs Unknown' : 'vs Wild Monster'
                    const summary = item.expGained != null ? `${item.rounds} rounds · EXP+${item.expGained}` : `${item.rounds} rounds`
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_2px_6px_-2px_rgba(15,23,42,0.06)]"
                      >
                        <HistoryIcon battleType={item.battleType} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-bold text-slate-900">{opponentLabel}</div>
                          <div className="truncate text-[12px] text-slate-500">{summary}</div>
                          <div className="mt-1 flex items-center gap-1">
                            <span className={`oc-pill ${item.result === 'win' ? 'oc-pill-win' : 'oc-pill-lose'}`}>
                              {item.result === 'win' ? 'Won' : 'Failed'}
                            </span>
                            <span className="text-[10px] text-slate-400">{timeStr}</span>
                          </div>
                        </div>
                      </li>
                    )
                  })
                )}
              </ul>
            )}

            {dockPanel === 'log' && (
              <div className="space-y-2">
                <p className="text-[12px] text-slate-500">Battle event stream (last 20 entries)</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-700">
                  {battleLog.length === 0 ? (
                    <span className="text-slate-400">No battle records</span>
                  ) : (
                    battleLog.slice(-20).map((line, i) => (
                      <div key={i} className="border-b border-slate-200/70 py-1 last:border-b-0">
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {dockPanel === 'battle_system' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-orange-500 shrink-0" />
                  <span className="text-[13px] font-bold text-slate-900">Search PVP Opponent</span>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={pvpSearchQuery}
                    onChange={(e) => setPvpSearchQuery(e.target.value)}
                    placeholder="Search username..."
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                  />
                </div>
                <div className="space-y-1.5">
                  {MOCK_PVP_USERS.filter((u) =>
                    u.name.toLowerCase().includes(pvpSearchQuery.toLowerCase()),
                  ).length === 0 ? (
                    <div className="flex flex-col items-center gap-1 py-4 text-slate-400">
                      <User size={24} className="opacity-40" />
                      <span className="text-[12px]">User not found</span>
                    </div>
                  ) : (
                    MOCK_PVP_USERS.filter((u) =>
                      u.name.toLowerCase().includes(pvpSearchQuery.toLowerCase()),
                    ).map((user) => {
                      const stats = calcPlayerStats(user.level)
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            game.startPVPBattle(user.id)
                            closeDockPanel()
                          }}
                          className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-orange-300 hover:bg-orange-50 transition-colors"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[18px] font-bold text-slate-600">
                            {user.name[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-bold text-slate-900">{user.name}</span>
                              <span className="text-[10px] font-bold text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">
                                Lv.{user.level}
                              </span>
                            </div>
                            <div className="flex gap-3 text-[11px] text-slate-500 mt-0.5">
                              <span className="text-rose-500">ATK {stats.atk}</span>
                              <span className="text-sky-500">DEF {stats.def}</span>
                              <span className="text-amber-500">SPD {stats.spd}</span>
                            </div>
                          </div>
                          <Swords size={14} className="text-slate-300 shrink-0" />
                        </button>
                      )
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 text-center">
                  {MOCK_PVP_USERS.length} players online · Click to start battle
                </p>
              </div>
            )}

            {dockPanel === 'character_login' && (
              <div className="flex flex-col items-center">
                <div className="oc-rainbow-border w-full max-w-[340px] p-5">
                  <div className="mb-3 text-center">
                    <div className="mb-1 flex items-center justify-center gap-1 text-[15px] font-bold text-slate-900">
                      <Sparkles size={14} className="text-orange-500" />
                      Battle Arena
                      <Sparkles size={14} className="text-orange-500" />
                    </div>
                    <div className="text-[11px] text-slate-500">Real-time Auto Battle · Demo Login</div>
                  </div>

                  <label className="mb-3 block">
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-700">
                      <User size={12} /> Account
                    </span>
                    <input
                      type="text"
                      value={loginAccount}
                      onChange={(e) => setLoginAccount(e.target.value)}
                      placeholder="Enter account"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                    />
                  </label>
                  <label className="mb-4 block">
                    <span className="mb-1 flex items-center justify-between gap-1 text-[11px] font-bold text-slate-700">
                      <span>Password</span>
                      <button type="button" className="text-slate-400 hover:text-slate-600">
                        Show
                      </button>
                    </span>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="**********"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                    />
                  </label>

                  <button type="button" className="oc-arcade-btn oc-arcade-btn-cta">
                    ENTER ARENA
                  </button>
                  <div className="mt-3 text-center">
                    <button type="button" className="text-[12px] font-bold text-slate-500 hover:text-slate-700">
                      Continue as Guest
                    </button>
                  </div>
                  <div className="mt-4 border-t border-dashed border-slate-200 pt-3 text-center text-[11px] text-slate-500">
                    Local Character Lv.{playerLevel} · Gold {playerGold}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
