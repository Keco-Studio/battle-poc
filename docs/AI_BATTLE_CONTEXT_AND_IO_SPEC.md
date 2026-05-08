# AI 战斗：上下文输入与决策输出规格（草案）

本文档描述 **希望传给战术 AI 的完整上下文**，以及 **期望模型返回的内容形态**（下一步走到哪、如何施法等）。用于后续迭代 `buildStructuredPayload`、路由层与引擎校验，与当前代码实现对齐时可逐项勾选落地。

---

## 1. 设计目标

1. **输入**：单次请求中包含 **战局上下文**、**地图（含可走/障碍）**、**己方角色（位置、状态、技能）**、**敌方角色（位置、状态）**，必要时附带短期记忆摘要。
2. **输出**：模型给出 **可执行的战术意图**，至少包含 **位移目标（可走到的格子或坐标）** 与 **本回合/下一tick 的技能或普攻选择**；可与现有引擎的 `basic_attack` / `cast_skill` / `dash` / `defend` / `dodge` 等对齐全。
3. **约束**：地图障碍与规则仍以引擎为准；LLM 输出需经护栏归一化后再入队（现有 `decision-guardrail`、冷却、MP、距离等逻辑保持不变或扩展）。

---

## 2. 请求体结构（建议 JSON Schema 层级）

以下字段名为建议命名，实现时可嵌套在单一根对象 `battleContext` 或与现有 `StructuredLlmPayload` 合并。

### 2.1 元信息与上下文（`meta`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `tick` | number | 当前战斗逻辑 tick |
| `phase` | string | 如 `preparation` / `battle` |
| `battleId` | string | 可选，对局标识 |
| `randomSeedHint` | string \| null | 可选，仅说明用，不替代服务端随机 |
| `recentEventsSummary` | string | 可选，最近若干条关键事件的自然语言或结构化摘要 |
| `memorySummary` | string | 短期记忆：己方最近行为、被拒原因等 |
| `decisionRefreshReason` | string | 为何本次重新要决策（interval / hp_spike / controlled / …） |
| `outputContract` | object | 实现侧写入：`sequenceSteps` 20–24、`ttlTicksSuggest` 128（引擎 TTL 默认 128、上限 192）及「新响应会替换旧 sequence」说明 |

### 2.2 地图信息（`map`）— **必须扩展，区别于仅边界**

当前实现仅包含 `mapBounds`。本规格要求至少包含下列之一（推荐 **A + B** 同时提供，便于模型理解与引擎校验）：

**A. 边界与坐标系**

| 字段 | 说明 |
|------|------|
| `bounds` | `{ minX, maxX, minY, maxY }`，与引擎一致 |
| `coordinateSystem` | 说明单位：如 tile 中心为半格整数、或与 `command-processor` 一致的 clamp 规则 |

**B. 障碍与可走区域（选一为主，另一可选）**

| 方案 | 字段建议 | 说明 |
|------|-----------|------|
| **栅格** | `grid.width`, `grid.height`, `walkable[][]` 或 `blocked[][]` | 与前端 collision / pathfinding 同源；`true` 表示可走或可站立 |
| **列表** | `obstacles: { x, y, w?, h? }[]` | 轴对齐阻挡盒，引擎需能映射到同一可走判定 |
| **压缩** | `runLength` / base64 编码层 | 大地图时减小 token，解码由服务端完成 |

**C. 可选增强**

- `spawnHints`：出生点是否可走修正说明（与 `dungeonDemoFootTiles` 等规则对齐时写入）。
- `lineOfSight`：若未来技能需要视野，可单独扩展；MVP 可不送。

### 2.3 己方角色（`actor`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | |
| `name` | string | |
| `team` | string | |
| `position` | `{ x, y }` | 当前逻辑坐标 |
| `resources` | object | `hp` / `maxHp` / `mp` / `maxMp` / `stamina` / … |
| `attributes` | object | `atk` / `def` / `spd` 等 |
| `effects` | array | Buff/Debuff：`type`, `remainingTicks`, 可选 `stack` |
| `roleProfile` | object | 推断或配置的职业、偏好射程等 |
| `skills` | array | 见下 **技能条目规范** |

### 2.4 敌方角色（`target` / `enemy`）

与 `actor` 对称：**位置、资源比例或绝对值、效果列表、可见技能概况**（若规则允许隐藏部分技能，需在 meta 中注明 `informationPolicy`）。

