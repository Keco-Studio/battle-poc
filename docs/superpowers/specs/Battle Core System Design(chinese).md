# Battle Core 完整开发文档 (中文版)
#目前只有domain和engine
## 目录

1. [项目概述](#项目概述)
2. [系统架构](#系统架构)
3. [核心概念](#核心概念)
4. [技术栈](#技术栈)
5. [模块详解](#模块详解)
6. [数据流转](#数据流转)
7. [AI决策系统](#ai决策系统)
8. [记忆系统](#记忆系统)
9. [状态机](#状态机)
10. [配置与平衡](#配置与平衡)
11. [API接口](#api接口)
12. [开发指南](#开发指南)
13. [部署指南](#部署指南)
14. [常见问题](#常见问题)
15. [版本历史](#版本历史)

---

## 项目概述

Battle Core 是一个**基于LLM的智能战斗决策系统**，支持1v1角色对战。系统核心特点是：

- **AI驱动决策**：利用大语言模型（LLM）实时分析战况、选择战术
- **记忆学习**：短期记忆（本场战斗）+ 长期记忆（跨局经验，基于向量数据库）
- **动态策略**：LLM可创造多回合战术序列（试探→撤退→反打）
- **安全可控**：多层护栏保证AI不会失控
- **资源系统**：HP/MP/护盾/怒气，增加战斗深度
- **可扩展**：技能、策略、角色均可配置

### V2版本新增特性

```
├── 统一规则接口：GET /api/battle-core/rules 提供动作、伤害、胜负规则，前后端同源
├── 技能导入系统：POST /api/battle-core/skills/import 支持增量配置技能，告别硬编码
├── 前端Phaser渲染：替换纯CSS，实现专业级2D游戏表现（地图、实体、特效）
├── AI-RPG/Keco集成：地图来自AI-RPG，角色配置来自Keco，实现完整创作闭环
├── 追逃状态机可视化：前端chase overlay实时展示追逐进度
├── 动态策略DSL增强：LLM可生成多阶段战术（试探→撤退→反打），经validator校验后执行
├── 记忆系统容错：VictorDB写入/检索异常时fail-open，不阻断战斗
└── 护栏系统升级：anti-loop检测重复行为，动态策略validator归一化动作/技能
```

### 设计哲学

```
让LLM有创造力，但永远在安全边界内
- 积木块（动作类型、技能）是固定的
- 拼法（战术序列、触发条件）是无限的
- 拼出来的东西不能超出积木的物理限制
- 拼的过程中有质检员（护栏）随时检查
```

---

## 系统架构

### 分层架构图

```
前端层（展示与交互）
├── demoWorld/index.tsx (页面编排)
│   ├── 会话编排（create/auto-sim/poll）
│   ├── 事件消费与日志拼接
│   └── 调用 runtime/fx/event-player 子模块
├── battle-event-player.ts
│   └── BattleEvent -> 动作演出（attack/skill/defend/flee/freeze/end）
├── engine-mount.ts
│   └── Phaser 场景挂载（地图、实体、血蓝条、追逃overlay）
├── engine-runtime.ts
│   └── 坐标同步/资源条同步/追逃可视化同步
├── engine-fx.ts
│   └── 命中特效、镜头震动、hit-stop、冻结视觉
└── components/BattleLogPanel.tsx
    └── 战斗日志面板（来源、动作、回合）

Controller层（后端API）
├── BattleCoreController (/api/battle-core/...)
│   ├── 路由分发、请求验证、响应格式
│   ├── /rules（统一规则接口）
│   ├── /skills, /skills/import（技能定义接口）
│   └── /view（调试/可视化参考页）
└── DemoIntegrationController (/api/demo-integration/...)
    └── ai-rpg / keco / dialogue 导入与整合

Service层（编排与决策）
├── battle-core.ts（战斗服务编排）
│   ├── 会话管理
│   ├── 自动决策调度
│   └── 记忆系统协调（短期+长期）
├── auto-decision-engine.ts
│   ├── LLM请求
│   ├── 动态DSL执行
│   └── fallback与防循环护栏
└── dynamic-strategy-validator.ts
    └── LLM动作/技能归一化与合法性修正

Engine层（确定性模拟）
├── TickEngine
│   ├── CommandProcessor（命令执行）
│   └── EffectProcessor（冻结/状态等）
└── BattleEvent流（用于前端回放）

Domain层（战斗模型）
├── BattleEntity（资源/位置/技能槽/状态）
└── BattleSession（命令队列/事件/结果）

Infra层（存储与向量检索）
├── SessionStore（会话存储）
└── VictorMemoryRepository
    ├── PostgreSQL + pgvector(BattleMemory)
    └── Embedding调用（Qwen优先，LLAMA_URL可回退）
```

### 模块依赖关系

```
battle-core/
├── index.ts                    # 主入口
├── application/
│   └── controllers/
│       ├── battle-core.ts      # 战斗控制器
│       └── demo-integration.ts # 演示集成控制器
├── domain/
│   ├── entities/
│   │   ├── battle-entity.ts    # 战斗实体
│   │   └── battle-session.ts   # 战斗会话
│   ├── services/
│   │   ├── battle-core.ts      # 战斗服务
│   │   └── battle-core-support/
│   │       ├── types.ts
│   │       ├── strategy-utils.ts
│   │       ├── json-utils.ts
│   │       ├── llm-client.ts
│   │       ├── victor-memory.ts
│   │       ├── actor-intent-store.ts
│   │       ├── strategy-selector.ts
│   │       ├── auto-decision-engine.ts
│   │       └── dynamic-strategy-validator.ts
│   └── types/
│       ├── battle-types.ts
│       ├── command-types.ts
│       ├── effect-types.ts
│       ├── event-types.ts
│       └── skill-types.ts
├── engine/
│   ├── command-processor.ts
│   ├── effect-processor.ts
│   └── tick-engine.ts
├── content/
│   └── skills/
│       └── basic-skill-catalog.ts
├── infra/
│   └── store/
│       └── battle-session-store.ts
└── battle-balance.ts
```

---

## 核心概念

### 战斗实体 (BattleEntity)

```typescript
type BattleEntity = {
  id: string;              // 唯一ID
  name: string;            // 角色名称
  team: 'left' | 'right';  // 所属队伍
  position: { x: number; y: number };  // 位置坐标
  resources: {             // 资源池
    hp: number;            // 当前血量
    maxHp: number;         // 最大血量
    mp: number;            // 当前魔法
    maxMp: number;         // 最大魔法
    stamina: number;       // 当前体力
    maxStamina: number;    // 最大体力
    shield: number;        // 当前护盾
    maxShield: number;     // 最大护盾
    rage: number;          // 当前怒气
    maxRage: number;       // 最大怒气
  };
  atk: number;             // 攻击力
  def: number;             // 防御力
  spd: number;             // 速度
  skillSlots: BattleSkillSlot[];  // 技能槽
  defending: boolean;      // 是否防御
  alive: boolean;          // 是否存活
  effects: BattleStatusEffect[];  // 状态效果
}
```

### 战斗会话 (BattleSession)

```typescript
type BattleSession = {
  id: string;              // 会话ID
  tick: number;            // 当前回合数
  result: BattleResult;    // 战斗结果
  mapBounds: {             // 地图边界
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  left: BattleEntity;      // 左侧角色
  right: BattleEntity;     // 右侧角色
  commandQueue: BattleCommand[];  // 命令队列
  chaseState: {            // 追逐状态
    status: 'none' | 'flee_pending';
    runnerId?: string;
    chaserId?: string;
    startTick?: number;
    expireTick?: number;
  };
  events: BattleEvent[];   // 事件列表
  createdAt: number;       // 创建时间
  updatedAt: number;       // 更新时间
}
```

### 动作类型 (BattleActionType)

```typescript
type BattleActionType =
  | 'basic_attack'  // 基础攻击（近战）
  | 'cast_skill'    // 施放技能
  | 'defend'        // 防御（获得护盾）
  | 'dash'          // 冲刺（移动）
  | 'flee';         // 逃跑（尝试脱离战斗）
```

### 战斗结果 (BattleResult)

```typescript
type BattleResult =
  | 'ongoing'      // 进行中
  | 'left_win'     // 左方胜利
  | 'right_win'    // 右方胜利
  | 'draw'         // 平局
  | 'fled';        // 逃跑成功
```

### 状态效果 (BattleStatusEffect)

```typescript
type BattleStatusEffect = {
  instanceId: string;           // 效果实例ID
  effectType: BattleEffectType; // 效果类型
  sourceId: string;             // 来源ID
  ownerId: string;              // 所有者ID
  appliedTick: number;          // 应用回合
  durationTick: number;         // 持续回合
  remainingTick: number;        // 剩余回合
  stackRule: 'replace' | 'refresh' | 'stack';  // 叠加规则
  maxStack?: number;            // 最大叠加层数
  tags?: string[];              // 标签
  params?: Record<string, unknown>;  // 额外参数
}
```

### 事件类型 (BattleEventType)

```typescript
type BattleEventType =
  | 'battle_started'     // 战斗开始
  | 'command_received'   // 收到命令
  | 'command_rejected'   // 命令被拒
  | 'chase_started'      // 追逐开始
  | 'chase_updated'      // 追逐更新
  | 'chase_resolved'     // 追逐解决
  | 'action_executed'    // 动作执行
  | 'damage_applied'     // 伤害应用
  | 'effect_applied'     // 效果应用
  | 'effect_expired'     // 效果过期
  | 'shield_gained'      // 获得护盾
  | 'shield_broken'      // 护盾破碎
  | 'rage_changed'       // 怒气变化
  | 'battle_ended';      // 战斗结束
```

---

## 技术栈

### 后端

- **Node.js + TypeScript**：核心运行环境
- **Express**：HTTP服务器
- **Inversify**：依赖注入
- **PostgreSQL + pgvector**：长期记忆存储（向量数据库）
- **Axios**：HTTP客户端（调用LLM API）

### 前端

- **React**：UI框架
- **Phaser 3**：专业2D游戏引擎（地图渲染、实体动画、特效）
- **TailwindCSS**：样式
- **Axios**：API调用
- **前端分层架构**：
  - engine-mount：场景挂载
  - engine-runtime：状态同步
  - engine-fx：特效系统
  - battle-event-player：动作演出

### AI集成

- **Qwen/DeepSeek API**：LLM服务
- **自定义提示词工程**：战术决策
- **向量相似度检索**：经验匹配
- **动态策略DSL**：LLM创造多回合战术

---

## 模块详解

### 1. 命令处理器 (command-processor.ts)

负责处理所有战斗命令的执行逻辑。

```typescript
// 核心函数
export function enqueueBattleCommand(session: BattleSession, command: BattleCommand): BattleSession
export function processBattleCommands(session: BattleSession): CommandProcessorResult

// 动作执行逻辑
- basic_attack: 近战伤害计算，触发怒气增长
- cast_skill: 技能释放，检查冷却/MP/距离
- defend: 获得护盾，减伤
- dash: 移动，位置计算
- flee: 概率逃跑，触发追逐状态
```

**执行流程**：

```
收到命令 → 验证合法性（目标/距离/资源） → 执行动作 → 生成事件 → 更新状态
```

### 2. 效果处理器 (effect-processor.ts)

管理所有状态效果的更新和过期。

```typescript
export function tickStatusEffects(session: BattleSession): BattleSession
export function applyFreezeToEntity(
  session: BattleSession,
  owner: BattleEntity,
  sourceId: string,
  durationTick: number
): BattleSession
```

**效果类型**：

- freeze: 冰冻（无法行动）
- stun: 眩晕
- dot: 持续伤害
- buff/debuff: 属性增减

### 3. Tick引擎 (tick-engine.ts)

战斗主循环引擎。

```typescript
export class BattleTickEngine {
  public tick(session: BattleSession): TickEngineResult {
    // 1. 回合数+1
    // 2. 处理命令队列
    // 3. 更新状态效果
    // 4. 恢复资源（MP/体力）
    // 5. 检查胜利条件
  }
}
```

### 4. 意图存储 (actor-intent-store.ts)

管理角色的计划状态和短期记忆。

```typescript
export class ActorIntentStore {
  // 核心功能
  getIntentRefreshReason(...): string | null  // 判断是否需要重算
  getPlannedDecision(...): AutoDecision | null // 获取计划决策
  updateActorPlan(...): void                    // 更新计划
  recordActorMemory(...): void                  // 记录记忆
  buildActorMemorySummary(...): string          // 构建记忆摘要
  
  // 数据结构
  private actorPlanState = Map<string, ActorPlanState>
  private actorShortMemory = Map<string, ActorMemoryEntry[]>
  private actorLastSnapshot = Map<string, { tick: number; hpRatio: number }>
}
```

### 5. 策略选择器 (strategy-selector.ts)

纯函数的策略逻辑，无状态。

```typescript
// 战况评估
export function evaluateSituation(...): {...}

// 策略选择（基于规则）
export function selectStrategy(situation: {...}): AutoStrategy

// 策略执行
export function executeStrategy(
  strategy: AutoStrategy,
  situation: {...}
): {
  action: BattleActionType;
  targetId?: string;
  skillId?: string;
  moveTargetX?: number;
  moveStep?: number;
  reason: string;
}
```

### 6. LLM客户端 (llm-client.ts)

封装LLM API调用。

```typescript
export async function requestLlmDecision(
  situation: {...},
  llmConfig: LlmConfig,
  memorySummary?: string,
  currentIntent?: AutoStrategy,
  refreshReason?: string
): Promise<LlmDecisionPayload | null>

// 返回格式
type LlmDecisionPayload = {
  action?: string;              // 动作
  skillId?: string;              // 技能ID
  moveTargetX?: number;          // 移动目标X
  moveStep?: number;             // 移动步长
  strategy?: string;             // 策略名称
  reason?: string;               // 决策原因
  strategyTemplate?: string;     // 策略模板
  template?: string;             // 模板别名
  dynamicStrategyDsl?: any;      // 动态策略DSL（创新功能）
}
```

### 7. 向量记忆 (victor-memory.ts)

长期记忆的向量存储和检索。

```typescript
export class VictorMemoryRepository {
  // 存储记忆
  async append(entry: LongTermMemoryEntry): Promise<void>
  
  // 检索相似记忆
  async buildSummary(input: {
    actorSignature: string;
    opponentSignature: string;
    hpRatio: number;
    targetHpRatio: number;
    distance: number;
    actorFrozen: boolean;
    targetFrozen: boolean;
  }): Promise<string>
  
  // 数据库表结构
  // CREATE TABLE "BattleMemory" (
  //   id TEXT PRIMARY KEY,
  //   actor_signature TEXT NOT NULL,
  //   opponent_signature TEXT NOT NULL,
  //   hp_ratio DOUBLE PRECISION NOT NULL,
  //   target_hp_ratio DOUBLE PRECISION NOT NULL,
  //   distance DOUBLE PRECISION NOT NULL,
  //   chosen_strategy TEXT NOT NULL,
  //   result TEXT NOT NULL,
  //   score DOUBLE PRECISION NOT NULL,
  //   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  //   embedding vector(1024)
  // );
}
```

### 8. 决策执行器 (decide-auto-action.ts)

整合LLM、记忆、策略模板、安全护栏的完整决策流程。

```typescript
export async function decideAutoActionAsync(input: {
  actor: BattleEntity;
  target: BattleEntity;
  currentTick: number;
  situation: {...};           // 战况信息
  fallbackStrategy: AutoStrategy;  // 备选策略
  fallback: {...};            // 备选决策
  llmConfig: LlmConfig;       // LLM配置
  memorySummary: string;      // 记忆摘要
  currentIntent?: AutoStrategy; // 当前意图
  refreshReason: string;      // 刷新原因
  intentStore: ActorIntentStore; // 意图存储
  dynamicStrategyRegistry?: DynamicStrategyRegistry; // 动态策略注册
}): Promise<AutoDecision>
```

**决策流程**：

```
1. 检查是否有激活的动态策略 → 有则执行
2. 无API密钥 → 返回备选
3. 调用LLM → 失败则返回备选
4. 解析LLM响应
   - 如果有dynamicStrategyDsl → 验证并注册动态策略
   - 如果有templateName → 执行策略模板
   - 否则解析具体动作
5. 应用安全护栏（距离/血量检查）
6. 更新意图存储和记忆
7. 返回最终决策
```

### 9. 自动决策引擎 (auto-decision-engine.ts)

整合LLM请求、动态策略执行、护栏检查的核心模块。

```typescript
export class AutoDecisionEngine {
  async decide(input: {
    actor: BattleEntity;
    target: BattleEntity;
    situation: {...};
    memorySummary: string;
    victorSummary: string;
    currentIntent?: AutoStrategy;
    refreshReason: string;
  }): Promise<AutoDecision> {
    // 1. 检查是否有激活的动态策略
    // 2. 调用LLM
    // 3. 验证并执行动态策略DSL
    // 4. 应用护栏
    // 5. 返回决策
  }
}
```

### 10. 动态策略验证器 (dynamic-strategy-validator.ts)

负责校验LLM生成的动态策略DSL，确保其合法性和可执行性。

```typescript
export function validateDynamicStrategyDsl(
  dsl: any,
  availableSkills: string[],
  currentTick: number
): ValidationResult {
  // 1. 格式验证（name/sequence必填）
  // 2. 序列长度限制（≤8步）
  // 3. 动作合法性验证
  // 4. 技能可用性验证
  // 5. 条件范围验证
  // 6. 动作归一化（坐标计算等）
}
```

---

## 数据流转

### 战斗主循环

```
初始化战斗 (createBattleSession)
    ↓
下发命令 (enqueueBattleCommand)
    ↓
┌─────────────────────────────────────┐
│        战斗循环 (BattleTickEngine)   │
├─────────────────────────────────────┤
│ tick++                              │
│    ↓                                │
│ 处理命令 (processBattleCommands)    │
│   - 检查合法性                       │
│   - 执行动作                         │
│   - 计算伤害                         │
│   - 触发事件                         │
│    ↓                                │
│ 更新效果 (tickStatusEffects)         │
│   - 减少持续时间                     │
│   - 移除过期效果                     │
│   - 触发效果事件                     │
│    ↓                                │
│ 资源恢复 (recoverPassiveResources)   │
│   - MP回复 (+1)                     │
│   - 体力回复 (+1)                   │
│    ↓                                │
│ 检查胜利条件 (applyVictoryIfNeeded)  │
└─────────────────────────────────────┘
    ↓
返回结果
```

### 事件流

```
动作执行 → damage_applied → 伤害计算
               ↓
         shield_absorb (护盾吸收)
               ↓
         hp_reduce (血量减少)
               ↓
         rage_changed (怒气变化)
               ↓
         check_death → battle_ended
               ↓
         chase状态检查 → flee_pending/captured/escaped
```

### 前端渲染数据流

```
battle-core state/events
  -> demoWorld orchestration
    -> battle-event-player（动作解释）
      -> engine-fx（击中/冻结/镜头）
      -> engine-runtime（坐标/条/overlay同步）
      -> BattleLogPanel（文字日志）
        -> Phaser场景（engine-mount挂载）
```

### 动作到表现映射

```
basic_attack  -> 近身位移 + slash/burst
cast_skill    -> telegraph + beam/wave/arc projectile
defend        -> 护盾提示 + 轻后撤
flee          -> 逃跑位移 + chase overlay
freeze        -> 冻结标识 + tint + 动画暂停
battle_ended  -> finisher 表现 + 结果文案
```

### 数据持久化流

```
战斗进行中
    ↓
短期记忆 (每回合记录) → ActorMemoryEntry
    ↓                   (最多12条)
战斗结束
    ↓
长期记忆构建 → LongTermMemoryEntry
    ↓
向量化 (getEmbedding)
    ↓
存入 PostgreSQL (pgvector)
    ↓
下次战斗 → 相似度检索 → 记忆摘要 → LLM Prompt
```

---

## AI决策系统

### 策略层次结构

```
LLM决策输出
    ↓
┌─────────────────────────────────────┐
│        三层策略结构                   │
├─────────────────────────────────────┤
│ 1. 核心策略 (AutoStrategy)           │
│    - steady_trade (稳态换血)         │
│    - kite_and_cast (拉扯+施法)       │
│    - aggressive_finish (压制收割)    │
│    - combo_break (连招击破)          │
│    - flee_and_reset (残血撤离)       │
│                                     │
│ 2. 策略模板 (StrategyTemplate)       │
│    - opening_probe (开局试探)        │
│    - pressure_chase (压力追击)        │
│    - control_chain (控制链)          │
│    - burst_window (爆发窗口)          │
│    - kite_cycle (风筝循环)            │
│    - retreat_edge (边缘撤退)          │
│    - safe_trade (安全交换)            │
│                                     │
│ 3. 动态策略 (DynamicStrategy)        │
│    - LLM创造的战术序列                │
│    - 多阶段战术（试探→撤退→反打）       │
│    - 条件触发（怒气/护盾/距离）         │
└─────────────────────────────────────┘
```

### 策略模板扩展

```typescript
const extendedTemplates = {
  guerrilla_warfare: '游击战术（试探→撤退→反打）',
  bait_and_punish: '诱敌深入（卖破绽→反击）',
  patient_stalker: '耐心猎手（等待机会→一击必杀）',
  shield_bash: '盾击连招（防御→反击→控制）'
};
```

### 动态策略DSL格式

```typescript
type DynamicStrategySequenceStep = {
  action: BattleActionType;      // 动作
  skillId?: string;               // 技能ID（如果是cast_skill）
  moveTargetX?: number | string;  // 移动目标（数字或表达式）
  moveStep?: number;              // 移动步长
  duration?: number;              // 持续回合（可选）
};

type DynamicStrategyConditions = {
  hpRange?: [number, number];           // 血量范围 [min, max]
  targetHpRange?: [number, number];     // 目标血量范围
  distanceRange?: [number, number];     // 距离范围
  rageRatio?: [number, number];         // 怒气比例范围
  shieldRatio?: [number, number];       // 护盾比例范围
  targetFrozen?: boolean;                // 目标是否冰冻
  actorFrozen?: boolean;                 // 自己是否冰冻
  tickRange?: [number, number];          // 回合数范围
};

type RegisteredDynamicStrategy = {
  name: string;                          // 策略名称
  conditions: DynamicStrategyConditions; // 触发条件
  sequence: DynamicStrategySequenceStep[]; // 动作序列
  fallback?: AutoStrategy;                // 备选策略
  startTick?: number;                      // 开始回合（运行时填充）
};
```

### LLM决策链（V2）

```
输入层
├── 当前战况（资源、距离、可用技能、冻结状态、边界）
├── 短期记忆摘要（最近行为与策略）
└── VictorMemory摘要（长期检索结果）

决策层
└── requestLlmDecision()
    ├── system prompt（动作白名单/策略模板/坐标边界/机制说明）
    ├── actorSkillsDetailed + targetSkillsDetailed
    └── 输出 JSON 动作意图（可含 dynamicStrategyDsl）

约束层
├── dynamic-strategy-validator（动作与技能归一化）
├── guardrail（非法动作纠偏、无技能可放时替代）
└── anti-loop（重复行为检测与打断）

执行层
├── command enqueue
├── command processor
└── battle events

兜底层
└── fallback（无key/超时/invalid_json/策略失效时保底）
```

### LLM提示词模板

```typescript
const systemPrompt = `
你是一个战术AI，为1v1战斗做决策。
可用动作: ["basic_attack","cast_skill","defend","dash","flee"]
可用技能: ["arcane_bolt","frost_lock"]
策略模板: ["opening_probe","pressure_chase","control_chain","burst_window","kite_cycle","retreat_edge","safe_trade"]

你也可以创造动态策略，格式：
{
  "dynamicStrategyDsl": {
    "name": "策略名称",
    "conditions": { ... },
    "sequence": [ ... ]
  }
}

返回格式必须是JSON。
`;
```

### 安全护栏 (Guardrail)

LLM输出必须经过以下检查：

```typescript
// 1. 动作合法性
if (!allowedActions.includes(parsedAction)) {
  return fallbackWithState('invalid_action');
}

// 2. 技能可用性
if (action === 'cast_skill' && !situation.availableSkills.includes(skillId)) {
  return fallbackWithState('invalid_skill');
}

// 3. 距离检查
if (action === 'basic_attack' && distance > 1.8) {
  action = 'dash';  // 强制改为冲刺
}

// 4. 早期逃跑禁止
if (action === 'flee' && tick <= 8 && hpRatio > 0.35) {
  action = 'dash';  // 禁止过早逃跑
}

// 5. 残血保护
if (hpRatio < 0.17 && distance > 4.8 && action !== 'flee') {
  action = 'flee';  // 强制逃跑
}
```

---

## 记忆系统

### 记忆类型

#### 短期记忆 (ActorMemoryEntry)

```typescript
type ActorMemoryEntry = {
  tick: number;              // 回合数
  hpRatio: number;           // 自己血量比例
  targetHpRatio: number;     // 目标血量比例
  distance: number;          // 距离
  action: BattleActionType;  // 执行动作
  strategy: string;          // 使用策略
  source: 'llm' | 'fallback'; // 决策来源
  sourceReason: string;      // 来源原因
}
```

**特性**：

- 每回合记录
- 最多保留12条（FIFO队列）
- 用于构建记忆摘要

#### 长期记忆 (LongTermMemoryEntry)

```typescript
type LongTermMemoryEntry = {
  timestamp: number;          // 时间戳
  actorSignature: string;     // 角色签名 (如 "Knight#left")
  opponentSignature: string;  // 对手签名 (如 "Mage#right")
  hpRatio: number;            // 自己血量比例
  targetHpRatio: number;      // 对方血量比例
  distance: number;           // 双方距离
  chosenStrategy: AutoStrategy; // 选择的策略
  result: 'win' | 'lose' | 'draw'; // 战斗结果
  score: number;              // 得分 (1/-1/0.2)
}
```

**特性**：

- 战斗结束时存储
- 存入PostgreSQL+pgvector
- 支持向量相似度检索

### 记忆系统架构

```
短期记忆 (Short-term Memory)
├── 每回合记录 → ActorMemoryEntry
├── 最多12条 (FIFO队列)
└── 构建摘要 → 最近4条精选
    ├── 格式: "T24: hp=0.85 vs 0.92, action=cast_skill"
    └── 输出 → 内存摘要

长期记忆 (Long-term Memory)
├── 触发时机: 战斗结束时
├── 存储介质 → PostgreSQL + pgvector
├── 字段: actor/opponent签名、战况、策略、结果、得分
└── 向量嵌入: 将文本特征转为1024维向量

检索利用 (Retrieval)
├── 向量相似度计算 (余弦相似度)
├── 选出最相似的3条
├── 格式: "kite_and_cast:win@0.75/0.32(sim=0.92)"
└── 输入LLM Prompt
```

### VictorMemory 容错机制

```typescript
// 失败容错：向量写入/检索异常不阻断战斗主流程
try {
  const embedding = await this.getEmbedding(textForEmbedding);
  if (embedding.length === 0) {
    // 降级：只存文本，不存向量
    await prisma.$executeRawUnsafe(
      'INSERT INTO "BattleMemory" ... VALUES (..., NULL)'
    );
  }
} catch (_error) {
  // 静默失败，不影响战斗
  console.warn('VictorMemory write failed, continuing...');
}
```

**设计原则**：fail-open，记忆系统异常不阻塞核心战斗逻辑。

### 种子策略机制

战斗开始时，根据历史经验预先选择初始策略：

```typescript
// 种子策略选择逻辑
const memory = this.longTermMemoryBySignature.get(actorSignature)
  ?.filter(entry => entry.opponentSignature === opponentSignature)

// 计算每种策略的总得分
const scored = new Map<AutoStrategy, number>()
memory.forEach(entry => {
  const current = scored.get(entry.chosenStrategy) || 0
  scored.set(entry.chosenStrategy, current + entry.score)
})

// 选出历史得分最高的策略
let bestStrategy: AutoStrategy = 'steady_trade'
let bestScore = -Infinity
scored.forEach((value, strategy) => {
  if (value > bestScore) {
    bestScore = value
    bestStrategy = strategy
  }
})

// 设置初始计划
this.updateActorPlan(actor.id, bestStrategy, 'fallback', 
  `long_memory_seed(${bestStrategy})`, currentTick)
```

---

## 状态机

### 战斗主状态机

```
主状态
ongoing
├── 普通战斗（attack/skill/defend/dash）
├── chase子状态
│   ├── none
│   └── flee_pending (runner/chaser/startTick/expireTick)
│       ├── captured -> left_win/right_win
│       ├── escaped -> fled
│       └── escape_failed -> 回到 ongoing
└── timeout_score -> left_win/right_win/draw

终止
left_win | right_win | fled | draw
```

**关键设计**：不是"一发 flee 就结束"，必须经过追逃状态与结算条件。前端 overlay 使用 `chaseState` 实时可视化追逃进度。

### 追逐状态机详解

```
追逐状态机 (chase_state)
├── none (无追逐) → flee_pending (逃跑待处理): 逃跑成功触发
└── flee_pending (逃跑待处理) → none (无追逐): 被捕获或逃脱触发

追逐解决条件:
- 被捕获: 距离 < 1.9
- 逃脱: 超时 (expireTick)
- 逃跑失败: 回到普通战斗
```

### 战术状态机示例

```
战术状态机 (tactical_state)
├── approaching (接近中) → attacking (攻击中): 距离 < 2
├── attacking (攻击中) → retreating (撤退中): 攻击2次后
├── retreating (撤退中) → waiting (等待): 无人追击时
└── waiting (等待) → approaching (接近中): 距离 > 5
```

---

## 配置与平衡

### 平衡参数 (battle-balance.ts)

```typescript
export const BATTLE_BALANCE = {
  // 战斗时长控制
  defaultAutoSimMaxTicks: 60,
  hardMaxAutoSimTicks: 180,
  shortBattleTicksThreshold: 18,
  
  // 伤害系数
  basicDamageMultiplier: 0.72,   // 基础攻击伤害系数
  skillDamageMultiplier: 0.82,   // 技能伤害系数
  
  // 护盾/怒气系统
  defendShieldGain: 4,            // 防御获得的护盾值
  rageGainOnDealScale: 0.7,       // 造成伤害的怒气转化率
  rageGainOnTakenScale: 1,        // 受到伤害的怒气转化率
  
  // 技能参数
  skills: {
    arcane_bolt: {
      ratio: 1.35,
      mpCost: 4,
      range: 6.5,
      cooldownTicks: 2
    },
    frost_lock: {
      ratio: 1.1,
      mpCost: 6,
      range: 7.2,
      cooldownTicks: 3,
      applyFreezeTicks: 2
    }
  }
} as const;
```

> 注：数值以 `src/battle-core/config/battle-balance.ts` 为最终真值；本文档中的参数示例需与该文件保持同步。

### TTK调优指南

```
影响TTK的因素
├── 伤害系数 → TTK结果
├── 血量上限 → TTK结果
├── 恢复速度 → TTK结果
├── 技能冷却 → TTK结果
├── 护盾效率 → TTK结果
└── 怒气积累 → TTK结果

调整方向
├── TTK太长 (战斗拖太久) → ↑伤害 / ↓血量
├── TTK太短 (秒杀过多) → ↓伤害 / ↑血量
├── 秒杀太多 → 加强护盾
└── 拖太久 → 加强爆发

目标范围
└── 20-25回合 (竞技模式)
    ├── 休闲模式: 30-40回合
    ├── 竞技模式: 20-25回合
    └── 快餐模式: 10-15回合
```

### 资源系统数据流

```
动作触发
├── defend -> shield +N
├── attack/skill -> damage pipeline
└── hit/taken -> 资源变化事件

结算顺序
1) dodge判定
2) shield吸收
3) HP扣减
4) 状态效果结算（如 freeze）

显示层
├── 后端：资源为真实数据源
└── 前端：按事件与state更新血蓝条/受击反馈
```

**说明**：

- Rage 字段在后端模型中保留，但展示层按产品需求可不作为主视觉重点。
- MP（蓝条）与技能可用性直接相关，前端展示与后端数据同步。

---

## API接口

### 基础URL

```
http://localhost:3000/api/battle-core
```

### 1. 创建会话

**POST** `/sessions`

请求体:

```json
{
  "leftId": "left-1",
  "rightId": "right-1",
  "leftName": "Knight",
  "rightName": "Mage",
  "leftHp": 72,
  "rightHp": 72,
  "leftAtk": 6,
  "rightAtk": 6,
  "leftDef": 4,
  "rightDef": 4
}
```

响应:

```json
{
  "sessionId": "xxx",
  "tick": 0,
  "result": "ongoing",
  "left": {...},
  "right": {...}
}
```

### 2. 获取会话

**GET** `/sessions/:sessionId`

响应:

```json
{
  "sessionId": "xxx",
  "tick": 10,
  "result": "ongoing",
  "left": {...},
  "right": {...},
  "queueSize": 2,
  "eventCount": 45,
  "events": [...]
}
```

### 3. 下发命令

**POST** `/sessions/:sessionId/commands`

请求体:

```json
{
  "actorId": "left-1",
  "action": "cast_skill",
  "targetId": "right-1",
  "skillId": "arcane_bolt",
  "tick": 5
}
```

响应:

```json
{
  "command": {...},
  "queueSize": 3,
  "tick": 5
}
```

### 4. 推进战斗

**POST** `/sessions/:sessionId/tick`

请求体:

```json
{
  "steps": 5
}
```

响应:

```json
{
  "sessionId": "xxx",
  "tick": 10,
  "result": "ongoing",
  "appliedCommandCount": 3,
  "left": {...},
  "right": {...},
  "queueSize": 1,
  "recentEvents": [...]
}
```

### 5. 自动仿真

**POST** `/sessions/:sessionId/auto-sim`

请求体:

```json
{
  "maxTicks": 30
}
```

响应:

```json
{
  "sessionId": "xxx",
  "tick": 25,
  "result": "left_win",
  "ticksRan": 25,
  "appliedCommandCount": 42,
  "summary": {
    "totalEvents": 86,
    "damageByActor": {"left-1": 245, "right-1": 198},
    "freezeAppliedCount": 3,
    "rejectedCommandCount": 2,
    "endedReason": "right_defeated"
  },
  "left": {...},
  "right": {...}
}
```

### 6. 基准测试

**POST** `/benchmark/auto-sim`

请求体:

```json
{
  "rounds": 60,
  "maxTicks": 90
}
```

响应:

```json
{
  "rounds": 60,
  "maxTicks": 90,
  "winRate": {
    "left": 0.7,
    "right": 0.3,
    "draw": 0,
    "timeout": 0
  },
  "average": {
    "ticksRan": 21.58,
    "freezeAppliedCount": 2.3,
    "rejectedCommandCount": 1.2,
    "damageByActor": {
      "left-1": 312.5,
      "right-1": 278.3
    }
  },
  "samples": [...]
}
```

### 7. 获取统一规则

**GET** `/rules`

响应:

```json
{
  "actions": ["basic_attack", "cast_skill", "defend", "dash", "flee"],
  "damageFormula": "max(1, floor(atk * multiplier - def * 0.45 + random(2.5)))",
  "victoryConditions": {
    "hp_zero": "对手HP归零",
    "flee_success": "成功逃跑"
  },
  "skillRules": {
    "arcane_bolt": { "type": "damage", "range": 6.5 },
    "frost_lock": { "type": "control", "freezeTicks": 2 }
  }
}
```

### 8. 获取技能定义

**GET** `/skills`

响应:

```json
{
  "skills": [
    {
      "id": "arcane_bolt",
      "name": "奥术飞弹",
      "ratio": 1.35,
      "mpCost": 4,
      "range": 6.5,
      "cooldownTicks": 2
    },
    {
      "id": "frost_lock",
      "name": "冰霜锁链",
      "ratio": 1.1,
      "mpCost": 6,
      "range": 7.2,
      "cooldownTicks": 3,
      "applyFreezeTicks": 2
    }
  ]
}
```

### 9. 导入技能定义

**POST** `/skills/import`

请求体:

```json
{
  "skills": [
    {
      "id": "flame_strike",
      "name": "烈焰打击",
      "ratio": 1.8,
      "mpCost": 8,
      "range": 5.0,
      "cooldownTicks": 4
    }
  ],
  "overwrite": false  // true=覆盖, false=追加
}
```

响应:

```json
{
  "imported": 1,
  "total": 3,
  "skills": ["arcane_bolt", "frost_lock", "flame_strike"]
}
```

### 10. 获取记忆系统状态

**GET** `/memory-status`

响应:

```json
{
  "shortTerm": {
    "leftEntries": 12,
    "rightEntries": 12,
    "refreshReasons": ["hp_drop", "plan_expired"]
  },
  "longTerm": {
    "totalEntries": 1245,
    "victorEnabled": true,
    "embeddingModel": "text-embedding-v3"
  }
}
```

### 11. 可视化调试界面

**GET** `/view`

返回HTML调试页面，包含战斗舞台、控制面板、日志等。

---

## 开发指南

### 环境要求

- Node.js 18+
- PostgreSQL 14+ (with pgvector extension)
- npm/yarn

### 环境变量配置

```env
# LLM配置
QWEN_API_KEY=your-api-key
QWEN_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus

# 左右队伍可单独配置（用于演示不同AI）
QWEN_API_KEY_LEFT=left-api-key
QWEN_API_KEY_RIGHT=right-api-key
QWEN_MODEL_LEFT=qwen-plus
QWEN_MODEL_RIGHT=qwen-plus

# 数据库
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/battle

# 内存后端 (inmemory 或 victordb)
BATTLE_MEMORY_BACKEND=victordb
```

### 添加新技能

在 `content/skills/basic-skill-catalog.ts` 中添加：

```typescript
const SKILLS: BattleSkillDefinition[] = [
  // ... 现有技能
  {
    id: 'new_skill',
    name: '新技能',
    ratio: 1.5,           // 伤害系数
    mpCost: 8,            // 魔法消耗
    range: 8.0,           // 射程
    cooldownTicks: 4,     // 冷却回合
    applyFreezeTicks?: 2, // 可选：冰冻效果
    // 可添加更多效果
  }
];
```

### 添加新策略模板

在 `strategy-utils.ts` 中添加：

```typescript
export function executeStrategyTemplate(
  template: StrategyTemplateName,
  situation: {...},
  fallbackStrategy: AutoStrategy,
  executeStrategy: Function
): {...} {
  // ... 现有模板
  
  if (template === 'new_template') {
    // 实现新模板逻辑
    return {
      action: '...',
      skillId: '...',
      moveTargetX: ...,
      moveStep: ...
    };
  }
}
```

### 添加新角色

通过API创建会话时指定：

```typescript
const session = battleCoreService.createSession({
  leftId: 'warrior-1',
  leftName: '狂战士',
  leftHp: 100,
  leftAtk: 10,
  leftDef: 3,
  rightId: 'archer-1',
  rightName: '弓箭手',
  rightHp: 80,
  rightAtk: 8,
  rightDef: 2
});
```

### AI-RPG 与 Keco-Studio 协作流程

```js
步骤1：导入 AI-RPG map
└── 生成实体实例与空间坐标（entityInstances）

步骤2：导入 Keco 配表
└── 提供角色配置（npc_id、技能、属性、策略元信息）

步骤3：绑定规则
└── map_instance_id 优先绑定（空间ID）+ npc_id（角色ID）

步骤4：战斗执行
├── 后端按角色配置计算
└── 前端按实例坐标渲染

步骤5：事件回放
└── profileId <-> renderId 映射，保证命中同一实体
```

**结论**：

- 地图是 AI-RPG 的，角色能力是 Keco 的。
- 技能与数值以导入数据为主，策略模板为通用决策框架。

### 前端Phaser开发指南

```typescript
// 挂载Phaser场景
import { mountBattleScene } from './engine-mount';

useEffect(() => {
  const scene = mountBattleScene('battle-container', {
    width: 800,
    height: 400,
    onReady: (game) => {
      // 场景就绪
    }
  });
  
  return () => scene.destroy();
}, []);

// 同步战斗状态
useEffect(() => {
  if (!session || !scene) return;
  syncBattleState(scene, session);
}, [session]);
```

### 代码落点

#### 后端核心文件

```
src/application/controllers/battle-core.ts
src/application/controllers/demo-integration.ts
src/domain/services/battle-core.ts
src/domain/services/battle-core-support/auto-decision-engine.ts
src/domain/services/battle-core-support/dynamic-strategy-validator.ts
src/domain/services/battle-core-support/actor-intent-store.ts
src/domain/services/battle-core-support/llm-client.ts
src/domain/services/battle-core-support/victor-memory-repository.ts
src/battle-core/engine/command-processor.ts
src/battle-core/engine/tick-engine.ts
```

#### 前端核心文件

```
client/src/pages/demoWorld/index.tsx
client/src/pages/demoWorld/engine-mount.ts
client/src/pages/demoWorld/engine-runtime.ts
client/src/pages/demoWorld/engine-fx.ts
client/src/pages/demoWorld/battle-event-player.ts
client/src/pages/demoWorld/battle-utils.ts
client/src/pages/demoWorld/components/BattleLogPanel.tsx
client/src/api/battleCore.ts
client/src/api/demoIntegration.ts
```

---

### 监控与日志

```typescript
// 日志级别
const logLevels = {
  error: 0,   // 错误
  warn: 1,    // 警告
  info: 2,    // 信息
  debug: 3,   // 调试
  trace: 4    // 追踪
};

// 关键指标监控
const metrics = {
  battlesPerSecond: number,
  avgTicksPerBattle: number,
  llmCallSuccessRate: number,
  fallbackRate: number,
  memoryHitRate: number
};
```

### 性能优化

```typescript
// 1. LLM调用缓存
const llmCache = new Map<string, LlmDecisionPayload>();

// 2. 批量处理
const batchSize = 10; // 每批处理10个命令

// 3. 数据库连接池
const pool = new Pool({
  max: 20,              // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// 4. 内存限制
const maxConcurrentBattles = 100;
const maxMemoryEntries = 10000;
```

---

## 常见问题

### Q: LLM决策太慢怎么办？

A: 

- 减少LLM调用频率（从5回合改为8回合）
- 使用更快的模型（qwen-turbo替代qwen-plus）
- 启用响应缓存
- 设置超时时间（默认4500ms）

### Q: 如何让战斗更快？

A: 调整 `battle-balance.ts` 中的参数：

```typescript
basicDamageMultiplier: 1.2,  // 提高伤害
skillDamageMultiplier: 1.4,
defendShieldGain: 2,         // 降低护盾
```

### Q: 如何添加新技能？

A: 见"添加新技能"章节。

### Q: 如何让LLM更创新？

A: 优化提示词，鼓励生成 `dynamicStrategyDsl`，同时放宽护栏条件。

### Q: 数据库连接失败？

A: 检查：

- PostgreSQL是否运行
- pgvector扩展是否安装
- DATABASE_URL配置是否正确

### Q: 前端Phaser场景不显示？

A: 检查：

- canvas容器是否存在
- 坐标转换是否正确
- 事件是否被正确消费

### Q: 追逃状态不更新？

A: 检查：

- flee命令是否成功触发
- chaseState是否正确传递到前端
- overlay渲染逻辑

---

## 版本历史

### v1.0.0 (初始版本)

- 基础战斗引擎
- 5种核心策略
- 2个基础技能

### v1.1.0 (AI决策)

- LLM集成
- 7个策略模板
- 短期记忆

### v1.2.0 (记忆系统)

- 长期记忆（PostgreSQL+pgvector）
- 种子策略机制
- 向量相似度检索

### v1.3.0 (护盾/怒气)

- 护盾系统
- 怒气系统
- 新事件类型

### v1.4.0 (动态策略)

- LLM创造多回合战术
- 动态策略注册表
- 战术序列执行

### v2.0.0 (前端升级 + 产品化)

- Phaser游戏引擎集成
- 统一规则接口
- 技能导入系统
- AI-RPG/Keco集成
- 追逃状态机可视化
- 记忆系统容错
- 动态策略验证器

---
