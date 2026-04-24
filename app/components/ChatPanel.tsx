'use client'

import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import type { ChatMessage, GameState } from '../hooks/useGameState'
import type { ChatTargetOption } from './DockFeatureModal'

interface Props {
  game: GameState
  /** 在 DockFeatureModal 内嵌使用时隐藏自带头部（头部由容器提供） */
  embedded?: boolean
  chatTargets?: ChatTargetOption[]
  activeChatTargetId?: string
  onSelectChatTarget?: (targetId: string) => void
}

const BOT_MESSAGES = [
  'Oh! Hello there. Give me a sec — just recalibrating my Tool Claw. Done. What\'s up?',
  '加油！冒险者！',
  '继续前进吧！',
  '前方还有更多挑战！',
  '你做得很好！',
  '小心敌人！',
  '战斗是成长的最好方式！',
  '勇往直前！',
  '相信自己！',
]

const QUICK_PROMPTS = ['What are you building?', 'Tell me your skills', 'How do you use your claw?']

const AUTO_COMMANDS = [
  { label: '连续战斗5次', cmd: '连续战斗5次' },
  { label: '连续战斗10次', cmd: '连续战斗10次' },
  { label: '打不过就跑', cmd: '打不过就跑' },
  { label: '刷钱刷经验', cmd: '刷钱刷经验' },
  { label: '自动模式', cmd: '自动模式' },
  { label: '停止', cmd: '停止' },
]

const SYSTEM_CHAT_THREADS_STORAGE_KEY = 'battle-system-chat-threads-v1'
const ENEMY_CHAT_THREADS_STORAGE_KEY = 'battle-enemy-chat-threads-v1'
const EMPTY_MESSAGES: ChatMessage[] = []

/** 绿色像素机器人头像占位（Engineer Bolt）*/
function BotAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="shrink-0 rounded-md bg-emerald-500 p-[3px] shadow-sm"
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    >
      <div
        className="grid h-full w-full grid-cols-5 grid-rows-5 gap-[1px]"
        style={{ imageRendering: 'pixelated' }}
      >
        {[
          0, 1, 1, 1, 0,
          1, 2, 1, 2, 1,
          1, 1, 1, 1, 1,
          1, 3, 3, 3, 1,
          0, 1, 0, 1, 0,
        ].map((v, i) => (
          <span
            key={i}
            className={
              v === 0
                ? 'bg-transparent'
                : v === 2
                  ? 'bg-slate-900'
                  : v === 3
                    ? 'bg-lime-300'
                    : 'bg-emerald-600'
            }
          />
        ))}
      </div>
    </div>
  )
}

