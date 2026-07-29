import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'

import type { V3Direction } from '@/src/v3/presentation/viewModel'

export type V3ControlsProps = {
  disabled?: boolean
  onMove: (direction: V3Direction) => void
}

export function V3Controls({ disabled = false, onMove }: V3ControlsProps) {
  const button = (direction: V3Direction, label: string, icon: React.ReactNode, className: string) => (
    <button
      className={`v3-dpad-button ${className}`}
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={() => onMove(direction)}
    >
      {icon}
    </button>
  )

  return (
    <div className="v3-dpad" aria-label="移动控制">
      {button('n', '向上移动', <ArrowUp size={20} />, 'v3-dpad-up')}
      {button('w', '向左移动', <ArrowLeft size={20} />, 'v3-dpad-left')}
      <span className="v3-dpad-center" aria-hidden="true" />
      {button('e', '向右移动', <ArrowRight size={20} />, 'v3-dpad-right')}
      {button('s', '向下移动', <ArrowDown size={20} />, 'v3-dpad-down')}
    </div>
  )
}
