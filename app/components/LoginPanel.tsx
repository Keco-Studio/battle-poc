'use client'

import { useState } from 'react'
import { User, Lock, LogIn, Sparkles } from 'lucide-react'
import { GameState } from '../hooks/useGameState'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'

interface Props {
  game: GameState
}

/** Four pixel robot avatars (decorative) */
function PixelBot({ hue }: { hue: string }) {
  return (
    <div
      aria-hidden
      className="h-6 w-6 rounded-md p-[2px]"
      style={{ backgroundColor: hue, imageRendering: 'pixelated' }}
    >
      <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-[1px]">
        {[1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 0, 1, 1, 0].map((v, i) => (
          <span
            key={i}
            className={
              v === 0
                ? 'bg-transparent'
                : v === 2
                  ? 'bg-slate-900'
                  : 'bg-white/60'
            }
          />
        ))}
      </div>
    </div>
  )
}

export default function LoginPanel({ game }: Props) {
  const { setShowLogin } = game
  const supabaseClient = useSupabaseOptional()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError('')
    if (!username.trim()) { setError('Please enter email'); return }
    if (!password.trim()) { setError('Please enter password'); return }

    // No Supabase configured — guest mode fallback
    if (!supabaseClient) {
      setShowLogin(false)
      return
    }

    setLoading(true)
    // Try sign in first; if user not found, auto sign up
    const { error: signInErr } = await supabaseClient.auth.signInWithPassword({
      email: username.trim(),
      password: password.trim(),
    })

    if (signInErr) {
      if (signInErr.message.toLowerCase().includes('invalid login credentials')) {
        // Account doesn't exist — auto register
        const { error: signUpErr } = await supabaseClient.auth.signUp({
          email: username.trim(),
          password: password.trim(),
        })
        if (signUpErr) {
          setError(signUpErr.message)
          setLoading(false)
          return
        }
      } else {
        setError(signInErr.message)
        setLoading(false)
        return
      }
    }

    setLoading(false)
    // Auth state change in useGameState handles loading the save + setting accountLabel
    setShowLogin(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleLogin()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
      <div className="oc-rainbow-border w-[360px] max-w-full p-7">
        {/* Decorative pixel robots */}
        <div className="mb-3 flex items-center justify-center gap-2">
          <PixelBot hue="#34d399" />
          <PixelBot hue="#f59e0b" />
          <PixelBot hue="#ef4444" />
          <PixelBot hue="#a78bfa" />
        </div>

        <div className="mb-1 flex items-center justify-center gap-1 text-[16px] font-bold text-slate-900">
          <Sparkles size={14} className="text-orange-500" />
          OpenClaw World
        </div>
        <div className="mb-6 text-center text-[12px] text-slate-500">
          AI Agents Living &amp; Thriving
        </div>

        <label className="mb-4 block">
          <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-700">
            <User size={12} /> Email
          </span>
          <input
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter email"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
          />
        </label>

        <label className="mb-2 block">
          <span className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-700">
            <span className="flex items-center gap-1">
              <Lock size={12} /> Password
            </span>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="font-bold text-slate-400 hover:text-slate-600"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter password"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-orange-400"
          />
        </label>

        {error && (
          <div className="mb-2 text-center text-[11px] font-bold text-rose-500">{error}</div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="oc-arcade-btn oc-arcade-btn-cta mt-4 disabled:opacity-50"
        >
          {loading ? 'CONNECTING...' : 'ENTER WORLD'}
        </button>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowLogin(false)}
            className="text-[12px] font-bold text-slate-500 hover:text-slate-700"
          >
            Continue as Guest
          </button>
        </div>
      </div>

      {/* Bottom-right close button (small button, aligns with bottom-right square in design) */}
      <button
        type="button"
        onClick={() => setShowLogin(false)}
        aria-label="Skip login"
        className="oc-dock-btn absolute bottom-6 right-6"
      >
        <LogIn size={18} />
      </button>
    </div>
  )
}
