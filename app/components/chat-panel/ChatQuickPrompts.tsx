'use client'

import { QUICK_PROMPTS } from './chatPanelConstants'

export function ChatQuickPrompts({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (prompt: string) => void
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {QUICK_PROMPTS.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  )
}
