'use client'

import type { AutomationMode } from '../../hooks/useGameState'
import { AUTO_COMMANDS } from './chatPanelConstants'

export function ChatAutomationSection({
  canUseAutomation,
  automationTask,
  chatLoading,
  onCancelAutomation,
  onAppendSystemMessage,
  onSendCommand,
}: {
  canUseAutomation: boolean
  automationTask: AutomationMode | null
  chatLoading: boolean
  onCancelAutomation: () => void
  onAppendSystemMessage: (text: string) => void
  onSendCommand: (cmd: string) => void
}) {
  if (!canUseAutomation) return null

  return (
    <>
      {automationTask && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
          <span className="font-bold">Automation:</span>
          <span>{automationTask.kind}</span>
          {automationTask.kind === 'repeat_battle' && <span>{automationTask.remaining} remaining</span>}
          {automationTask.kind === 'kill_count' && (
            <span>
              Killed {automationTask.killed}/{automationTask.remaining}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              onCancelAutomation()
              onAppendSystemMessage('Automation task cancelled')
            }}
            className="ml-auto rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px] hover:bg-emerald-100"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-2">
        {AUTO_COMMANDS.map((item) => (
          <button
            key={item.cmd}
            type="button"
            disabled={chatLoading}
            onClick={() => onSendCommand(item.cmd)}
            className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
