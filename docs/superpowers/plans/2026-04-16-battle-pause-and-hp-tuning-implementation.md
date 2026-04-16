# Battle Pause And HP Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为战斗系统加入可冻结的暂停机制，同时放大战斗生命值、开放全场移动范围并缩短飘字消失时间。

**Architecture:** 以 `BattlePanel.tsx` 为主入口，引入单一战斗虚拟时间轴，把攻击节奏、飘字寿命、特效寿命、开场图标与自动逃跑演出统一挂到虚拟时间上。数值层面通过提升 `BASE_STATS.hp` 拉长整体战斗时长，并明确旧存档 `playerHP` 保持原绝对值不迁移。Phaser 场景只负责表现层边界与飘字 tween 调整。

**Tech Stack:** Next.js, React hooks, Phaser 3, Vitest

---

## File Structure

- Modify: `docs/superpowers/specs/2026-04-16-battle-pause-and-arena-design.md` - 同步“当前生命值不迁移”的最终决策
- Modify: `app/constants.ts` - 提高基础生命值常量
- Modify: `app/components/BattlePanel.tsx` - 接入战斗虚拟时钟、暂停按钮、暂停遮罩与基于虚拟时间的战斗推进
- Modify: `src/renderer/phaser/BattleScene.ts` - 改为全局移动边界，缩短飘字 tween
- Modify: `tests/constants.test.ts` - 更新基础生命值预期
- Create: `tests/battlePauseClock.test.ts` - 为虚拟时间与暂停行为编写聚焦单测

---

## Task 1: Finalize Spec

**Files:**
- Modify: `docs/superpowers/specs/2026-04-16-battle-pause-and-arena-design.md`

- [ ] **Step 1: 更新 spec 中生命值策略描述**

把第 5 节改成下面的结论：

```md
### 5. 战斗生命值调高

通过修改底层属性常量 `BASE_STATS.hp`（`app/constants.ts`）从 `30` 改为 `90`，让角色基础最大生命值整体提高 3 倍。怪物最大生命由 `calcEnemyStats()` 基于同等级玩家属性推导，因此也会同步提高。

本次改动的真实目标是整体拉长战斗时间，而不是只在单场战斗开始时临时放大生命值。

旧存档的当前生命值 `playerHP` 不做迁移，保持原绝对值；因此更新后旧档可能出现“当前生命占最大生命比例下降”的现象，这是本次接受的结果。
```

- [ ] **Step 2: 自检文档一致性**

检查并删除与“保持当前比例一致”相冲突的描述，确保不再出现“战斗开始时临时乘 3”的说法。

Run: `rg "保持当前比例一致|临时|战斗开始时.*3 倍|BASE_STATS.hp" docs/superpowers/specs/2026-04-16-battle-pause-and-arena-design.md`

Expected: 只保留与最终方案一致的表述。

---

## Task 2: Lock Failing Tests For HP Tuning

**Files:**
- Modify: `tests/constants.test.ts`

- [ ] **Step 1: 编写会失败的常量测试**

把 `calcPlayerStats()` 的预期值改为新的基础生命：

```ts
describe('calcPlayerStats', () => {
  it('should calculate level 1 stats correctly', () => {
    const stats = calcPlayerStats(1)
    expect(stats.maxHp).toBe(90)
    expect(stats.atk).toBe(5)
    expect(stats.def).toBe(3)
    expect(stats.spd).toBe(3)
  })

  it('should calculate level 2 stats correctly', () => {
    const stats = calcPlayerStats(2)
    expect(stats.maxHp).toBe(100)
  })

  it('should calculate level 5 stats correctly', () => {
    const stats = calcPlayerStats(5)
    expect(stats.maxHp).toBe(130)
  })

  it('should calculate level 10 stats correctly', () => {
    const stats = calcPlayerStats(10)
    expect(stats.maxHp).toBe(180)
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/constants.test.ts`

Expected: FAIL，报 `expected 30 to be 90` 或同类最大生命断言失败。

- [ ] **Step 3: 做最小实现**

在 `app/constants.ts` 中只改这一行：

