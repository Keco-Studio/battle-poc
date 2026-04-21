# 双边 LLM 战斗决策接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `battle-poc` 中让战斗双方（`left` 和 `right`）都由 LLM 生成战术决策，并通过现有规则引擎安全执行，保证失败可降级、战斗不卡死。

**Architecture:** 新增 `service` 决策层（LLM 请求、短期记忆、合法性校验、调度编排），保持 `battle-core/engine` 规则执行层不变；由 orchestrator 在每个 tick 后触发决策与入队。

**Tech Stack:** TypeScript, battle-core engine, provider adapter (DeepSeek/Zhipu), Vitest

---

## 1) 范围与原则

- [ ] **范围确认：双方都启用 LLM 决策**
  - 覆盖 `left` 与 `right` 两个 actor。
  - 任意一侧 LLM 失败时，必须立即 fallback，不阻塞主循环。

- [ ] **规则真相保持单一**
  - `command-processor.ts` 仍是唯一状态修改入口。
  - LLM 只能输出“建议命令”，不能直接变更 session。

- [ ] **MVP 优先策略**
  - 先做 JSON 输出协议（暂不引入 DSL 编译器）。
  - 先做短期记忆（当前对局窗口），长期记忆延后。
  - 先做单 provider 跑通，再扩展多 provider 路由。

---

## 2) 目标文件结构

**Files:**
- Create: `src/battle-core/service/battle-core-orchestrator.ts`
- Create: `src/battle-core/service/auto-decision-engine.ts`
- Create: `src/battle-core/service/dynamic-strategy-validator.ts`
- Create: `src/battle-core/service/short-term-memory.ts`
- Modify: `src/map-battle/MapBattleController.ts`
- Test: `tests/integration/dual-llm-battle-decision.spec.ts`
- Test: `src/battle-core/service/__tests__/*.test.ts`

---

## 3) 核心时序设计

- [ ] **每 tick 处理顺序（固定）**
  1. `orchestrator` 读取 session。
  2. 调用 `tick-engine.tick(session)` 推进并执行已有命令。
  3. 分析新增事件（`action_executed`/`command_rejected`/`battle_ended`）。
  4. 对双方分别判断是否需要新决策。
  5. 构建短期记忆上下文并请求 LLM。
  6. 通过 validator 归一化为合法 `BattleCommand`。
  7. 调用 `enqueueBattleCommand` 入队并写回 store。

- [ ] **触发条件**
  - actor 存活，session `result === ongoing`。
  - 该 actor 在未来 tick 没有已排队命令。
  - 当前不在禁止决策窗口（节流/熔断中）。

- [ ] **抑制条件**
  - 同 actor 本 tick 已请求过决策。
  - 连续失败触发熔断时，优先 fallback。

---

## 4) 模块职责与接口

### Task 1: 实现 orchestrator 调度层

**Files:**
- Create: `src/battle-core/service/battle-core-orchestrator.ts`

- [ ] **Step 1: 定义 orchestrator 入参/出参**
  - 入参包含 sessionId、provider 配置、开关配置（dual_llm）。
  - 出参包含：更新后的 session、决策统计、fallback 统计。

- [ ] **Step 2: 封装 advanceTick 主流程**
  - 调用 `tick-engine` 后统一触发左右 actor 决策。
  - 保证 battle ended 时短路返回。

- [ ] **Step 3: 提供按 actor 的决策判定**
  - `shouldRequestDecision(session, actorId)`。
  - 检查未来命令、存活、控制状态、熔断窗口。

### Task 2: 实现 auto-decision-engine

**Files:**
- Create: `src/battle-core/service/auto-decision-engine.ts`

- [ ] **Step 1: 定义 provider 适配接口**
  - `requestDecision(context): Promise<RawDecision>`.
  - 抽象 provider 名称、超时、重试、模型参数。

- [ ] **Step 2: 设计 prompt 与输出契约**
  - 输入：状态摘要、技能可用性、对手信息、短期记忆、允许 action 列表。
  - 输出：JSON（`action`, `targetId?`, `skillId?`, `metadata?`）。

- [ ] **Step 3: 加入容错机制**
  - 请求超时（建议 300-500ms）。
  - JSON 解析失败、字段缺失时返回结构化错误供 validator 兜底。

### Task 3: 实现 dynamic-strategy-validator

**Files:**
- Create: `src/battle-core/service/dynamic-strategy-validator.ts`

- [ ] **Step 1: 归一化与合法性校验**
  - action 白名单校验。
  - target 存在且存活校验。
  - cast_skill 的 skill 装备/cd/mp/range 预检查。
  - dash/flee metadata 的边界裁剪。

