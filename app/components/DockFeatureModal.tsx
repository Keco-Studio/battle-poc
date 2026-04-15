'use client'

import { useEffect, useState } from 'react'
import { Press_Start_2P } from 'next/font/google'
import type { DockPanelId, GameState } from '../hooks/useGameState'

const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
})

const PANEL_TITLE: Record<DockPanelId, string> = {
  achievements: '成就',
  log: '日志',
  chat: '聊天',
  battle_system: '战斗系统',
  character_login: '角色登录',
}

interface Props {
  game: GameState
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

  if (!dockPanel) return null

  const title = PANEL_TITLE[dockPanel]

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 px-4"
      onClick={closeDockPanel}
      role="presentation"
    >
      <div
        className="relative flex h-[600px] w-[800px] flex-col overflow-hidden rounded-3xl border-4 border-yellow-400 bg-gradient-to-b from-blue-800 to-purple-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dock-modal-title"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b-4 border-orange-500 bg-gradient-to-b from-yellow-400 to-yellow-500 px-3">
          <span id="dock-modal-title" className="text-base font-bold text-orange-900">
            {title}
          </span>
          <button
            type="button"
            onClick={closeDockPanel}
            className="rounded-lg border-2 border-orange-700 bg-orange-200/80 px-3 py-1 text-sm font-bold text-orange-950 hover:bg-orange-100"
          >
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-left text-sm text-gray-200">
          {dockPanel === 'achievements' && (
            <div className="space-y-3">
              <p className="text-white/90">成就系统占位。后续可接入：击杀数、探索进度、收集品等。</p>
              <ul className="list-inside list-disc text-gray-400">
                <li>初出茅庐 — 占位</li>
                <li>连胜三场 — 占位</li>
              </ul>
            </div>
          )}
          {dockPanel === 'log' && (
            <div className="space-y-2">
              <p className="text-white/90">游戏内事件与战斗摘要（占位）。当前会话暂无持久化日志列表。</p>
              <div className="rounded-lg border border-blue-500/40 bg-black/30 p-3 font-mono text-xs text-gray-300">
                {battleLog.length === 0 ? (
                  <span className="text-gray-500">离开战斗后暂无最近战斗记录。</span>
                ) : (
                  battleLog.slice(-20).map((line, i) => (
                    <div key={i}>{line}</div>
                  ))
                )}
              </div>
            </div>
          )}
          {dockPanel === 'chat' && (
            <div className="flex h-full flex-col gap-3">
              <p className="text-white/90">聊天频道占位（需后端 / WebSocket 时再接入）。</p>
              <div className="flex-1 rounded-lg border border-purple-500/40 bg-black/25 p-3 text-gray-500">
                暂无消息
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled
                  placeholder="输入消息…"
                  className="flex-1 rounded-lg border border-gray-600 bg-gray-900/80 px-3 py-2 text-white placeholder:text-gray-600"
                />
                <button
                  type="button"
                  disabled
                  className="rounded-lg bg-gray-600 px-4 py-2 text-xs font-bold text-gray-400"
                >
                  发送
                </button>
              </div>
            </div>
          )}
          {dockPanel === 'battle_system' && (
            <div className="space-y-3 text-white/90 leading-relaxed">
              <p>
                <strong className="text-amber-200">实时自动战斗</strong>
                ：由定时器驱动，玩家与敌人各自按攻速间隔自动出手；可预选「下一发」技能并受冷却限制。
              </p>
              <p>
                <strong className="text-amber-200">伤害</strong>
                ：使用平滑承伤公式（非简单攻击减防御）；防御技能可减半本次受到的伤害。
              </p>
              <p>
                <strong className="text-amber-200">逃跑</strong>
                ：可手动逃跑；也可在角色信息中设置血量百分比自动撤离（带演出与提示）。
              </p>
            </div>
          )}
          {dockPanel === 'character_login' && (
            <div
              className={`flex min-h-[400px] flex-col items-center justify-center p-4 ${pressStart.className}`}
            >
              {/* 黄色底像素风登录板（中文标签用无衬线保证可读） */}
              <div
                className="w-full max-w-[340px] border-4 border-black bg-[#f4d03f] p-5 shadow-[8px_8px_0_0_#1c1917]"
                style={{ imageRendering: 'pixelated' }}
              >
                <div className="mb-1 text-center text-[9px] leading-tight tracking-[0.2em] text-black">
                  ◆ RETRO LOGIN ◆
                </div>
                <p className="mb-4 text-center font-sans text-[11px] font-bold leading-snug text-stone-900">
                  账号密码登录（演示，无真实服务器）
                </p>

                <div className="space-y-3 font-sans">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-900">
                      账号
                    </span>
                    <input
                      type="text"
                      name="account"
                      autoComplete="username"
                      value={loginAccount}
                      onChange={(e) => setLoginAccount(e.target.value)}
                      placeholder="输入账号"
                      className="w-full border-4 border-black bg-[#fcf3cf] px-3 py-2.5 font-mono text-sm text-stone-900 shadow-[inset_2px_2px_0_#b7950b] outline-none placeholder:text-stone-500 focus:bg-white"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-stone-900">
                      密码
                    </span>
                    <input
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="输入密码"
                      className="w-full border-4 border-black bg-[#fcf3cf] px-3 py-2.5 font-mono text-sm text-stone-900 shadow-[inset_2px_2px_0_#b7950b] outline-none placeholder:text-stone-500 focus:bg-white"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="mt-5 w-full border-4 border-black bg-stone-900 py-3 text-[10px] leading-tight tracking-widest text-[#f4d03f] shadow-[4px_4px_0_0_#78716c] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_0_#78716c] active:translate-x-1 active:translate-y-1 active:shadow-none"
                  onClick={() => {
                    /* 演示：不接后端 */
                  }}
                >
                  ENTER / 进入
                </button>

                <div className="mt-4 border-t-4 border-dashed border-black/25 pt-3 font-sans text-[10px] leading-relaxed text-stone-800">
                  <p>
                    本地角色：<span className="font-bold">Lv.{playerLevel}</span> · 金币{' '}
                    <span className="font-mono font-bold">{playerGold}</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
