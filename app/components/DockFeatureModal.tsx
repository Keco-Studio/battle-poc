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
  Search,
  Eye,
  EyeOff,
} from 'lucide-react'
import type { DockPanelId, GameState, PVPUser } from '../hooks/useGameState'
import { calcPlayerStats } from '../constants'
import ChatPanel from './ChatPanel'
import { isBattleSupabaseConfigured, useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { savePlayerSave } from '@/src/lib/db/player-saves'
import { DATA_FLOW_TRACE_EVENT, getDataFlowTrace, pushDataFlowTrace, type DataFlowTraceItem } from '@/src/lib/debug/data-flow-trace'
import { getProfileAuthViewState } from '@/src/lib/auth/profile-auth-view-state'

const CACHE_TTL_MS = 300 * 1000
const SESSION_CACHE_KEY = 'battle:profile-session-cache'
const PVP_CACHE_KEY = 'battle:pvp-users-cache'

type SessionCachePayload = {
  email: string | null
  cachedAt: number
}

type PvpCachePayload = {
  users: PVPUser[]
  cachedAt: number
}

function readSessionCache(): SessionCachePayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionCachePayload
    if (typeof parsed?.cachedAt !== 'number') return null
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null
    return {
      email: typeof parsed.email === 'string' ? parsed.email : null,
      cachedAt: parsed.cachedAt,
    }
  } catch {
    return null
  }
}

function writeSessionCache(email: string | null) {
  if (typeof window === 'undefined') return
  try {
    const payload: SessionCachePayload = { email, cachedAt: Date.now() }
    window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore cache errors and continue with live auth behavior.
  }
}

function readPvpUsersCache(): PvpCachePayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(PVP_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PvpCachePayload
    if (typeof parsed?.cachedAt !== 'number' || !Array.isArray(parsed?.users)) return null
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null
    return {
      users: parsed.users,
      cachedAt: parsed.cachedAt,
    }
  } catch {
    return null
  }
}

