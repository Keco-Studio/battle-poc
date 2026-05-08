'use client'

export function ChatConnectionHint({
  llmChatAvailable,
}: {
  llmChatAvailable: 'unknown' | 'yes' | 'no'
}) {
  return (
    <div className="mb-2 flex items-center justify-between text-[10px] text-slate-500">
      <span>
        {llmChatAvailable === 'yes'
          ? 'AI chat connected (streaming)'
          : llmChatAvailable === 'no'
            ? 'AI not connected (run npm run dev:ai and set keys in server/.env)'
            : 'Checking AI service...'}
      </span>
    </div>
  )
}
