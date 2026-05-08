'use client'

import { Send } from 'lucide-react'

export function ChatComposer({
  input,
  chatLoading,
  placeholder,
  onChange,
  onSend,
  onKeyDown,
  onClear,
}: {
  input: string
  chatLoading: boolean
  placeholder: string
  onChange: (v: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClear}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
      >
        Clear
      </button>
      <input
        type="text"
        value={input}
        disabled={chatLoading}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={chatLoading}
        aria-label="Send"
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-50"
      >
        <Send size={15} className={chatLoading ? 'animate-pulse' : undefined} />
      </button>
    </div>
  )
}
