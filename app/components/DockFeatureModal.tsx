'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Trophy,
  ScrollText,
  MessageSquare,
  Swords,
  User,
  ArrowUp,
  Sparkles,
} from 'lucide-react'
import type { DockPanelId, GameState } from '../hooks/useGameState'
import ChatPanel from './ChatPanel'

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
    subtitle: (g) => `Lv.${g.playerLevel} · 金币 ${g.playerGold}`,
    Icon: User,
  },
}

interface Props {
  game: GameState
}

/** 模拟 Battle history 条目：与图 1 一致的多彩图标 + 状态 pill */
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
        {/* 头部：图标 + 标题 + 小副标题 + X 关闭 */}
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

        {/* 内容区 */}
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
                    <div className="text-[11px] text-slate-500">实时自动战斗 · Demo 登录</div>
                  </div>

                  <label className="mb-3 block">
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-700">
                      <User size={12} /> 账号
                    </span>
                    <input
                      type="text"
                      value={loginAccount}
                      onChange={(e) => setLoginAccount(e.target.value)}
                      placeholder="输入账号"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
                    />
                  </label>
                  <label className="mb-4 block">
                    <span className="mb-1 flex items-center justify-between gap-1 text-[11px] font-bold text-slate-700">
                      <span>密码</span>
                      <button type="button" className="text-slate-400 hover:text-slate-600">
                        显示
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
                      以访客身份继续
                    </button>
                  </div>
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
