'use client'

import { useState, useEffect, useRef } from 'react'
import type { ChatMessage, GameState } from '../hooks/useGameState'
import type { ChatTargetOption } from './DockFeatureModal'
import { calcEnemyStats } from '../constants'
import { BotAvatar } from './chat-panel/BotAvatar'
import { ChatAutomationSection } from './chat-panel/ChatAutomationSection'
import { ChatComposer } from './chat-panel/ChatComposer'
import { ChatConnectionHint } from './chat-panel/ChatConnectionHint'
import { ChatMessageList } from './chat-panel/ChatMessageList'
import { ChatQuickPrompts } from './chat-panel/ChatQuickPrompts'
import { ChatTargetBar } from './chat-panel/ChatTargetBar'
import {
  AGENT_CHAT_API,
  ENEMY_CHAT_THREADS_STORAGE_KEY,
  OFFLINE_BOLT_REPLY,
  SYSTEM_CHAT_THREADS_STORAGE_KEY,
} from './chat-panel/chatPanelConstants'
import { readAgentChatStream } from './chat-panel/readAgentChatStream'

interface Props {
  game: GameState
  /** Hide default header when embedded inside DockFeatureModal (header provided by container) */
  embedded?: boolean
  chatTargets?: ChatTargetOption[]
  activeChatTargetId?: string
  onSelectChatTarget?: (targetId: string) => void
}

const EMPTY_MESSAGES: ChatMessage[] = []

type ChatRuntimeContext = {
  player?: {
    level?: number
    hp?: number
    maxHp?: number
  }
  enemy?: {
    id?: number
    name?: string
    level?: number
    isAgent?: boolean
    agentId?: string
    stats?: {
      maxHp?: number
      atk?: number
      def?: number
      spd?: number
    }
  }
}

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
  const [streamingDraft, setStreamingDraft] = useState<string | null>(null)

  const defaultTargets: ChatTargetOption[] = [{ id: 'player-agent', label: 'You', kind: 'system', disabled: false }]
  const targets = chatTargets && chatTargets.length > 0 ? chatTargets : defaultTargets
  const controlledTargetId =
    activeChatTargetId && targets.some((target) => target.id === activeChatTargetId) ? activeChatTargetId : null
  const fallbackTargetId =
    localActiveTargetId && targets.some((target) => target.id === localActiveTargetId)
      ? localActiveTargetId
      : targets[0].id
  const activeTargetId = controlledTargetId ?? fallbackTargetId
  const activeTarget = targets.find((target) => target.id === activeTargetId) ?? targets[0]
  const activeTargetKind = activeTarget?.kind === 'enemy' ? 'enemy' : 'system'
  const canUseAutomation = true
  const activeMessages =
    (activeTargetKind === 'enemy' ? enemyChatThreads : systemChatThreads)[activeTargetId] ?? EMPTY_MESSAGES
  const activeEnemy = game.nearbyEnemy
  const levelFallback = activeEnemy?.level ?? 1
  const defaultEnemyStats = calcEnemyStats(levelFallback)
  const enemyPreviewStats = game.nearbyEnemy?.id === activeEnemy?.id ? game.enemyPreview?.stats : undefined
  const profileStats = activeEnemy?.profile
  const resolvedEnemyStats = activeEnemy
    ? {
        maxHp:
          enemyPreviewStats?.maxHp ?? profileStats?.maxHp ?? defaultEnemyStats.maxHp,
        atk: enemyPreviewStats?.atk ?? profileStats?.atk ?? defaultEnemyStats.atk,
        def: enemyPreviewStats?.def ?? profileStats?.def ?? defaultEnemyStats.def,
        spd: enemyPreviewStats?.spd ?? profileStats?.spd ?? defaultEnemyStats.spd,
      }
    : undefined

  const chatContext: ChatRuntimeContext = {
    player: {
      level: game.playerLevel,
      hp: game.playerHP,
      maxHp: game.totalStats.maxHp,
    },
    enemy: activeEnemy
      ? {
          id: activeEnemy.id,
          name: activeEnemy.name,
          level: activeEnemy.level,
          stats: resolvedEnemyStats,
        }
      : undefined,
  }

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
    void fetch(AGENT_CHAT_API, { method: 'GET', signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { ok?: boolean } | null) => {
        if (cancelled) return
        if (p && p.ok) setLlmChatAvailable('yes')
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
  }, [activeMessages, streamingDraft])

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
    setStreamingDraft('')
    try {
      const finalText = await readAgentChatStream(
        AGENT_CHAT_API,
        {
          target: targetKind,
          context: chatContext as Record<string, unknown>,
          messages: forApi,
        },
        (chunk) => {
          setStreamingDraft((prev) => `${prev ?? ''}${chunk}`)
        }
      )
      appendThreadMessage(activeTargetId, activeTargetKind, finalText, false)
    } catch (e) {
      const err = e instanceof Error ? e.message : 'request_failed'
      const who = targetKind === 'enemy' ? 'Rival' : 'Engineer Bolt'
      appendThreadMessage(
        activeTargetId,
        activeTargetKind,
        `${who}: couldn’t reach agent backend (${err.slice(0, 160)}). Check /api/agent-chat config.`,
        false
      )
    } finally {
      setStreamingDraft(null)
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
        <ChatTargetBar
          targets={targets}
          activeTargetId={activeTargetId}
          onSelect={(targetId) => {
            setLocalActiveTargetId(targetId)
            onSelectChatTarget?.(targetId)
            setInput('')
          }}
        />

        <ChatConnectionHint llmChatAvailable={llmChatAvailable} />

        <ChatQuickPrompts disabled={chatLoading} onPick={(q) => void sendChatMessage(q)} />

        <ChatMessageList
          messages={activeMessages}
          streamingDraft={streamingDraft}
          messagesEndRef={messagesEndRef}
        />
      </div>

      <div className="border-t border-slate-100 bg-white px-3 py-2">
        <ChatAutomationSection
          canUseAutomation={canUseAutomation}
          automationTask={automationTask}
          chatLoading={chatLoading}
          onCancelAutomation={cancelAutomation}
          onAppendSystemMessage={(msg) => appendThreadMessage(activeTargetId, activeTargetKind, msg, false)}
          onSendCommand={(cmd) => void sendChatMessage(cmd)}
        />

        <ChatComposer
          input={input}
          chatLoading={chatLoading}
          placeholder={canUseAutomation ? 'Message Engineer Bolt...' : 'Chat with enemy...'}
          onChange={setInput}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
          onClear={handleClear}
        />
      </div>
    </div>
  )
}
