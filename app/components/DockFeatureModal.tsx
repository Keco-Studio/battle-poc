'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X,
  Trophy,
  ScrollText,
  MessageSquare,
  Swords,
  User,
  Sparkles,
  LogOut,
} from 'lucide-react'
import type { DockPanelId, GameState } from '../hooks/useGameState'
import { MOCK_PVP_USERS } from '../hooks/useGameState'
import { calcPlayerStats } from '../constants'
import ChatPanel from './ChatPanel'
import { isBattleSupabaseConfigured, useSupabaseOptional } from '@/src/lib/SupabaseContext'

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
  const { dockPanel, closeDockPanel, playerLevel, playerGold, battleLog, login, logoutAccount } = game
  const supabase = useSupabaseOptional()
  const [loginAccount, setLoginAccount] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setSessionEmail(null)
      return
    }
    const { data } = await supabase.auth.getSession()
    const email = data.session?.user?.email ?? null
    setSessionEmail(email)
  }, [supabase])

  useEffect(() => {
    if (dockPanel !== 'character_login') return
    void refreshSession()
  }, [dockPanel, refreshSession])

  useEffect(() => {
    if (!supabase || dockPanel !== 'character_login') return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [supabase, dockPanel])

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
        {/* Header: icon, title, subtitle, close */}
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

        {/* Body */}
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
                    <div className="text-[11px] text-slate-500">
                      {isBattleSupabaseConfigured()
                        ? 'Supabase 账号 · 与 keco-studio 相同方式配置环境变量'
                        : '未配置 Supabase：仅本地访客；请在 .env 中设置 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY'}
                    </div>
                  </div>

                  {!isBattleSupabaseConfigured() || !supabase ? (
                    <>
                      <p className="mb-4 text-center text-[12px] leading-relaxed text-slate-600">
                        配置好 Supabase 后即可邮箱注册/登录；存档仍优先在浏览器本地。
                      </p>
                      <button
                        type="button"
                        onClick={() => closeDockPanel()}
                        className="oc-arcade-btn oc-arcade-btn-cta w-full"
                      >
                        以访客身份继续
                      </button>
                    </>
                  ) : sessionEmail ? (
                    <div className="space-y-3 text-center text-[13px] text-slate-700">
                      <p>
                        当前会话：<span className="font-semibold text-slate-900">{sessionEmail}</span>
                      </p>
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={async () => {
                          setAuthError(null)
                          setAuthLoading(true)
                          try {
                            await supabase.auth.signOut()
                            logoutAccount()
                            setSessionEmail(null)
                          } catch (e) {
                            setAuthError(e instanceof Error ? e.message : '登出失败')
                          } finally {
                            setAuthLoading(false)
                          }
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <LogOut size={14} />
                        退出登录
                      </button>
                      {authError && <p className="text-[12px] text-rose-600">{authError}</p>}
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-center gap-2 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('signin')
                            setAuthError(null)
                          }}
                          className={
                            authMode === 'signin'
                              ? 'text-orange-600 underline underline-offset-2'
                              : 'text-slate-400 hover:text-slate-600'
                          }
                        >
                          登录
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('signup')
                            setAuthError(null)
                          }}
                          className={
                            authMode === 'signup'
                              ? 'text-orange-600 underline underline-offset-2'
                              : 'text-slate-400 hover:text-slate-600'
                          }
                        >
                          注册
                        </button>
                      </div>

                      <label className="mb-3 block">
                        <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-700">
                          <User size={12} /> 邮箱
                        </span>
                        <input
                          type="email"
                          autoComplete="email"
                          value={loginAccount}
                          onChange={(e) => setLoginAccount(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                        />
                      </label>
                      <label className="mb-4 block">
                        <span className="mb-1 flex items-center justify-between gap-1 text-[11px] font-bold text-slate-700">
                          <span>密码</span>
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="font-normal text-slate-400 hover:text-slate-600"
                          >
                            {showPassword ? '隐藏' : '显示'}
                          </button>
                        </span>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="**********"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                        />
                      </label>

                      {authError && (
                        <p className="mb-3 rounded-lg bg-rose-50 px-2 py-1.5 text-center text-[12px] text-rose-700">
                          {authError}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={async () => {
                          setAuthError(null)
                          const email = loginAccount.trim()
                          const password = loginPassword
                          if (!email) {
                            setAuthError('请输入邮箱')
                            return
                          }
                          if (password.length < 6) {
                            setAuthError('密码至少 6 位（Supabase 默认策略）')
                            return
                          }
                          setAuthLoading(true)
                          try {
                            if (authMode === 'signup') {
                              const { error } = await supabase.auth.signUp({ email, password })
                              if (error) {
                                setAuthError(error.message)
                                return
                              }
                              const { data } = await supabase.auth.getSession()
                              if (data.session?.user?.email) {
                                login(data.session.user.email)
                                setSessionEmail(data.session.user.email)
                              } else {
                                setAuthError('注册成功。若项目开启邮箱确认，请查收邮件后再登录。')
                              }
                            } else {
                              const { error } = await supabase.auth.signInWithPassword({ email, password })
                              if (error) {
                                setAuthError(error.message)
                                return
                              }
                              const { data } = await supabase.auth.getSession()
                              const em = data.session?.user?.email
                              if (em) {
                                login(em)
                                setSessionEmail(em)
                              }
                            }
                          } finally {
                            setAuthLoading(false)
                          }
                        }}
                        className="oc-arcade-btn oc-arcade-btn-cta w-full disabled:opacity-60"
                      >
                        {authLoading ? '请稍候…' : authMode === 'signup' ? '注册并进入' : 'ENTER ARENA'}
                      </button>
                      <div className="mt-3 text-center">
                        <button
                          type="button"
                          onClick={() => closeDockPanel()}
                          className="text-[12px] font-bold text-slate-500 hover:text-slate-700"
                        >
                          以访客身份继续
                        </button>
                      </div>
                    </>
                  )}

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
