# Bottom Bar Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为游戏添加三个独立面板（聊天、战斗日志、成就），像素风格，纯前端模拟。

**Architecture:** 新增三个面板组件，复用现有像素风 UI 样式，利用 localStorage 做数据持久化。聊天面板包含消息列表、输入框和模拟机器人自动回复；战斗日志记录最近 10 场战斗；成就系统追踪"进行十次战斗"成就。

**Tech Stack:** Next.js (App Router), Tailwind CSS, localStorage, lucide-react icons

---

## File Structure

- Create: `app/components/ChatPanel.tsx`
- Create: `app/components/BattleLogPanel.tsx`
- Create: `app/components/AchievementPanel.tsx`
- Modify: `app/hooks/useGameState.ts` - 添加 battleLogs、battleCount、achievements 状态
- Modify: `app/page.tsx` - 引入新面板，添加 UI 状态
- Modify: `app/components/BottomBar.tsx` - 更新回调接口

---

## Task 1: Update useGameState.ts

**Files:**
- Modify: `app/hooks/useGameState.ts`

- [ ] **Step 1: 添加数据类型和常量**

在文件顶部 `useGameState` 函数之前添加：

```typescript
// 战斗日志条目
export interface BattleLogEntry {
  id: string
  timestamp: number
  result: 'win' | 'lose'
  rounds: number
  expGained?: number
  goldGained?: number
}

// 成就定义
export interface Achievement {
  id: string
  name: string
  desc: string
  icon: string
  unlocked: boolean
}

const ACHIEVEMENTS_KEY = 'achievements'
const BATTLE_LOGS_KEY = 'battle-logs'
const CHAT_MESSAGES_KEY = 'chat-messages'

// 初始化成就
const defaultAchievements: Achievement[] = [
  { id: 'battleVeteran', name: '战斗老兵', desc: '进行十次战斗', icon: '⚔️', unlocked: false },
]

// 加载成就
function loadAchievements(): Achievement[] {
  if (typeof window === 'undefined') return defaultAchievements
  try {
    const saved = localStorage.getItem(ACHIEVEMENTS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // 合并已解锁状态
      return defaultAchievements.map(a => {
        const savedAch = parsed.find((p: Achievement) => p.id === a.id)
        return savedAch ? { ...a, unlocked: savedAch.unlocked } : a
      })
    }
  } catch (e) {
    console.warn('Failed to load achievements:', e)
  }
  return defaultAchievements
}

// 加载战斗日志
function loadBattleLogs(): BattleLogEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(BATTLE_LOGS_KEY)
    if (saved) return JSON.parse(saved)
  } catch (e) {
    console.warn('Failed to load battle logs:', e)
  }
  return []
}

// 加载聊天记录
function loadChatMessages(): { id: string; text: string; isSelf: boolean; timestamp: number }[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(CHAT_MESSAGES_KEY)
    if (saved) return JSON.parse(saved)
  } catch (e) {
    console.warn('Failed to load chat messages:', e)
  }
  return []
}
```

- [ ] **Step 2: 添加状态**

在 `useGameState` 函数内部，`// UI状态` 注释区域下方添加：

```typescript
// 聊天状态
const [chatMessages, setChatMessages] = useState<{ id: string; text: string; isSelf: boolean; timestamp: number }[]>(loadChatMessages)

// 战斗日志
const [battleLogs, setBattleLogs] = useState<BattleLogEntry[]>(loadBattleLogs)
const [battleCount, setBattleCount] = useState(0)

// 成就
const [achievements, setAchievements] = useState<Achievement[]>(loadAchievements)
```

- [ ] **Step 3: 添加方法**

在 `return` 语句之前，`// 升级处理` 之前添加聊天和成就方法：