| 字段 | 说明 |
|------|------|
| `position` | `{ x, y }` |
| `resources` | 与己方同类 |
| `effects` | 同上 |
| `skills` | 同上（可见 subset） |

### 2.5 技能条目（`skills[]` 每项）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 与 catalog 一致 |
| `name` | string | 展示名 |
| `category` | string | control / burst / … |
| `mpCost` | number | |
| `range` | number | 施法距离 |
| `cooldownTicks` | number | 技能 CD 总长 |
| `remainingCooldown` | number | 剩余 CD |
| `canCast` | boolean | 综合 MP、CD、沉默等 |
| `inRange` | boolean | 当前距离下是否满足射程 |
| `effectHint` | string | 简短机制说明（冻结、碎冰加成等） |

### 2.6 双方相对信息（根级或嵌套）

| 字段 | 说明 |
|------|------|
| `distance` | 欧式或曼哈顿距离（与引擎判定一致） |
| `actorHpRatio` / `targetHpRatio` | 便于斩杀/撤退阈值 |

---

## 3. 模型输出结构（期望）

输出仍为 **单一 JSON 对象**（可加 `reasoning` 字段便于调试，引擎可选忽略）。

### 3.1 单 tick 决策（MVP）

用于「下一步我该去哪、放什么」：

```json
{
  "intent": "move_and_act | cast_only | move_only | defend | dodge",
  "move": {
    "targetX": 5.5,
    "targetY": 3.0,
    "note": "可选：本轮期望到达的格子/坐标中心"
  },
  "action": {
    "type": "basic_attack | cast_skill | defend | dodge | none",
    "skillId": "frost_lock",
    "targetId": "enemy-uuid"
  },
  "priority": "move_first | act_first",
  "ttlTicks": 6,
  "reasoning": "一句话战术理由"
}
```

**语义说明：**

- **`move.targetX/Y`**：希望移动到的位置；引擎将尝试转为 `dash` 或分步移动命令，并做障碍与边界裁剪。
- **`action`**：若本 tick 以施法/普攻为主，则指定类型；与移动的顺序由 `priority` 或引擎策略决定（需与现有 tick 模型对齐）。
- 若仍希望保留 **多步连招**，可并列支持 **3.2** 的序列格式，由 `ActionSequenceStore` 消费。

### 3.2 多步序列（与现有协议兼容）

与当前 `sequence` + `ttlTicks` 一致，每步含 `action`、`skillId`、`moveTargetX/Y` 等。**单次 HTTP 调用延迟可达数秒**，模型应尽量在一次响应里给出 **20–24 步**（引擎 `ActionSequenceStore` 下限 20、上限 24）。**`ttlTicks` 默认/建议 128**（引擎在 3–192 内钳制）；**新的 LLM 返回会丢弃上一单 sequence**（单次 `action` 提交或重新 `register` 前均会 `invalidate`）。

```json
{
  "name": "freeze_shatter_combo",
  "sequence": [ "… 共 20–24 个 step 对象 …" ],
  "ttlTicks": 128,
  "reasoning": "..."
}
```

### 3.3 校验与降级

- 所有坐标必须在服务端根据 **真实 map.walkable** 做 clamp / 重路由；不可行走时 fallback 最近可走点或改用纯技能意图。
- `cast_skill` 必须再跑一遍：`canCast`、`inRange`、CD、MP。
- 超时或非法 JSON → 现有启发式 / 决策树 fallback。

---

## 4. 与当前 `battle-poc` 实现的差距（落地清单）

| 项目 | 当前状态 | 本规格要求 |
|------|-----------|------------|
| 地图障碍 | 仅 `mapBounds` | 增加 walkable 网格或障碍列表 |
| 输出位移语义 | 多用 `dash` 序列内坐标 | 显式 `move.targetX/Y` 或文档化等价字段 |
| 敌我信息 | 已有双方 entity + skills | 保持并强化与地图对齐 |
| meta 上下文 | 部分（tick、memory） | 扩展 `decisionRefreshReason`、可选事件摘要 |

---

## 5. 版本与变更

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.1 | 2026-05-07 | 初稿：输入/输出字段与实现差距 |

后续实现步骤建议：**先补地图栅格同源数据管道**，再统一输出 schema（单 tick vs sequence），最后改 `llm-prompt-builder` 与 proxy 路由。