```ts
export const BASE_STATS = { hp: 90, atk: 5, def: 3, spd: 3 }
```

- [ ] **Step 4: 重新运行测试确认通过**

Run: `npx vitest run tests/constants.test.ts`

Expected: PASS。

---

## Task 3: Add Pause Clock Tests First

**Files:**
- Create: `tests/battlePauseClock.test.ts`

- [ ] **Step 1: 编写会失败的虚拟时间测试**

新增一个小型纯函数测试文件，先定义期望接口，再让它失败。测试内容如下：

```ts
import { describe, expect, it } from 'vitest'
import {
  advanceBattleClock,
  deriveBattleTimeSec,
  pruneExpiredFloatTexts,
  shouldTriggerAt,
} from '../app/components/battlePauseClock'

describe('battlePauseClock', () => {
  it('does not advance while paused', () => {
    expect(advanceBattleClock(1000, 120, true)).toBe(1000)
  })

  it('advances while running', () => {
    expect(advanceBattleClock(1000, 120, false)).toBe(1120)
  })

  it('derives battle seconds from virtual clock', () => {
    expect(deriveBattleTimeSec(2999)).toBe(2)
    expect(deriveBattleTimeSec(3000)).toBe(3)
  })

  it('keeps unexpired float texts during pause window', () => {
    const floats = [
      { id: 1, text: '-12', side: 'left' as const, expireAt: 1500 },
      { id: 2, text: '-8', side: 'right' as const, expireAt: 2500 },
    ]
    expect(pruneExpiredFloatTexts(floats, 1499)).toHaveLength(2)
    expect(pruneExpiredFloatTexts(floats, 1500)).toHaveLength(1)
  })

  it('triggers scheduled events only when clock reaches target', () => {
    expect(shouldTriggerAt(999, 1000)).toBe(false)
    expect(shouldTriggerAt(1000, 1000)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/battlePauseClock.test.ts`

Expected: FAIL，提示 `Cannot find module '../app/components/battlePauseClock'`。

- [ ] **Step 3: 做最小实现**

创建 `app/components/battlePauseClock.ts`：

```ts
export type TimedFloatText = {
  id: number
  text: string
  side: 'left' | 'right'
  expireAt: number
}

export function advanceBattleClock(currentMs: number, elapsedMs: number, paused: boolean): number {
  return paused ? currentMs : currentMs + Math.max(0, elapsedMs)
}

export function deriveBattleTimeSec(clockMs: number): number {
  return Math.floor(Math.max(0, clockMs) / 1000)
}

export function pruneExpiredFloatTexts(items: TimedFloatText[], nowMs: number): TimedFloatText[] {
  return items.filter((item) => item.expireAt > nowMs)
}

export function shouldTriggerAt(nowMs: number, targetMs: number): boolean {
  return nowMs >= targetMs
}
```

- [ ] **Step 4: 重新运行测试确认通过**

Run: `npx vitest run tests/battlePauseClock.test.ts`

Expected: PASS。

---

## Task 4: Integrate Virtual Battle Clock

**Files:**
- Modify: `app/components/BattlePanel.tsx`
- Modify: `app/components/battlePauseClock.ts`
- Test: `tests/battlePauseClock.test.ts`

- [ ] **Step 1: 补充 BattlePanel 所需类型与状态**

把飘字状态改成带到期时间的结构，并增加暂停/虚拟时钟状态：

```ts
type TimedFloatText = { id: number; text: string; side: 'left' | 'right'; expireAt: number }

const [floatTexts, setFloatTexts] = useState<TimedFloatText[]>([])
const [isPaused, setIsPaused] = useState(false)

const battleClockMsRef = useRef(0)
const lastRealTickAtRef = useRef(0)
const battleFxUntilRef = useRef(0)
const heavyStrikeUntilRef = useRef(0)
const centerIconUntilRef = useRef(0)
const autoFleeUntilRef = useRef(0)
```

- [ ] **Step 2: 用 failing test 约束新的辅助函数**

如果 `BattlePanel.tsx` 中还需要额外提炼诸如 `isExpired(now, until)`、`scheduleFromNow(now, duration)` 之类的工具函数，先把测试加到 `tests/battlePauseClock.test.ts`，再实现。

