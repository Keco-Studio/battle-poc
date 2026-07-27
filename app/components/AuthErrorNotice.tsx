'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  onRetry: () => void
}

export default function AuthErrorNotice({ onRetry }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setVisible(params.get('error') === 'auth_error')
  }, [])

  const clearAuthError = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="alert"
      aria-label="Authentication error"
      className="fixed left-1/2 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 items-center gap-3 rounded-lg border border-rose-300 bg-white px-3 py-2.5 shadow-lg"
    >
      <p className="min-w-0 flex-1 text-[12px] font-medium leading-relaxed text-rose-700">
        Google sign-in could not be completed.
      </p>
      <button
        type="button"
        onClick={() => {
          clearAuthError()
          onRetry()
        }}
        className="shrink-0 text-[12px] font-bold text-orange-600 hover:text-orange-700"
      >
        Try again
      </button>
      <button
        type="button"
        onClick={clearAuthError}
        aria-label="Dismiss authentication error"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <X size={16} />
      </button>
    </div>
  )
}
