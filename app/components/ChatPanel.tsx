'use client'

import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import type { ChatMessage, GameState } from '../hooks/useGameState'
import type { ChatTargetOption } from './DockFeatureModal'

interface Props {
  game: GameState
  /** Hide default header when embedded inside DockFeatureModal (header provided by container) */
  embedded?: boolean
  chatTargets?: ChatTargetOption[]
  activeChatTargetId?: string
  onSelectChatTarget?: (targetId: string) => void
}

const QUICK_PROMPTS = ['What are you building?', 'Tell me your skills', 'How do you use your claw?']

const OFFLINE_BOLT_REPLY =
  "Engineer Bolt is offline. Start `npm run dev:ai` and set `DEEPSEEK_API_KEY` in `server/.env`, then I'll be back online."

const AI_PROXY_BASE = (process.env.NEXT_PUBLIC_BATTLE_AI_SERVER_URL || 'http://localhost:8787').replace(/\/$/, '')

const AUTO_COMMANDS = [
  { label: 'Battle 5 times', cmd: 'battle 5 times' },
  { label: 'Battle 10 times', cmd: 'battle 10 times' },
  { label: 'Flee if losing', cmd: 'flee if losing' },
  { label: 'Farm gold & exp', cmd: 'farm gold and exp' },
  { label: 'Auto mode', cmd: 'auto mode' },
  { label: 'Stop', cmd: 'stop' },
]

const SYSTEM_CHAT_THREADS_STORAGE_KEY = 'battle-system-chat-threads-v1'
const ENEMY_CHAT_THREADS_STORAGE_KEY = 'battle-enemy-chat-threads-v1'
const EMPTY_MESSAGES: ChatMessage[] = []