- [ ] **Step 2: 输出统一结果结构**
  - `ok: true` 返回合法命令。
  - `ok: false` 返回 reason + fallback 命令。

- [ ] **Step 3: 定义 fallback 策略**
  - 可近战：`basic_attack`
  - 可接近：`dash`
  - 无法有效进攻：`defend`
  - 特殊撤离策略：`flee`（配置开关）

### Task 4: 实现短期记忆模块

**Files:**
- Create: `src/battle-core/service/short-term-memory.ts`

- [ ] **Step 1: 实现事件滑窗提取**
  - 从 `session.events` 提取最近 N 条（建议 8-12）。

- [ ] **Step 2: 生成决策摘要**
  - 最近动作链、拒绝原因统计、资源变化、距离变化趋势。

- [ ] **Step 3: 输出 LLM 友好上下文**
  - 文本摘要 + 结构化字段并存，方便模型稳定输出。

### Task 5: 接入 map-battle 控制层

**Files:**
- Modify: `src/map-battle/MapBattleController.ts`

- [ ] **Step 1: 引入 orchestrator 入口**
  - 用 `orchestrator.advanceTick(...)` 取代当前双方硬编码意图分支。

- [ ] **Step 2: 保留 feature flag**
  - `manual`（旧逻辑）与 `dual_llm`（新逻辑）可切换。

- [ ] **Step 3: 保证 UI 兼容**
  - 事件结构保持不变，现有展示逻辑无需重写。

---

## 5) 稳定性与安全护栏

- [ ] **防循环**
  - 同 actor 连续 `command_rejected` >= 2 时强制 fallback。
  - 同动作连续失败 >= 3 时临时禁用该动作若干 tick。

- [ ] **节流与预算**
  - 每 actor 最短决策间隔（1-2 tick）。
  - 单 tick 最大决策次数限制（避免异常风暴）。

- [ ] **异常隔离**
  - provider 异常、超时、空返回都不抛出到主循环。
  - 所有异常降级为 `fallback` 并写入观测日志。

---

## 6) 测试与验证计划

### Task 6: 单元测试

**Files:**
- Test: `src/battle-core/service/__tests__/dynamic-strategy-validator.test.ts`
- Test: `src/battle-core/service/__tests__/short-term-memory.test.ts`
- Test: `src/battle-core/service/__tests__/auto-decision-engine.test.ts`

- [ ] **Step 1: validator 用例**
  - 非法 action、非法 target、skill 不可用、超距、资源不足。

- [ ] **Step 2: memory 用例**
  - 滑窗边界、摘要字段完整性、趋势计算正确性。

- [ ] **Step 3: decision engine 用例**
  - 超时、脏 JSON、provider 错误、正常回包。

### Task 7: 集成测试

**Files:**
- Test: `tests/integration/dual-llm-battle-decision.spec.ts`

- [ ] **Step 1: 双边正常决策**
  - 两侧持续出招，battle 可以结束。

- [ ] **Step 2: 单边失败降级**
  - 一侧 provider 故障仍可持续推进 tick。

- [ ] **Step 3: 防循环验证**
  - 连续拒绝时可触发 fallback 和熔断逻辑。

### Task 8: 回归验证

- [ ] **Step 1: 运行核心测试**
  - Run: `npx vitest run`
  - Expected: 全绿，无已有用例回归失败。

- [ ] **Step 2: 冒烟检查**
  - 观察战斗日志中 action/rejected/fallback 占比是否合理。

---

## 7) 可观测性设计

- [ ] **埋点字段**
  - `decision_latency_ms`
  - `decision_success_rate`
  - `validator_reject_rate`
  - `fallback_rate`
  - `commands_per_tick`

- [ ] **日志上下文**
  - `sessionId`, `actorId`, `tick`, `provider`, `reason`.

- [ ] **上线阈值建议**
  - `fallback_rate` 初期 < 35%
  - `validator_reject_rate` 初期 < 25%

---

## 8) 分阶段上线策略

- [ ] **Phase A: 开发联调**
  - 本地 + mock provider 跑通双边链路。

- [ ] **Phase B: 小流量灰度**
  - 打开 `dual_llm` 开关给测试局。
  - 对比 manual 模式的战斗时长与稳定性。

- [ ] **Phase C: 默认启用**
  - 指标稳定后将 `dual_llm` 设为默认模式。

---

## 9) 验收标准（Definition of Done）

- [ ] 双方都由 LLM 驱动并可持续战斗。
- [ ] 任一侧 LLM 异常不会中断战斗循环。
- [ ] 无明显“空转/卡死/重复拒绝刷屏”问题。
- [ ] 关键指标可观测，测试全通过。
- [ ] `manual` 与 `dual_llm` 模式可切换回退。