示例测试：

```ts
it('schedules expiry from current virtual time', () => {
  expect(scheduleFromNow(1200, 500)).toBe(1700)
})
```

- [ ] **Step 3: 用虚拟时间替换浏览器定时器驱动的表现态**

把下面这些逻辑从 `setTimeout()` 改为“记录截止时间 + 主循环按虚拟时间清理”：

```ts
const now = battleClockMsRef.current
setBattleFx(kind)
battleFxUntilRef.current = now + 220

setHeavyStrikePlaying(true)
heavyStrikeUntilRef.current = now + 500

setShowCenterBattleIcon(true)
centerIconUntilRef.current = 1000

setFloatTexts((prev) => [...prev, { id, text, side, expireAt: now + 500 }])
```

- [ ] **Step 4: 改造主循环时间来源**

把战斗循环里的 `Date.now()` 业务判断改成虚拟时间：

```ts
const realNow = Date.now()
const elapsed = lastRealTickAtRef.current === 0 ? 0 : realNow - lastRealTickAtRef.current
lastRealTickAtRef.current = realNow
battleClockMsRef.current = advanceBattleClock(battleClockMsRef.current, elapsed, isPaused)

const t = battleClockMsRef.current
setBattleTimeSec(deriveBattleTimeSec(t))
setFloatTexts((prev) => pruneExpiredFloatTexts(prev, t))

if (battleFxUntilRef.current > 0 && t >= battleFxUntilRef.current) setBattleFx('none')
if (heavyStrikeUntilRef.current > 0 && t >= heavyStrikeUntilRef.current) setHeavyStrikePlaying(false)
if (centerIconUntilRef.current > 0 && t >= centerIconUntilRef.current) setShowCenterBattleIcon(false)
```

- [ ] **Step 5: 让攻击调度依赖虚拟时钟**

保留原有攻击间隔公式，但把下一次触发时间写到虚拟时钟上：

```ts
nextPlayerAtkAtRef.current = t + playerAttackIntervalMs(s.totalStats.spd)
nextEnemyAtkAtRef.current = t + enemyAttackIntervalMs(enemyCombat.spd)

if (t >= nextPlayerAtkAtRef.current) {
  // existing player attack resolution
}

if (t >= nextEnemyAtkAtRef.current) {
  // existing enemy attack resolution
}
```

- [ ] **Step 6: 处理自动逃跑演出与暂停冲突**

自动逃跑改成虚拟时钟控制，且暂停时不再推进：

```ts
if (!autoFleeConsumedRef.current && thresholdHit) {
  autoFleeConsumedRef.current = true
  pauseBattleForFleeRef.current = true
  setAutoFleeAnimating(true)
  autoFleeUntilRef.current = battleClockMsRef.current + 1100
}

if (autoFleeAnimating && battleClockMsRef.current >= autoFleeUntilRef.current) {
  pauseBattleForFleeRef.current = false
  setAutoFleeAnimating(false)
  handleFlee({ successMessage: '逃跑成功！已安全撤离战场。' })
}
```

- [ ] **Step 7: 运行聚焦测试**

Run: `npx vitest run tests/battlePauseClock.test.ts`

Expected: PASS。

---

## Task 5: Add Pause UI

**Files:**
- Modify: `app/components/BattlePanel.tsx`

- [ ] **Step 1: 在标题栏加入暂停/继续按钮**

把标题栏从纯文本改成标题 + 按钮布局：

```tsx
<div className="h-12 shrink-0 bg-gradient-to-b from-yellow-400 to-yellow-500 flex items-center justify-between border-b-4 border-orange-500 px-3">
  <span className="text-orange-900 font-bold text-base">实时战斗 · {battleTimeSec}s</span>
  {!isGameOver && (
    <button
      type="button"
      onClick={() => setIsPaused((prev) => !prev)}
      disabled={autoFleeAnimating}
      className="rounded-md border-2 border-orange-700 bg-orange-100 px-3 py-1 text-sm font-bold text-orange-900 disabled:opacity-50"
    >
      {isPaused ? '继续' : '暂停'}
    </button>
  )}
</div>
```

