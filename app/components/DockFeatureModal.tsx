'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X,
  Trophy,
  ScrollText,
  MessageSquare,
  Swords,
  User,
  ArrowUp,
  Sparkles,
  LogOut,
} from 'lucide-react'
import type { DockPanelId, GameState } from '../hooks/useGameState'
import ChatPanel from './ChatPanel'
import { isBattleSupabaseConfigured, useSupabaseOptional } from '@/src/lib/SupabaseContext'

const PANEL_META: Record<
  DockPanelId,
  { title: string; subtitle: (game: GameState) => string; Icon: typeof Trophy }
> = {
  achievements: {
    title: 'Battle history',
    subtitle: (g) => `Lv.${g.playerLevel} Warrior · 战绩回顾`,
    Icon: Trophy,
  },
  log: {
    title: 'Battle log',
    subtitle: (g) => `Lv.${g.playerLevel} Warrior · 本次战斗明细`,
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
    subtitle: (g) =>
      g.accountLabel
        ? `已登录 · ${g.accountLabel}`
        : `Lv.${g.playerLevel} · 金币 ${g.playerGold} · 访客或未登录`,
    Icon: User,
  },
}

interface Props {
  game: GameState
}

/** Demo battle history rows: colored icons + outcome pill (layout reference). */
type HistoryItem = {
  id: string
  who: string
  summary: string
  outcome: 'win' | 'lose'
  variant: 'up' | 'swords' | 'chat' | 'trophy'
}

const HISTORY_DEMO: HistoryItem[] = [
  { id: 'h1', who: 'lyra', summary: 'Dealt 245 damage in 3:…', outcome: 'lose', variant: 'up' },
  { id: 'h2', who: 'kk', summary: 'Dealt 245 damage in 3:…', outcome: 'win', variant: 'swords' },
  { id: 'h3', who: 'raven', summary: 'Dealt 310 damage in 4:…', outcome: 'win', variant: 'chat' },
  { id: 'h4', who: 'orion', summary: 'Dealt 198 damage in 2:…', outcome: 'lose', variant: 'swords' },
  { id: 'h5', who: 'selene', summary: 'Dealt 275 damage in 3:…', outcome: 'win', variant: 'trophy' },
  { id: 'h6', who: 'fenrir', summary: 'Dealt 220 damage in 3:…', outcome: 'lose', variant: 'swords' },
]

function HistoryIcon({ variant }: { variant: HistoryItem['variant'] }) {
  const base = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm'
  if (variant === 'up') {
    return (
      <div className={`${base} bg-emerald-500`}>
        <ArrowUp size={22} strokeWidth={2.6} />
      </div>
    )
  }
  if (variant === 'swords') {
    return (
      <div className={`${base} bg-rose-400`}>
        <Swords size={22} strokeWidth={2.4} />
      </div>
    )
  }
  if (variant === 'chat') {
    return (
      <div className={`${base} bg-orange-400`}>
        <MessageSquare size={22} strokeWidth={2.4} />
      </div>
    )
  }
  return (
    <div className={`${base} bg-violet-500`}>
      <Trophy size={22} strokeWidth={2.4} />
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
            aria-label="关闭"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {isChat ? (
          <div className="min-h-0 flex-1">
            <ChatPanel game={game} embedded />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto bg-white p-3 text-sm text-slate-700">
            {dockPanel === 'achievements' && (
              <ul className="space-y-2">
                {HISTORY_DEMO.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_2px_6px_-2px_rgba(15,23,42,0.06)]"
                  >
                    <HistoryIcon variant={item.variant} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-slate-900">with {item.who}</div>
                      <div className="truncate text-[12px] text-slate-500">{item.summary}</div>
                      <div className="mt-1">
                        <span className={`oc-pill ${item.outcome === 'win' ? 'oc-pill-win' : 'oc-pill-lose'}`}>
                          {item.outcome === 'win' ? 'Won' : 'Failed'}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {dockPanel === 'log' && (
              <div className="space-y-2">
                <p className="text-[12px] text-slate-500">本次战斗事件流（最多保留 20 条）</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-700">
                  {battleLog.length === 0 ? (
                    <span className="text-slate-400">暂无战斗记录</span>
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
              <div className="space-y-3 text-[13px] leading-relaxed text-slate-700">
                <div className="flex items-center gap-2 text-slate-900">
                  <Sparkles size={16} className="text-orange-500" />
                  <span className="font-bold">实时自动战斗</span>
                </div>
                <p>由定时器驱动；玩家与敌人各自按攻速间隔自动出手。可预选"下一发"技能并受冷却限制。</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 text-[12px] font-bold text-slate-900">伤害</div>
                  <p className="text-[12px] text-slate-600">平滑承伤公式；防御技能减半本次受到伤害。</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 text-[12px] font-bold text-slate-900">逃跑</div>
                  <p className="text-[12px] text-slate-600">可手动逃跑；也可按血量百分比自动撤离。</p>
                </div>
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

                  <div className="mt-4 border-t border-dashed border-slate-200 pt-3 text-center text-[11px] text-slate-500">
                    本地角色 Lv.{playerLevel} · 金币 {playerGold}
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