```typescript
// 发送聊天消息
const sendChatMessage = useCallback((text: string) => {
  const newMsg = { id: Date.now().toString(), text, isSelf: true, timestamp: Date.now() }
  setChatMessages(prev => {
    const updated = [...prev, newMsg]
    localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(updated))
    return updated
  })
  return newMsg.id
}, [])

// 添加战斗日志
const addBattleLog = useCallback((result: 'win' | 'lose', rounds: number, exp?: number, gold?: number) => {
  const newLog: BattleLogEntry = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    result,
    rounds,
    expGained: exp,
    goldGained: gold,
  }
  setBattleLogs(prev => {
    const updated = [newLog, ...prev].slice(0, 10)
    localStorage.setItem(BATTLE_LOGS_KEY, JSON.stringify(updated))
    return updated
  })
  setBattleCount(prev => {
    const newCount = prev + 1
    // 检查成就
    setAchievements(achList => {
      const updated = achList.map(a => {
        if (a.id === 'battleVeteran' && newCount >= 10 && !a.unlocked) {
          return { ...a, unlocked: true }
        }
        return a
      })
      localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(updated))
      return updated
    })
    return newCount
  })
}, [])
```

- [ ] **Step 4: 更新 return 对象**

在 return 对象中添加新状态和方法：

```typescript
return {
  // ... existing fields ...

  // 聊天
  chatMessages,
  sendChatMessage,

  // 战斗日志
  battleLogs,
  addBattleLog,
  battleCount,

  // 成就
  achievements,

  // ... existing fields ...
}
```

- [ ] **Step 5: 测试**

Run: `npx vitest run`
Expected: PASS（13 tests）

- [ ] **Step 6: 提交**

```bash
git add app/hooks/useGameState.ts
git commit -m "feat: add battleLogs, achievements, and chat state to useGameState"
```

---

## Task 2: Create ChatPanel.tsx

**Files:**
- Create: `app/components/ChatPanel.tsx`

- [ ] **Step 1: 编写组件代码**

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send } from 'lucide-react'
import { GameState } from '../hooks/useGameState'

interface Props {
  game: GameState
}

const BOT_MESSAGES = [
  '加油！冒险者！',
  '继续前进吧！',
  '前方还有更多挑战！',
  '你做得很好！',
  '小心敌人！',
  '战斗是成长的最好方式！',
  '勇往直前！',
  '相信自己！',
]

