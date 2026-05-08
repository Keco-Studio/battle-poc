'use client'

import type { RefObject } from 'react'
import type { ChatMessage } from '../../hooks/useGameState'
import { BotAvatar } from './BotAvatar'

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ChatMessageList({
  messages,
  streamingDraft,
  messagesEndRef,
}: {
  messages: ChatMessage[]
  streamingDraft: string | null
  messagesEndRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <>
      {messages.length === 0 && !streamingDraft && (
        <div className="mt-10 text-center text-sm text-slate-400">No messages yet, start chatting!</div>
      )}
      {messages.map((msg) =>
        msg.isSelf ? (
          <div key={msg.id} className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-slate-100 px-3 py-2 text-[13px] text-slate-800">
              <div>{msg.text}</div>
              <div className="mt-1 text-right text-[10px] text-slate-400">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ) : (
          <div key={msg.id} className="flex items-end gap-2">
            <BotAvatar size={24} />
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-orange-100 px-3 py-2 text-[13px] text-orange-900">
              <div className="whitespace-pre-wrap">{msg.text}</div>
              <div className="mt-1 text-right text-[10px] text-orange-500">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ),
      )}
      {streamingDraft !== null && (
        <div className="flex items-end gap-2">
          <BotAvatar size={24} />
          <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-orange-50 px-3 py-2 text-[13px] text-orange-900 ring-1 ring-orange-200/80">
            <div className="whitespace-pre-wrap">
              {streamingDraft}
              <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-orange-400 align-middle" />
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </>
  )
}
