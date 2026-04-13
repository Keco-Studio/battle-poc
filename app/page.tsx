'use client'

import { useState } from 'react'

export default function HomePage() {
  const [showLogin, setShowLogin] = useState(false)

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      {/* 全屏背景 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/home-bg.png')" }}
      />

      {/* 左下角 home-left */}
      <div className="absolute bottom-0 left-0">
        <img src="/home-left.png" alt="home-left" className="w-auto h-auto" />
      </div>

      {/* 右上角 登录按钮 */}
      <div className="absolute top-8 right-8">
        <button
          onClick={() => setShowLogin(true)}
          className="px-6 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-white font-medium transition-colors border border-white/30"
        >
          登录
        </button>
      </div>

      {/* 登录面板 */}
      {showLogin && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-gray-900/90 backdrop-blur-md rounded-xl p-8 w-80 border border-gray-700 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6 text-center">登录</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="用户名"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <input
                type="password"
                placeholder="密码"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors">
                确认登录
              </button>
            </div>
            <button
              onClick={() => setShowLogin(false)}
              className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
