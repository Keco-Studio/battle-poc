'use client'

import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import { GameState } from '../hooks/useGameState'

interface Props {
  game: GameState
  /** 在 DockFeatureModal 内嵌使用时隐藏自带头部（头部由容器提供） */
  embedded?: boolean
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

export default function ChatPanel({ game, embedded = false }: Props) {
  const { chatMessages, sendChatMessage, sendBotChatMessage, setChatMessages } = game
  const [input, setInput] = useState('')
  const [lastBotIndex, setLastBotIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

  useEffect(() => {
    const interval = setInterval(() => {
      const lastSelf = chatMessages.filter((m) => m.isSelf).pop()
      if (!lastSelf) return

      const timeSinceLastSelf = Date.now() - lastSelf.timestamp
      if (timeSinceLastSelf < 2000) return

      const lastBot = chatMessages.filter((m) => !m.isSelf).pop()
      if (lastBot && lastBot.timestamp >= lastSelf.timestamp) return

      const filteredIndices = BOT_MESSAGES.map((_, i) => i).filter((i) => i !== lastBotIndex)
      const randomIndex = filteredIndices[Math.floor(Math.random() * filteredIndices.length)]

      const botMessage = BOT_MESSAGES[randomIndex]
      sendBotChatMessage(botMessage)
      setLastBotIndex(randomIndex)
    }, 3000)

    return () => clearInterval(interval)
  }, [chatMessages, lastBotIndex, sendBotChatMessage])

  const handleSend = () => {
    if (!input.trim()) return
    sendChatMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend()
  }

  const handleClear = () => {
    setChatMessages([])
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
        {chatMessages.length === 0 && (
          <div className="mt-10 text-center text-sm text-slate-400">暂无消息，开始聊天吧！</div>
        )}
        {chatMessages.map((msg) =>
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
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendChatMessage(prompt)}
              className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100"
            >
              {prompt}
            </button>
          ))}
        </div>

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
            placeholder="Message Engineer Bolt..."
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