- [ ] **Step 2: 加入暂停遮罩**

在战斗画布区域添加：

```tsx
{isPaused && (
  <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/40">
    <div className="rounded-xl border border-white/20 bg-black/60 px-4 py-2 text-sm font-bold text-white">
      已暂停
    </div>
  </div>
)}
```

- [ ] **Step 3: 重置战斗时钟状态**

在开战、关闭战斗、逃跑收尾时重置：

```ts
battleClockMsRef.current = 0
lastRealTickAtRef.current = 0
battleFxUntilRef.current = 0
heavyStrikeUntilRef.current = 0
centerIconUntilRef.current = 0
autoFleeUntilRef.current = 0
setIsPaused(false)
setFloatTexts([])
setBattleFx('none')
setHeavyStrikePlaying(false)
setShowCenterBattleIcon(true)
```

- [ ] **Step 4: 运行相关测试**

Run: `npx vitest run tests/battlePauseClock.test.ts tests/constants.test.ts`

Expected: PASS。

---

## Task 6: Expand Battle Arena Movement

**Files:**
- Modify: `src/renderer/phaser/BattleScene.ts`

- [ ] **Step 1: 写一个最小的边界回归断言**

如果当前没有直接测试 Phaser 场景的基础设施，不新增低价值渲染测试；改为在实现前先列出需要替换的常量与调用点并确认没有残留：

Run: `rg "ZONE|MID_X" src/renderer/phaser/BattleScene.ts`

Expected: 能看到所有待替换位置。

- [ ] **Step 2: 实现全局边界**

把顶部常量改成：

```ts
const W = 1600
const H = 900
const ARENA_BOUNDS = { xMin: 90, xMax: W - 90, yMin: 120, yMax: H - 120 }
```

并同步替换：

```ts
this.player = this.add.sprite(ARENA_BOUNDS.xMin + 220, H * 0.52, 'battle-player')
this.enemy = this.add.sprite(ARENA_BOUNDS.xMax - 220, H * 0.48, 'battle-enemy')

const tx = Phaser.Math.FloatBetween(ARENA_BOUNDS.xMin, ARENA_BOUNDS.xMax)
const ty = Phaser.Math.FloatBetween(ARENA_BOUNDS.yMin, ARENA_BOUNDS.yMax)

this.moveToward(this.player, this.playerTarget.x, this.playerTarget.y, BattleScene.PLAYER_PATROL_SPEED, dt, ARENA_BOUNDS)
this.moveToward(this.enemy, this.enemyTarget.x, this.enemyTarget.y, BattleScene.ENEMY_PATROL_SPEED, dt, ARENA_BOUNDS)
```

- [ ] **Step 3: 缩短飘字淡出**

把 `spawnFloatText()` 中的 tween 时长改为：

```ts
duration: 500,
```

- [ ] **Step 4: 确认无残留旧半场逻辑**

Run: `rg "ZONE\\.player|ZONE\\.enemy|MID_X" src/renderer/phaser/BattleScene.ts`

Expected: 无匹配，或只剩与视觉分隔线无关的安全常量。

---

## Task 7: Full Verification

**Files:**
- Modify: `app/constants.ts`
- Modify: `app/components/BattlePanel.tsx`
- Modify: `src/renderer/phaser/BattleScene.ts`
- Modify: `tests/constants.test.ts`
- Create: `tests/battlePauseClock.test.ts`

- [ ] **Step 1: 运行聚焦测试**

Run: `npx vitest run tests/constants.test.ts tests/battlePauseClock.test.ts`

Expected: PASS。

- [ ] **Step 2: 运行全量测试**

Run: `npx vitest run`

Expected: PASS。

- [ ] **Step 3: 检查 lint/诊断**

Run Cursor diagnostics for:

```text
app/components/BattlePanel.tsx
src/renderer/phaser/BattleScene.ts
app/constants.ts
tests/constants.test.ts
tests/battlePauseClock.test.ts
```

Expected: 无新增问题。
