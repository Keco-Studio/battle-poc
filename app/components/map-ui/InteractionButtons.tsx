'use client'

export type InteractionButtonsProps = {
  open: boolean
  onChallenge: () => void
  onInspect: () => void
  onClose: () => void
}

export default function InteractionButtons(props: InteractionButtonsProps) {
  const { open, onChallenge, onInspect, onClose } = props
  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div className="flex gap-4 pointer-events-auto">
        <button
          type="button"
          onClick={onChallenge}
          className="w-20 h-20 bg-blue-600/80 hover:bg-blue-500/80 backdrop-blur-sm rounded-xl border-2 border-blue-400 flex flex-col items-center justify-center text-white font-bold transition-all hover:scale-105"
        >
          <span className="text-2xl">⚔️</span>
          <span className="text-xs mt-1">Challenge</span>
        </button>
        <button
          type="button"
          onClick={onInspect}
          className="w-20 h-20 bg-gray-600/80 hover:bg-gray-500/80 backdrop-blur-sm rounded-xl border-2 border-gray-400 flex flex-col items-center justify-center text-white font-bold transition-all hover:scale-105"
        >
          <span className="text-2xl">🔍</span>
          <span className="text-xs mt-1">Inspect</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-20 h-20 bg-gray-600/80 hover:bg-gray-500/80 backdrop-blur-sm rounded-xl border-2 border-gray-400 flex flex-col items-center justify-center text-white font-bold transition-all hover:scale-105"
        >
          <span className="text-2xl">←</span>
          <span className="text-xs mt-1">Back</span>
        </button>
      </div>
    </div>
  )
}

