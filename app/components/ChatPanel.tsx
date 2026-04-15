'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send } from 'lucide-react'
import { GameState } from '../hooks/useGameState'

interface Props {
  game: GameState
}

const BOT_MESSAGES = [
  '加油！冒险者！',
  '继续前进吧！',
  '前方还有更多挑战！',
  '你做得很好！',
  '小心敌人！',
  '战斗是成长的最好方式！',
  '勇往直前！',
  '相信自己！',
]

export default function ChatPanel({ game }: Props) {
  const { chatMessages, sendChatMessage, setShowChat } = game
  const [input, setInput] = useState('')
  const [lastBotIndex, setLastBotIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

  // 模拟机器人回复
  useEffect(() => {
    const interval = setInterval(() => {
      const lastSelf = chatMessages.filter(m => m.isSelf).pop()
      if (!lastSelf) return

      const timeSinceLastSelf = Date.now() - lastSelf.timestamp
      if (timeSinceLastSelf < 2000) return

      const filteredIndices = BOT_MESSAGES
        .map((_, i) => i)
        .filter(i => i !== lastBotIndex)
      const randomIndex = filteredIndices[Math.floor(Math.random() * filteredIndices.length)]

      const botMessage = BOT_MESSAGES[randomIndex]
      const newMsg = { id: Date.now().toString(), text: botMessage, isSelf: false, timestamp: Date.now() }

      const updated = [...chatMessages, newMsg]
      localStorage.setItem('chat-messages', JSON.stringify(updated))

      setLastBotIndex(randomIndex)
    }, 3000)

    return () => clearInterval(interval)
  }, [chatMessages, lastBotIndex])

  const handleSend = () => {
    if (!input.trim()) return
    sendChatMessage(input.trim())
    setInput('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-[800px] h-[600px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-10 flex items-center justify-center shrink-0 relative">
          <span className="text-orange-900 font-bold text-sm">聊 天</span>
          <button
            onClick={() => setShowChat(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 hover:bg-red-400 border-2 border-red-300 flex items-center justify-center"
          >
            <X size={14} className="text-white" />
          </button>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chatMessages.length === 0 && (
            <div className="text-gray-400 text-center text-sm mt-8">暂无消息，开始聊天吧！</div>
          )}
          {chatMessages.map(msg => (
            <div
              key={msg.id}
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                msg.isSelf
                  ? 'bg-green-800 ml-auto'
                  : 'bg-blue-800 mr-auto'
              }`}
            >
              <div className="text-white">{msg.text}</div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="bg-gray-900/50 p-2 flex gap-2 shrink-0">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息..."
            className="flex-1 bg-gray-800 border-2 border-gray-600 px-3 py-2 text-white text-sm focus:border-yellow-400 focus:outline-none"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 border-2 border-yellow-300 flex items-center justify-center"
          >
            <Send size={16} className="text-orange-900" />
          </button>
        </div>
      </div>
    </div>
  )
}