export default function ChatPanel({ game }: Props) {
  const { chatMessages, sendChatMessage } = game
  const [input, setInput] = useState('')
  const [lastBotIndex, setLastBotIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

  // 模拟机器人回复
  useEffect(() => {
    const interval = setInterval(() => {
      const lastSelf = chatMessages.filter(m => m.isSelf).pop()
      if (!lastSelf) return

      const timeSinceLastSelf = Date.now() - lastSelf.timestamp
      if (timeSinceLastSelf < 2000) return

      const filteredIndices = BOT_MESSAGES
        .map((_, i) => i)
        .filter(i => i !== lastBotIndex)
      const randomIndex = filteredIndices[Math.floor(Math.random() * filteredIndices.length)]

      const botMessage = BOT_MESSAGES[randomIndex]
      const newMsg = { id: Date.now().toString(), text: botMessage, isSelf: false, timestamp: Date.now() }

      const updated = [...chatMessages, newMsg]
      localStorage.setItem('chat-messages', JSON.stringify(updated))

      setLastBotIndex(randomIndex)
    }, 3000)

    return () => clearInterval(interval)
  }, [chatMessages, lastBotIndex])

  const handleSend = () => {
    if (!input.trim()) return
    sendChatMessage(input.trim())
    setInput('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-[500px] h-[400px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-10 flex items-center justify-center shrink-0 relative">
          <span className="text-orange-900 font-bold text-sm">聊 天</span>
          <button
            onClick={() => game.setShowChat?.(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 hover:bg-red-400 border-2 border-red-300 flex items-center justify-center"
          >
            <X size={14} className="text-white" />
          </button>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chatMessages.length === 0 && (
            <div className="text-gray-400 text-center text-sm mt-8">暂无消息，开始聊天吧！</div>
          )}
          {chatMessages.map(msg => (
            <div
              key={msg.id}
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                msg.isSelf
                  ? 'bg-green-800 ml-auto'
                  : 'bg-blue-800 mr-auto'
              }`}
            >
              <div className="text-white">{msg.text}</div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="bg-gray-900/50 p-2 flex gap-2 shrink-0">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息..."
            className="flex-1 bg-gray-800 border-2 border-gray-600 px-3 py-2 text-white text-sm focus:border-yellow-400 focus:outline-none"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 border-2 border-yellow-300 flex items-center justify-center"
          >
            <Send size={16} className="text-orange-900" />
          </button>
        </div>
      </div>
    </div>
  )
}
```

注意：`game.setShowChat?.(false)` - 需要先确认 page.tsx 中是否有 setShowChat，或者直接关闭面板的方式。

- [ ] **Step 2: 测试**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add app/components/ChatPanel.tsx
git commit -m "feat: add ChatPanel component with bot replies"
```

---

## Task 3: Create BattleLogPanel.tsx

**Files:**
- Create: `app/components/BattleLogPanel.tsx`

- [ ] **Step 1: 编写组件代码**

```tsx
'use client'

import { X } from 'lucide-react'
import { GameState } from '../hooks/useGameState'

interface Props {
  game: GameState
}

export default function BattleLogPanel({ game }: Props) {
  const { battleLogs } = game

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-[450px] h-[350px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-10 flex items-center justify-center shrink-0 relative">
          <span className="text-orange-900 font-bold text-sm">战 斗 日 志</span>
          <button
            onClick={() => game.setShowBattleLog?.(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 hover:bg-red-400 border-2 border-red-300 flex items-center justify-center"
          >
            <X size={14} className="text-white" />
          </button>
        </div>

        {/* 日志列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {battleLogs.length === 0 && (
            <div className="text-gray-400 text-center text-sm mt-8">暂无战斗记录</div>
          )}
          {battleLogs.map(log => (
            <div
              key={log.id}
              className={`p-3 rounded-lg border-2 ${
                log.result === 'win'
                  ? 'bg-green-900/50 border-green-500'
                  : 'bg-red-900/50 border-red-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      log.result === 'win' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}
                  >
                    {log.result === 'win' ? '胜利' : '失败'}
                  </span>
                  <span className="text-gray-400 text-xs">{formatTime(log.timestamp)}</span>
                </div>
                <span className="text-gray-300 text-xs">第 {log.rounds} 回合</span>
              </div>
              {log.result === 'win' && log.expGained !== undefined && log.goldGained !== undefined && (
                <div className="flex gap-4 text-xs">
                  <span className="text-yellow-400">⭐ 经验 +{log.expGained}</span>
                  <span className="text-yellow-400">💰 金币 +{log.goldGained}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 测试**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add app/components/BattleLogPanel.tsx
git commit -m "feat: add BattleLogPanel component"
```

---

## Task 4: Create AchievementPanel.tsx

**Files:**
- Create: `app/components/AchievementPanel.tsx`

- [ ] **Step 1: 编写组件代码**

```tsx
'use client'

import { X } from 'lucide-react'
import { GameState } from '../hooks/useGameState'

interface Props {
  game: GameState
}

export default function AchievementPanel({ game }: Props) {
  const { achievements, battleCount } = game

  const unlockedAchievements = achievements.filter(a => a.unlocked)
  const lockedAchievements = achievements.filter(a => !a.unlocked)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-[450px] h-[400px] bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-400 flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-gradient-to-b from-yellow-400 to-yellow-500 h-10 flex items-center justify-center shrink-0 relative">
          <span className="text-orange-900 font-bold text-sm">成 就</span>
          <button
            onClick={() => game.setShowAchievement?.(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 hover:bg-red-400 border-2 border-red-300 flex items-center justify-center"
          >
            <X size={14} className="text-white" />
          </button>
        </div>

        {/* 进度提示 */}
        <div className="bg-gray-900/50 px-4 py-2 text-center">
          <span className="text-gray-300 text-xs">战斗次数：</span>
          <span className="text-yellow-400 font-bold ml-1">{battleCount}</span>
          <span className="text-gray-400 text-xs">/ 10</span>
        </div>

        {/* 成就列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* 已获得 */}
          {unlockedAchievements.length > 0 && (
            <div>
              <div className="text-green-400 text-xs font-bold mb-2">已获得</div>
              <div className="space-y-2">
                {unlockedAchievements.map(ach => (
                  <div
                    key={ach.id}
                    className="p-3 bg-green-900/50 border-2 border-green-500 rounded-lg flex items-center gap-3"
                  >
                    <span className="text-3xl">{ach.icon}</span>
                    <div>
                      <div className="text-white font-bold text-sm">{ach.name}</div>
                      <div className="text-gray-400 text-xs">{ach.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 未获得 */}
          {lockedAchievements.length > 0 && (
            <div>
              <div className="text-gray-500 text-xs font-bold mb-2">未获得</div>
              <div className="space-y-2">
                {lockedAchievements.map(ach => (
                  <div
                    key={ach.id}
                    className="p-3 bg-gray-800/50 border-2 border-gray-600 rounded-lg flex items-center gap-3 opacity-60"
                  >
                    <span className="text-3xl grayscale">{ach.icon}</span>
                    <div>
                      <div className="text-gray-400 font-bold text-sm">{ach.name}</div>
                      <div className="text-gray-500 text-xs">{ach.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 测试**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add app/components/AchievementPanel.tsx
git commit -m "feat: add AchievementPanel component"
```

---

## Task 5: Update page.tsx and BottomBar.tsx

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/components/BottomBar.tsx`

- [ ] **Step 1: 更新 BottomBar.tsx 回调接口**

将 BottomBar 的 `onXxx` 回调改为直接的 UI 状态设置函数，或者通过 game 对象传递：

```typescript
// BottomBar.tsx 新接口
interface BottomBarProps {
  game: GameState
}
```

然后直接调用 `game.setShowChat(true)` 等。

或者保持现有接口但在 page.tsx 中更新绑定。

- [ ] **Step 2: 更新 page.tsx**

添加新的 UI 状态：
```typescript
const [showChat, setShowChat] = useState(false)
const [showBattleLog, setShowBattleLog] = useState(false)
const [showAchievement, setShowAchievement] = useState(false)
```

将这三个状态和方法传递给 game 或直接传递给 BottomBar 和对应面板。

- [ ] **Step 3: 在 return 中添加面板**

```tsx
{showChat && <ChatPanel game={game} />}
{showBattleLog && <BattleLogPanel game={game} />}
{showAchievement && <AchievementPanel game={game} />}
```

- [ ] **Step 4: 更新 BottomBar 调用**

```tsx
<BottomBar
  game={game}
  onTrophy={() => setShowAchievement(true)}
  onLog={() => setShowBattleLog(true)}
  onInfo={() => setShowChat(true)}
  onBattle={() => game.setShowBattle(true)}
  onUser={() => game.setShowCharacter(true)}
/>
```

- [ ] **Step 5: 将 setShowChat 等方法添加到 game return**

在 useGameState.ts 的 return 中添加：
```typescript
setShowChat,
setShowBattleLog,
setShowAchievement,
```

- [ ] **Step 6: 测试**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add app/page.tsx app/components/BottomBar.tsx app/hooks/useGameState.ts
git commit -m "feat: integrate ChatPanel, BattleLogPanel, AchievementPanel"
```

---

## Task 6: Integration - Update useGameState with UI state setters

**Files:**
- Modify: `app/hooks/useGameState.ts`

- [ ] **Step 1: 添加 UI 状态 setters 到 return**

在 useGameState.ts 的 return 中添加：
```typescript
setShowChat,
setShowBattleLog,
setShowAchievement,
```

同时在状态区添加：
```typescript
const [showChat, setShowChat] = useState(false)
const [showBattleLog, setShowBattleLog] = useState(false)
const [showAchievement, setShowAchievement] = useState(false)
```

- [ ] **Step 2: 测试并提交**

Run: `npx vitest run`
Expected: PASS

---

## Verification

Run: `npx vitest run`
Expected: All tests pass

---

## Summary

| Task | File | Description |
|------|------|-------------|
| 1 | useGameState.ts | Add battleLogs, achievements, chat state |
| 2 | ChatPanel.tsx | Chat panel with bot replies |
| 3 | BattleLogPanel.tsx | Battle log panel |
| 4 | AchievementPanel.tsx | Achievement panel |
| 5 | page.tsx + BottomBar.tsx | Integration |