export default function ChatPanel({
  game,
  embedded = false,
  chatTargets,
  activeChatTargetId,
  onSelectChatTarget,
}: Props) {
  const { parseAutomationCommand, automationTask, setAutomationTask, cancelAutomation } = game
  const [input, setInput] = useState('')
  const [lastBotIndex, setLastBotIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [systemChatThreads, setSystemChatThreads] = useState<Record<string, ChatMessage[]>>({})
  const [enemyChatThreads, setEnemyChatThreads] = useState<Record<string, ChatMessage[]>>({})
  const [chatStorageHydrated, setChatStorageHydrated] = useState(false)

  const targets = chatTargets && chatTargets.length > 0 ? chatTargets : [{ id: 'system-engineer', label: 'Engineer Bolt', kind: 'system', disabled: false }]
  const activeTargetId =
    activeChatTargetId && targets.some((target) => target.id === activeChatTargetId) ? activeChatTargetId : targets[0].id
  const activeTarget = targets.find((target) => target.id === activeTargetId) ?? targets[0]
  const activeTargetKind = activeTarget?.kind === 'enemy' ? 'enemy' : 'system'
  const canUseAutomation = activeTargetKind === 'system'
  const activeMessages = (activeTargetKind === 'enemy' ? enemyChatThreads : systemChatThreads)[activeTargetId] ?? EMPTY_MESSAGES

  const appendThreadMessage = (targetId: string, targetKind: 'system' | 'enemy', text: string, isSelf: boolean) => {
    const normalized = text.trim()
    if (!normalized) return
    const updateThreads = (prev: Record<string, ChatMessage[]>) => ({
      ...prev,
      [targetId]: [
        ...(prev[targetId] ?? []),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: normalized,
          isSelf,
          timestamp: Date.now(),
        },
      ],
    })
    if (targetKind === 'enemy') {
      setEnemyChatThreads(updateThreads)
      return
    }
    setSystemChatThreads(updateThreads)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedSystem = localStorage.getItem(SYSTEM_CHAT_THREADS_STORAGE_KEY)
      if (savedSystem) {
        const parsedSystem = JSON.parse(savedSystem) as Record<string, ChatMessage[]>
        if (parsedSystem && typeof parsedSystem === 'object') {
          setSystemChatThreads(parsedSystem)
        }
      }
      const savedEnemy = localStorage.getItem(ENEMY_CHAT_THREADS_STORAGE_KEY)
      if (savedEnemy) {
        const parsedEnemy = JSON.parse(savedEnemy) as Record<string, ChatMessage[]>
        if (parsedEnemy && typeof parsedEnemy === 'object') {
          setEnemyChatThreads(parsedEnemy)
        }
      }
    } catch (e) {
      console.warn('Failed to load chat threads:', e)
    } finally {
      setChatStorageHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!chatStorageHydrated) return
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(SYSTEM_CHAT_THREADS_STORAGE_KEY, JSON.stringify(systemChatThreads))
      localStorage.setItem(ENEMY_CHAT_THREADS_STORAGE_KEY, JSON.stringify(enemyChatThreads))
    } catch (e) {
      console.warn('Failed to save chat threads:', e)
    }
  }, [chatStorageHydrated, enemyChatThreads, systemChatThreads])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeMessages])

  useEffect(() => {
    const interval = setInterval(() => {
      const lastSelf = activeMessages.filter((m) => m.isSelf).pop()
      if (!lastSelf) return

      const timeSinceLastSelf = Date.now() - lastSelf.timestamp
      if (timeSinceLastSelf < 2000) return

      const lastBot = activeMessages.filter((m) => !m.isSelf).pop()
      if (lastBot && lastBot.timestamp >= lastSelf.timestamp) return

      const filteredIndices = BOT_MESSAGES.map((_, i) => i).filter((i) => i !== lastBotIndex)
      const randomIndex = filteredIndices[Math.floor(Math.random() * filteredIndices.length)]

      const botMessage = BOT_MESSAGES[randomIndex]
      appendThreadMessage(activeTargetId, activeTargetKind, botMessage, false)
      setLastBotIndex(randomIndex)
    }, 3000)

    return () => clearInterval(interval)
  }, [activeMessages, activeTargetId, activeTargetKind, lastBotIndex])

  const handleSend = () => {
    if (!input.trim()) return
    const text = input.trim()
    appendThreadMessage(activeTargetId, activeTargetKind, text, true)
    if (canUseAutomation) {
      // 仅系统聊天支持自动化指令；敌人聊天只做纯对话
      const task = parseAutomationCommand(text)
      if (task === null && (text === '停止' || text === '取消')) {
        cancelAutomation()
        appendThreadMessage(activeTargetId, activeTargetKind, '已取消自动化任务', false)
      } else if (task !== null) {
        setAutomationTask(task)
        appendThreadMessage(activeTargetId, activeTargetKind, `自动化任务已设置: ${task.kind}`, false)
      }
    }
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend()
  }

  const handleClear = () => {
    if (activeTargetKind === 'enemy') {
      setEnemyChatThreads((prev) => ({ ...prev, [activeTargetId]: [] }))
      return
    }
    setSystemChatThreads((prev) => ({ ...prev, [activeTargetId]: [] }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {!embedded && (
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <BotAvatar size={32} />
            <div>
              <div className="text-[14px] font-bold text-slate-900">Chat with Engineer Bolt</div>
              <div className="text-[11px] text-slate-500">Lv.14 Engineer · Tool Claw</div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ONLINE
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-white p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {targets.map((target) => {
            const isActive = target.id === activeTargetId
            const isDisabled = Boolean(target.disabled)
            return (
              <button
                key={target.id}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return
                  onSelectChatTarget?.(target.id)
                  setInput('')
                }}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                  isDisabled
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : isActive
                      ? 'border-orange-300 bg-orange-100 text-orange-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {target.label}
              </button>
            )
          })}
        </div>

        {activeMessages.length === 0 && (
          <div className="mt-10 text-center text-sm text-slate-400">暂无消息，开始聊天吧！</div>
        )}
        {activeMessages.map((msg) =>
          msg.isSelf ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-slate-100 px-3 py-2 text-[13px] text-slate-800">
                <div>{msg.text}</div>
                <div className="mt-1 text-right text-[10px] text-slate-400">
                  {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex items-end gap-2">
              <BotAvatar size={24} />
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-orange-100 px-3 py-2 text-[13px] text-orange-900">
                <div className="whitespace-pre-wrap">{msg.text}</div>
                <div className="mt-1 text-right text-[10px] text-orange-500">
                  {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ),
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-100 bg-white px-3 py-2">
        {canUseAutomation && automationTask && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
            <span className="font-bold">自动化:</span>
            <span>{automationTask.kind}</span>
            {automationTask.kind === 'repeat_battle' && <span>剩余 {automationTask.remaining} 场</span>}
            {automationTask.kind === 'kill_count' && <span>击杀 {automationTask.killed}/{automationTask.remaining}</span>}
            <button
              type="button"
              onClick={() => {
                cancelAutomation()
                appendThreadMessage(activeTargetId, activeTargetKind, '已取消自动化任务', false)
              }}
              className="ml-auto rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px] hover:bg-emerald-100"
            >
              取消
            </button>
          </div>
        )}
        {canUseAutomation && (
          <div className="mb-2 flex flex-wrap gap-2">
            {AUTO_COMMANDS.map((item) => (
              <button
                key={item.cmd}
                type="button"
                onClick={() => {
                  appendThreadMessage(activeTargetId, activeTargetKind, item.cmd, true)
                  const task = parseAutomationCommand(item.cmd)
                  if (task === null && (item.cmd === '停止' || item.cmd === '取消')) {
                    cancelAutomation()
                    appendThreadMessage(activeTargetId, activeTargetKind, '已取消自动化任务', false)
                  } else if (task !== null) {
                    setAutomationTask(task)
                    appendThreadMessage(activeTargetId, activeTargetKind, `自动化任务已设置: ${task.kind}`, false)
                  }
                }}
                className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
          >
            清空
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={canUseAutomation ? 'Message Engineer Bolt...' : '和敌人聊天...'}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            aria-label="发送"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-400"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
