import React from 'react'
import { LOCAL_MODE_STATUS } from '@/src/lib/runtime/localWebMode'

export function LocalModeNotice() {
  return (
    <p
      role="status"
      data-testid="local-mode-notice"
      className="text-[11px] font-semibold text-amber-700"
    >
      {LOCAL_MODE_STATUS}
    </p>
  )
}