function writePvpUsersCache(users: PVPUser[]) {
  if (typeof window === 'undefined') return
  try {
    const payload: PvpCachePayload = { users, cachedAt: Date.now() }
    window.sessionStorage.setItem(PVP_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore cache errors and continue with live data behavior.
  }
}

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
    subtitle: (g) => `Lv.${g.playerLevel} Warrior`,
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

function getFriendlyAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Authentication failed'
  const dbError = error as { code?: string; message?: string } | null
  if (dbError?.code === '23505' && /character_name/i.test(dbError.message ?? '')) {
    return 'Display name is already taken. Please choose another one.'
  }
  return message
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
  const { dockPanel, closeDockPanel, playerLevel, battleLog, login, logoutAccount } = game
  const supabase = useSupabaseOptional()
  const [loginAccount, setLoginAccount] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authLoading, setAuthLoading] = useState(false)
  const [authResolved, setAuthResolved] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [dataFlowTrace, setDataFlowTrace] = useState<DataFlowTraceItem[]>([])
  const [pvpUsers, setPvpUsers] = useState<PVPUser[]>([])
  const [pvpLoading, setPvpLoading] = useState(false)
  const [pvpError, setPvpError] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setSessionEmail(null)
      setAuthResolved(true)
      return
    }
    const cached = readSessionCache()
    if (cached) {
      setSessionEmail(cached.email)
      setAuthResolved(true)
      return
    }
    const { data } = await supabase.auth.getSession()
    const email = data.session?.user?.email ?? null
    setSessionEmail(email)
    writeSessionCache(email)
    setAuthResolved(true)
  }, [supabase])

  useEffect(() => {
    if (dockPanel !== 'character_login') return
    setAuthResolved(false)
    void refreshSession()
  }, [dockPanel, refreshSession])

  useEffect(() => {
    if (!supabase || dockPanel !== 'character_login') return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email ?? null
      setSessionEmail(email)
      writeSessionCache(email)
      setAuthResolved(true)
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

  useEffect(() => {
    if (dockPanel !== 'character_login') return
    const refresh = () => setDataFlowTrace(getDataFlowTrace())
    refresh()
    window.addEventListener(DATA_FLOW_TRACE_EVENT, refresh as EventListener)
    return () => window.removeEventListener(DATA_FLOW_TRACE_EVENT, refresh as EventListener)
  }, [dockPanel])

  useEffect(() => {
    if (dockPanel !== 'battle_system') return
    if (!supabase) {
      setPvpUsers([])
      setPvpError('Supabase is not configured')
      return
    }
    const cached = readPvpUsersCache()
    if (cached) {
      setPvpUsers(cached.users)
      setPvpError(null)
      setPvpLoading(false)
      return
    }

    let cancelled = false

    const loadPvpUsers = async () => {
      setPvpLoading(true)
      setPvpError(null)
      pushDataFlowTrace('loadPvpUsers', 'start')
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        let query = supabase
          .from('player_saves')
          .select('user_id, character_name, level, carried_skill_ids')
          .order('level', { ascending: false })
          .limit(100)

        if (user?.id) {
          query = query.neq('user_id', user.id)
        }

        const { data, error } = await query
        if (error) throw error

        const rows = Array.isArray(data) ? data : []
        const mapped: PVPUser[] = rows.map((row) => ({
          id: String(row.user_id),
          name: String(row.character_name || 'Adventurer'),
          level: Math.max(1, Number(row.level ?? 1)),
          carriedSkillIds: Array.isArray(row.carried_skill_ids)
            ? row.carried_skill_ids.map((id: unknown) => String(id))
            : [],
        }))
        if (!cancelled) {
          setPvpUsers(mapped)
          writePvpUsersCache(mapped)
          pushDataFlowTrace('loadPvpUsers', 'success', `Loaded ${mapped.length} players`)
        }
      } catch (e) {
        if (!cancelled) {
          setPvpUsers([])
          const message = e instanceof Error ? e.message : 'Failed to load PVP players'
          setPvpError(message)
          pushDataFlowTrace('loadPvpUsers', 'error', message)
        }
      } finally {
        if (!cancelled) {
          setPvpLoading(false)
        }
      }
    }

    void loadPvpUsers()

    return () => {
      cancelled = true
    }
  }, [dockPanel, supabase])

  const meta = useMemo(() => (dockPanel ? PANEL_META[dockPanel] : null), [dockPanel])
  const profileAuthViewState = useMemo(
    () =>
      getProfileAuthViewState({
        supabaseConfigured: isBattleSupabaseConfigured(),
        hasSupabaseClient: Boolean(supabase),
        authResolved,
        sessionEmail,
      }),
    [authResolved, sessionEmail, supabase],
  )
  const [pvpSearchQuery, setPvpSearchQuery] = useState('')

  if (!dockPanel || !meta) return null
  const { title, subtitle, Icon } = meta
  const isChat = dockPanel === 'chat'
  const filteredPvpUsers = pvpUsers.filter((u) =>
    u.name.toLowerCase().includes(pvpSearchQuery.toLowerCase()),
  )

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
                  {pvpLoading ? (
                    <div className="flex flex-col items-center gap-1 py-4 text-slate-400">
                      <span className="text-[12px]">Loading players...</span>
                    </div>
                  ) : filteredPvpUsers.length === 0 ? (
                    <div className="flex flex-col items-center gap-1 py-4 text-slate-400">
                      <User size={24} className="opacity-40" />
                      <span className="text-[12px]">{pvpError ? 'Unable to load players' : 'User not found'}</span>
                    </div>
                  ) : (
                    filteredPvpUsers.map((user) => {
                      const stats = calcPlayerStats(user.level)
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            game.startPVPBattle(user)
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
                {pvpError && (
                  <p className="text-[10px] text-rose-500 text-center break-words">
                    {pvpError}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 text-center">
                  {pvpUsers.length} players online · Click to start battle
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
                        ? 'Supabase account · configure env vars the same way as keco-studio'
                        : 'Supabase is not configured: local guest mode only. Set NEXT_PUBLIC_SUPABASE_URL / ANON_KEY in .env'}
                    </div>
                  </div>

                  {profileAuthViewState === 'guest-mode' ? (
                    <>
                      <p className="mb-4 text-center text-[12px] leading-relaxed text-slate-600">
                        Configure Supabase to enable email sign-up/login; saves still prioritize browser local storage.
                      </p>
                      <button
                        type="button"
                        onClick={() => closeDockPanel()}
                        className="oc-arcade-btn oc-arcade-btn-cta w-full"
                      >
                        Continue as Guest
                      </button>
                    </>
                  ) : profileAuthViewState === 'checking' ? (
                    <div className="space-y-3 text-center text-[13px] text-slate-700">
                      <p>Checking current session...</p>
                    </div>
                  ) : profileAuthViewState === 'authenticated' && sessionEmail ? (
                    <div className="space-y-3 text-center text-[13px] text-slate-700">
                      <p>
                        Current session: <span className="font-semibold text-slate-900">{sessionEmail}</span>
                      </p>
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={async () => {
                          setAuthError(null)
                          setAuthLoading(true)
                          try {
                            pushDataFlowTrace('auth.signOut', 'start')
                            await supabase!.auth.signOut()
                            logoutAccount()
                            setSessionEmail(null)
                            pushDataFlowTrace('auth.signOut', 'success')
                          } catch (e) {
                            pushDataFlowTrace('auth.signOut', 'error', e instanceof Error ? e.message : 'Sign out failed')
                            setAuthError(e instanceof Error ? e.message : 'Sign out failed')
                          } finally {
                            setAuthLoading(false)
                          }
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <LogOut size={14} />
                        Sign out
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
                            setConfirmPassword('')
                            setShowConfirmPassword(false)
                          }}
                          className={
                            authMode === 'signin'
                              ? 'text-orange-600 underline underline-offset-2'
                              : 'text-slate-400 hover:text-slate-600'
                          }
                        >
                          Sign in
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
                          Sign up
                        </button>
                      </div>

                      <label className="mb-3 block">
                        <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-700">
                          <User size={12} /> Email
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
                      {authMode === 'signup' && (
                        <label className="mb-3 block">
                          <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            <User size={12} /> Display name
                          </span>
                          <input
                            type="text"
                            autoComplete="nickname"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Adventurer"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                          />
                        </label>
                      )}
                      <label className="mb-4 block">
                        <span className="mb-1 flex items-center justify-between gap-1 text-[11px] font-bold text-slate-700">
                          <span>Password</span>
                        </span>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            placeholder="**********"
                            className="auth-password-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </label>
                      {authMode === 'signup' && (
                        <label className="mb-4 block">
                          <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            Confirm password
                          </span>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="**********"
                              className="auth-password-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword((v) => !v)}
                              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                              className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            >
                              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </label>
                      )}

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
                            setAuthError('Please enter email')
                            return
                          }
                          const trimmedDisplayName = displayName.trim()
                          if (authMode === 'signup' && !trimmedDisplayName) {
                            setAuthError('Please choose a display name')
                            return
                          }
                          if (password.length < 6) {
                            setAuthError('Password must be at least 6 characters (Supabase default policy)')
                            return
                          }
                          if (authMode === 'signup' && password !== confirmPassword) {
                            setAuthError('Passwords do not match')
                            return
                          }
                          setAuthLoading(true)
                          try {
                            if (authMode === 'signup') {
                              pushDataFlowTrace('auth.signUp', 'start')
                              const { error: signUpError } = await supabase!.auth.signUp({ email, password })
                              if (signUpError) {
                                pushDataFlowTrace('auth.signUp', 'error', signUpError.message)
                                setAuthError(signUpError.message)
                                return
                              }
                              pushDataFlowTrace('auth.signUp', 'success')

                              const { data } = await supabase!.auth.getSession()
                              if (data.session?.user?.email) {
                                login(data.session.user.email)
                                setSessionEmail(data.session.user.email)
                                await savePlayerSave({ character_name: trimmedDisplayName })
                              } else {
                                // For projects with email-confirm disabled, sign-up may still return no active session.
                                // Retry password sign-in so users can enter the game immediately.
                                pushDataFlowTrace('auth.signInWithPassword', 'start', 'Retry after sign-up')
                                const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password })
                                if (signInError) {
                                  pushDataFlowTrace('auth.signInWithPassword', 'error', signInError.message)
                                  setAuthError('Sign-up succeeded. Please sign in with the same email and password.')
                                  return
                                }
                                pushDataFlowTrace('auth.signInWithPassword', 'success')
                                const { data: signedInData } = await supabase!.auth.getSession()
                                const signedInEmail = signedInData.session?.user?.email
                                if (signedInEmail) {
                                  login(signedInEmail)
                                  setSessionEmail(signedInEmail)
                                  await savePlayerSave({ character_name: trimmedDisplayName })
                                }
                              }
                            } else {
                              pushDataFlowTrace('auth.signInWithPassword', 'start')
                              const { error } = await supabase!.auth.signInWithPassword({ email, password })
                              if (error) {
                                pushDataFlowTrace('auth.signInWithPassword', 'error', error.message)
                                setAuthError(error.message)
                                return
                              }
                              pushDataFlowTrace('auth.signInWithPassword', 'success')
                              const { data } = await supabase!.auth.getSession()
                              const em = data.session?.user?.email
                              if (em) {
                                login(em)
                                setSessionEmail(em)
                              }
                            }
                          } catch (e) {
                            const friendlyMessage = getFriendlyAuthErrorMessage(e)
                            setAuthError(friendlyMessage)
                            pushDataFlowTrace(
                              authMode === 'signup' ? 'auth.signUp' : 'auth.signInWithPassword',
                              'error',
                              friendlyMessage
                            )
                          } finally {
                            setAuthLoading(false)
                          }
                        }}
                        className="oc-arcade-btn oc-arcade-btn-cta w-full disabled:opacity-60"
                      >
                        {authLoading ? 'Please wait…' : authMode === 'signup' ? 'Sign up and enter' : 'ENTER ARENA'}
                      </button>
                      <div className="mt-3 text-center">
                        <button
                          type="button"
                          onClick={() => closeDockPanel()}
                          className="text-[12px] font-bold text-slate-500 hover:text-slate-700"
                        >
                          Continue as Guest
                        </button>
                      </div>
                    </>
                  )}
                  <div className="mt-4 border-t border-dashed border-slate-200 pt-3 text-center text-[11px] text-slate-500">
                    本地角色 Lv.{playerLevel}
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="mb-1 text-[11px] font-bold text-slate-700">Data Sync Trace</div>
                    <div className="max-h-28 space-y-1 overflow-y-auto text-[10px] text-slate-600">
                      {dataFlowTrace.length === 0 ? (
                        <div>No events yet</div>
                      ) : (
                        dataFlowTrace.slice(0, 8).map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${item.status === 'success' ? 'bg-emerald-500' : item.status === 'error' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                            <span>{new Date(item.time).toLocaleTimeString()} · {item.action}</span>
                          </div>
                        ))
                      )}
                    </div>
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
