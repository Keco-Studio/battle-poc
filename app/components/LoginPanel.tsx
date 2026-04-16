'use client'

import { useState } from 'react'
import { X, User } from 'lucide-react'
import { GameState } from '../hooks/useGameState'

interface Props {
  game: GameState
}

export default function LoginPanel({ game }: Props) {
  const { login } = game
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = () => {
    setError('')
    if (!username.trim()) {
      setError('请输入账号')
      return
    }
    if (!password.trim()) {
      setError('请输入密码')
      return
    }
    if (username.trim().length < 2) {
      setError('账号至少2个字符')
      return
    }
    if (password.trim().length < 4) {
      setError('密码至少4个字符')
      return
    }
    login(username)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-[800px] h-[600px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-14 flex items-center justify-center shrink-0 relative">
          <span className="text-orange-900 font-bold text-lg">登 录</span>
          <button
            onClick={() => game.setShowLogin(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-red-500 hover:bg-red-400 border-2 border-red-300 flex items-center justify-center"
          >
            <X size={18} className="text-white" />
          </button>
        </div>

        {/* 登录表单 */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          {/* 头像占位 */}
          <div className="w-24 h-24 bg-purple-900 border-4 border-purple-400 rounded-full flex items-center justify-center">
            <User size={48} className="text-purple-300" />
          </div>

          {/* 账号输入 */}
          <div className="w-64">
            <label className="text-yellow-400 text-sm font-bold mb-1 block">账号</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入账号..."
              className="w-full bg-gray-800 border-4 border-l-gray-400 border-t-gray-400 border-r-gray-600 border-b-gray-600 px-4 py-3 text-white focus:border-yellow-400 focus:outline-none pixel-font"
            />
          </div>

          {/* 密码输入 */}
          <div className="w-64">
            <label className="text-yellow-400 text-sm font-bold mb-1 block">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入密码..."
              className="w-full bg-gray-800 border-4 border-l-gray-400 border-t-gray-400 border-r-gray-600 border-b-gray-600 px-4 py-3 text-white focus:border-yellow-400 focus:outline-none pixel-font"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="text-red-400 text-sm font-bold">{error}</div>
          )}

          {/* 登录按钮 */}
          <button
            onClick={handleLogin}
            className="w-64 mt-4 py-3 bg-yellow-500 hover:bg-yellow-400 border-4 border-l-yellow-300 border-t-yellow-300 border-r-yellow-600 border-b-yellow-600 text-orange-900 font-bold text-lg pixel-font shadow-[4px_4px_0_rgba(0,0,0,0.5)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
          >
            登 录
          </button>
        </div>
      </div>
    </div>
  )
}