function toApiMessages(
  messages: ChatMessage[]
): { role: 'user' | 'assistant'; content: string }[] {
  return messages
    .map((m) => ({
      role: (m.isSelf ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text.trim()
    }))
    .filter((m) => m.content.length > 0)
}

async function requestChatReply(
  history: { role: 'user' | 'assistant'; content: string }[],
  target: 'system' | 'enemy',
  agentId?: string
): Promise<string> {
  const r = await fetch(`${AI_PROXY_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, agentId, messages: history })
  })
  const data = (await r.json()) as { reply?: string; error?: string }
  if (!r.ok) {
    throw new Error(data.error || `http_${r.status}`)
  }
  if (!data.reply?.trim()) throw new Error('empty_reply')
  return data.reply.trim()
}

/** Green pixel robot avatar placeholder (Engineer Bolt) */
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
  const [chatLoading, setChatLoading] = useState(false)
  const [llmChatAvailable, setLlmChatAvailable] = useState<'unknown' | 'yes' | 'no'>('unknown')
  const [localActiveTargetId, setLocalActiveTargetId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [systemChatThreads, setSystemChatThreads] = useState<Record<string, ChatMessage[]>>({})
  const [enemyChatThreads, setEnemyChatThreads] = useState<Record<string, ChatMessage[]>>({})
  const [chatStorageHydrated, setChatStorageHydrated] = useState(false)

  const deepClawEnemy = game.enemies.find((e) => e.enemyType === 'agent' || e.agentId === 'deepclaw')
  const defaultTargets: ChatTargetOption[] = [{ id: 'system-engineer', label: 'Engineer Bolt', kind: 'system', disabled: false }]
  if (deepClawEnemy) {
    defaultTargets.push({
      id: `agent:${deepClawEnemy.agentId || 'deepclaw'}`,
      label: deepClawEnemy.name,
      kind: 'enemy',
      disabled: false,
    })
  }
  const targets = chatTargets && chatTargets.length > 0 ? chatTargets : defaultTargets
  const controlledTargetId =
    activeChatTargetId && targets.some((target) => target.id === activeChatTargetId) ? activeChatTargetId : null
  const fallbackTargetId =
    localActiveTargetId && targets.some((target) => target.id === localActiveTargetId) ? localActiveTargetId : targets[0].id
  const activeTargetId = controlledTargetId ?? fallbackTargetId
  const activeTarget = targets.find((target) => target.id === activeTargetId) ?? targets[0]
  const activeTargetKind = activeTarget?.kind === 'enemy' ? 'enemy' : 'system'
  const activeAgentId = activeTargetId.startsWith('agent:') ? activeTargetId.slice('agent:'.length) : undefined
  const canUseAutomation = activeTargetKind === 'system' || Boolean(activeAgentId)
  const activeMessages = (activeTargetKind === 'enemy' ? enemyChatThreads : systemChatThreads)[activeTargetId] ?? EMPTY_MESSAGES

  useEffect(() => {
    if (controlledTargetId) return
    if (game.dockPanel !== 'chat') return
    const nearby = game.nearbyEnemy
    if (!nearby) return
    const preferredId =
      nearby.enemyType === 'agent' || nearby.agentId
        ? `agent:${nearby.agentId || 'deepclaw'}`
        : null
    if (!preferredId) return
    if (!targets.some((t) => t.id === preferredId)) return
    setLocalActiveTargetId(preferredId)
  }, [controlledTargetId, game.dockPanel, game.nearbyEnemy, targets])

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
    let cancelled = false
    const ac = new AbortController()
    void fetch(`${AI_PROXY_BASE}/health`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { ok?: boolean; hasKey?: boolean } | null) => {
        if (cancelled) return
        if (p && p.ok && p.hasKey) setLlmChatAvailable('yes')
        else setLlmChatAvailable('no')
      })
      .catch(() => {
        if (!cancelled) setLlmChatAvailable('no')
      })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [])

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

  const sendChatMessage = async (raw: string) => {
    if (!raw.trim() || chatLoading) return
    const text = raw.trim()

    const baseThread = (activeTargetKind === 'enemy' ? enemyChatThreads : systemChatThreads)[activeTargetId] ?? []
    const newUser: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      isSelf: true,
      timestamp: Date.now()
    }
    const forApi = toApiMessages([...baseThread, newUser])
    const targetKind: 'system' | 'enemy' = activeTargetKind === 'enemy' ? 'enemy' : 'system'

    appendThreadMessage(activeTargetId, activeTargetKind, text, true)

    let skipLlm = false
    if (canUseAutomation) {
      const task = parseAutomationCommand(text)
      if (task === null && (text === '停止' || text === '取消' || text === 'stop' || text === 'cancel')) {
        cancelAutomation()
        appendThreadMessage(activeTargetId, activeTargetKind, 'Automation task cancelled', false)
        skipLlm = true
      } else if (task !== null) {
        setAutomationTask(task)
        appendThreadMessage(activeTargetId, activeTargetKind, `Automation task set: ${task.kind}`, false)
        skipLlm = true
      }
    }

    if (skipLlm) return
    if (llmChatAvailable === 'no') {
      appendThreadMessage(activeTargetId, activeTargetKind, OFFLINE_BOLT_REPLY, false)
      return
    }

    setChatLoading(true)
    try {
      const reply = await requestChatReply(forApi, targetKind, activeAgentId)
      appendThreadMessage(activeTargetId, activeTargetKind, reply, false)
    } catch (e) {
      const err = e instanceof Error ? e.message : 'request_failed'
      const who = targetKind === 'enemy' ? 'Rival' : 'Engineer Bolt'
      appendThreadMessage(
        activeTargetId,
        activeTargetKind,
        `${who}: couldn’t reach the model (${err.slice(0, 120)}). Run npm run dev:ai and set DEEPSEEK_API_KEY in server/.env.`,
        false
      )
    } finally {
      setChatLoading(false)
    }
  }

  const handleSend = () => {
    const t = input.trim()
    if (!t) return
    setInput('')
    void sendChatMessage(t)
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
                  setLocalActiveTargetId(target.id)
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

        <div className="mb-2 flex items-center justify-between text-[10px] text-slate-500">
          <span>
            {llmChatAvailable === 'yes'
              ? 'AI chat connected'
              : llmChatAvailable === 'no'
                ? 'AI not connected (run npm run dev:ai and set DEEPSEEK_API_KEY in server/.env)'
                : 'Checking AI service...'}
          </span>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={chatLoading}
              onClick={() => {
                void sendChatMessage(q)
              }}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        {activeMessages.length === 0 && (
          <div className="mt-10 text-center text-sm text-slate-400">No messages yet, start chatting!</div>
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
            <span className="font-bold">Automation:</span>
            <span>{automationTask.kind}</span>
            {automationTask.kind === 'repeat_battle' && <span>{automationTask.remaining} remaining</span>}
            {automationTask.kind === 'kill_count' && <span>Killed {automationTask.killed}/{automationTask.remaining}</span>}
            <button
              type="button"
              onClick={() => {
                cancelAutomation()
                appendThreadMessage(activeTargetId, activeTargetKind, 'Automation task cancelled', false)
              }}
              className="ml-auto rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px] hover:bg-emerald-100"
            >
              Cancel
            </button>
          </div>
        )}
        {canUseAutomation && (
          <div className="mb-2 flex flex-wrap gap-2">
            {AUTO_COMMANDS.map((item) => (
              <button
                key={item.cmd}
                type="button"
                disabled={chatLoading}
                onClick={() => {
                  void sendChatMessage(item.cmd)
                }}
                className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
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
            Clear
          </button>
          <input
            type="text"
            value={input}
            disabled={chatLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={canUseAutomation ? 'Message Engineer Bolt...' : 'Chat with enemy...'}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={chatLoading}
            aria-label="Send"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-50"
          >
            <Send size={15} className={chatLoading ? 'animate-pulse' : undefined} />
          </button>
        </div>
      </div>
    </div>
  )
}
