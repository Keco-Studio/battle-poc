'use client'

import type { ChatTargetOption } from '../DockFeatureModal'

export function ChatTargetBar({
  targets,
  activeTargetId,
  isDisabled,
  onSelect,
}: {
  targets: ChatTargetOption[]
  activeTargetId: string
  isDisabled?: boolean
  onSelect: (targetId: string) => void
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {targets.map((target) => {
        const isActive = target.id === activeTargetId
        const disabled = Boolean(target.disabled) || Boolean(isDisabled)
        return (
          <button
            key={target.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              onSelect(target.id)
            }}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
              disabled
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
  )
}
