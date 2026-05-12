# Behavior Tree LLM：Eval-Driven Development 设计说明

本文档描述 `battle-poc` 中与行为树相关的 **两条 LLM 路径**（Patch / Initial tree）如何做评测集、评估函数与基线，并与当前源码行为对齐，避免与实现脱节。

**范围（源码位置）**

- 系统提示与请求拼装：`src/battle-core/service/ai/auto-decision-engine.ts`（`buildBehaviorTreePatchSystemPrompt`、`buildInitialBehaviorTreeSystemPrompt`、`buildBehaviorTreePatchPayload`、`buildInitialBehaviorTreePayload`）。
- 用户侧结构化战况：`buildStructuredPayload` → `src/battle-core/service/ai/decision-tree/llm-prompt-builder.ts`（`StructuredLlmPayload` 等）。
- 解析与 HTTP：`auto-decision-engine.ts` 内 `parseJsonObject`、`parseBehaviorTreePatch`、`sanitizePatchOperation`；直连 API 时 `temperature: 0.2`、`response_format: json_object`。
- 运行时可信边界：`src/battle-core/service/ai/behavior-tree/validation.ts`（`sanitizeBehaviorTreeState`、`applyBehaviorTreePatch`）。
- 类型定义：`src/battle-core/service/ai/behavior-tree/types.ts`。

---

## 1. 两条链路分别发生什么

### 1.1 Patch（行为树补丁）

**输入（user JSON）**

- `situation`：`buildStructuredPayload(...)` 的结果（含 `meta`、`actor`、`target`、`relative` 等）。
- `behaviorTree`：当前 `BehaviorTreeState`。
- `outputContract`：`{ patchOnly: true, maxOps: 3 }`（仅作为 payload 字段存在；**模型是否遵守 1～3 条 op 以系统 prompt 为准**。）

**系统 prompt 要点（摘要）**

- 仅输出 JSON；顶层 schema 为 `{ "patch": { baseVersion?, reason?, ops[] } }`。
- `reason` 枚举：`fix_legality | break_loop | improve_range_tempo | stabilize_trade | improve_priority`。
- **始终 1～3 个 op**；仅允许已有 `nodeId`；不增删节点、不改节点类型。
- op 类型：`set_condition_value` | `replace_action` | `reorder_children`（字段与枚举见源码字符串）。

**解析路径**

1. 模型文本 → `parseJsonObject`（先整段 `JSON.parse`，失败则截取首尾 `{` `}` 再试）。
2. → `parseBehaviorTreePatch`：支持顶层 `{ patch: ... }` 或直接 patch 形状；`ops` 经 `sanitizePatchOperation` 逐条过滤非法项；若过滤后 `ops` 为空则返回 `null`。
3. 运行时应用 → `applyBehaviorTreePatch(currentTree, patch, updatedAtTick)`。

### 1.2 Initial tree（初始行为树）

**输入**

- `situation`：同上。
- `seedTree`：`BehaviorTreeState`。
- `outputContract`：`{ fullTree: true }`。

**解析路径**

- 模型文本 → `parseJsonObject` → `sanitizeBehaviorTreeState(parsed, seedTree)`。
- **重要**：若 payload 无法解出合法根（非 selector/sequence）、深度超限、枚举非法等，**会退回 `seedTree` 的深拷贝**，而不是抛错。评测「模型是否生成了可用新树」时，不能只测「不崩溃」。

---

## 2. 运行时「真相」：评估函数应优先复用哪些代码

| 能力 | 函数 | 说明 |
|------|------|------|
| Patch 能否真正打上树 | `applyBehaviorTreePatch` | 返回 `{ applied, reason, tree }`。任一 op 非法则整批不应用，`applied === false`，`tree` 为应用前克隆。 |
| 整棵树是否可 ingest | `sanitizeBehaviorTreeState` | 白名单 `metric` / `action` / `target`；深度上限 `MAX_TREE_DEPTH === 6`；`moveStep` 在 `[0.4, 4.2]` 内 clamp；根类型必须是 selector/sequence。 |
| Patch 条目的基础合法性 | `sanitizePatchOperation`（非导出） | 在 `parseBehaviorTreePatch` 内调用；eval 可通过「录制 raw JSON → 走公开 API」或后续导出解析模块来统一路径。 |

### 2.1 `applyBehaviorTreePatch` 可能返回的 `reason`（硬编码）

- `empty_patch`
- `base_version_mismatch`（当 `patch.baseVersion != null` 且不等于 `currentTree.version`）
- `invalid_set_condition_value`
- `invalid_replace_action`
- `invalid_reorder_children`（目标节点不是 selector/sequence）
- `unknown_patch_operation`（op 类型无法识别）
- `ok`（成功应用并再 sanitize）

### 2.2 与 prompt 不一致之处（评测设计必须知道）

1. **`cast_skill` 的 `skillId`**：系统 prompt 要求来自 actor 可用技能；**`applyBehaviorTreePatch` / `applyActionReplacement` 不会对照技能表校验**。若要把「可执行」纳入标准答案，需在 eval 层增加 **inventory 检查**（对照 fixture 里 `situation.actor.skills` 或项目内技能目录）。
2. **`reorder_children` 与虚构 id**：`reorderNodeChildren` 会忽略不存在的 id，并在子节点数量与重排结果长度一致时写回子顺序。若模型传入的 id 全部无效，可能 **不改变顺序仍 `applied: true`**。若场景要求「不得编造 id」或「顺序必须按某意图变化」，eval 需 **额外断言**（例如 `orderedChildIds ⊆ 直接子节点 id`，或比较应用前后子序列 hash）。
3. **「1～3 个 op」**：由 prompt 约束；`parseBehaviorTreePatch` 不拒绝 `ops.length > 3`（若需与 `maxOps: 3` 对齐，eval 应显式断言 `ops.length <= 3`）。

---

## 3. 测试集（fixtures + manifest）

### 3.1 单条 case 建议字段

- `id`：稳定标识，如 `patch_apply_set_condition_v1`。
- `suite`：`patch` | `initial_tree`。
- `tier`：`gold`（CI 必过）| `smoke` | `stress` / `nightly`。
- `tags`：便于筛选，如 `["base_version", "reorder", "inventory"]`。
- `fixture`：引用 JSON 文件路径或内联对象。
  - Patch：`{ situation, behaviorTree }`（与 `buildBehaviorTreePatchPayload` 对齐，可省略运行时才会填的字段，但 **与真实 `buildStructuredPayload` 形状一致** 更易维护）。
  - Initial：`{ situation, seedTree }`。
- `expect`：见下文「标准答案分层」。
- `runs`（可选）：在线打模型时每个 case 重复次数 `N`。

### 3.2 Patch 场景清单（建议覆盖）

| 场景类型 | 目的 | fixture 要点 | 期望（摘要） |
|----------|------|----------------|--------------|
| P-apply-ok | 最小合法改动 | 小树 + 明确可改的 condition/action id | `applied === true`；可选：应用后某 `nodeId` 字段变化符合 `expect.afterApply` |
| P-op-count | 与 prompt 对齐 | 任意合法树 | `1 <= ops.length <= 3` |
| P-base-version-match | 乐观锁成功 | `tree.version === V`，patch 带 `baseVersion: V` | `applied === true` |
| P-base-version-mismatch | 乐观锁失败 | patch 带错误 `baseVersion` | `applied === false` 且 `reason === 'base_version_mismatch'` |
| P-invalid-node / P-wrong-op | 非法 op | 指向非 condition 的 `set_condition_value` 等 | `applied === false`，`reason` 符合上表之一 |
| P-reorder-valid | 重排生效 | selector 下 A,B,C；`orderedChildIds` 为合法排列 | 子顺序与期望一致 |
| P-reorder-noop-trap | 揭示实现细节 | 全为不存在 id（或无法凑满长度） | 若产品要求「必须真正重排」，需自定义断言；否则文档化「可能 applied 且无结构变化」 |
| P-replace-dash | moveStep 边界 | `replace_action` + dash | raw 越界时 **sanitizePatchOperation 会 clamp 到 [0.4, 4.2]**；断言应用后节点 `moveStep` 在区间内 |
| P-replace-cast | 技能可执行性 | 树上 cast_skill 故意错 skillId | **仅 eval 层**断言 `skillId ∈ allowlist`（来自 situation） |
| P-semantic-rubric | 与 `reason` / 战况一致 | 构造「明显非法阈值 / 循环摘要」等 | 软指标：`reason` 属于某子集的比例 ≥ 阈值（适合 N 次采样） |

### 3.3 Initial tree 场景清单（建议覆盖）

| 场景类型 | 目的 | 期望（摘要） |
|----------|------|----------------|
| I-valid | 正常 JSON + 合法树 | `sanitize` 后根类型、深度、白名单枚举通过；无重复 id |
| I-fallback | 恶意/残缺输出 | 与 **seed 深拷贝等价**（或结构 hash 一致），且不抛错 |
| I-inventory | cast_skill | 所有 `cast_skill` 的 `skillId` ∈ fixture 技能集合 |
| I-diverge（可选） | 要求 LLM 必须偏离 seed | 显式 `expect.mustDivergeFromSeed: true` + 结构 diff 断言（仅当产品需要） |
| I-anti-bloat（可选） | 防止过宽树 | 节点数 / 分支数上限（软分） |

---

## 4. 「标准答案」分层：从能跑到能改善

LLM 很少能逐字对齐唯一 gold JSON，建议每条 case 写 **expect 分层**：

### 4.1 Must（硬门禁，建议 gold 全满足）

- **format**：`parseJsonObject` 成功（及无 markdown 围栏，若你要求严格）。
- **schema**：Patch 可解析为非空 `ops`；Initial 的 raw 可被 unwrap 且根类型合法（或明确走 fallback）。
- **runtime**：`applyBehaviorTreePatch` → `applied === true`（Patch）；或 `sanitizeBehaviorTreeState` 通过且满足 `expect` 中声明的 fallback/非 fallback 行为（Initial）。
- **inventory**：`skillId`、枚举、`moveStep` 等与 fixture 一致（见 2.2 节）。

### 4.2 Should（软分 / 通过率）

- `reason` 与场景标签一致的比例。
- `reorder` / `replace` 与 prompt 中的优先级叙述一致（仅统计，不当唯一真值）。

### 4.3 Improve（「改善这颗树」的可测定义）

至少选一种可自动化口径（可并存）：

| 级别 | 名称 | 说明 |
|------|------|------|
| M0 | 结构 delta | 应用前后对指定 `nodeId` 的 `value` / 子顺序 / `action` 比较，满足 case 内写的不变量（例如「阈值向某方向调整」）。 |
| M1 | 静态策略探针 | 在固定 `situation` 下对树做轻量 walk（不跑完整战斗），检查「某条件下不应优先选 flee」等。 |
| M2 | 短仿真 | 使用行为树 runtime 在同一局面下 tick 若干步，比较前后决策分布（需固定 RNG 或对手策略）。 |
| M3 | Oracle 对齐 | 人工给定「理想 ops」或理想应用后树 hash；允许 LLM 不同路径但 `apply` 后树等价。 |

**建议**：Gold 以 **Must + M0 + M2(小步短仿真)** 为主，避免“只合规不有效”。

### 4.4 有效性主问题（你关心的核心）

针对「给定一颗树 + 上下文，模型返回是否有效」统一落到下面判定：

- **Patch 有效**：`applyBehaviorTreePatch` 成功后，满足 case 声明的 `effectInvariant`（例如：不再优先 retreat、阈值向目标方向变化、子顺序确实改变且无虚构 id）。
- **Initial 有效**：`sanitizeBehaviorTreeState` 后不是“无意义回退”，并满足 `effectInvariant`（例如：在指定局面下优先动作从 flee 变为 attack/cast）。
- **反作弊约束**：禁止把“`applied === true` / sanitize 成功”当作有效的充分条件；必须至少命中 1 条行为效果断言（M0/M1/M2 之一）。

---

## 5. 评估函数（分层维度与聚合）

对每次 run、每条 case，按固定顺序产出维度结果，便于与基线逐维对比：

| 维度 ID | Patch | Initial | 说明 |
|---------|--------|---------|------|
| `format` | ✓ | ✓ | JSON 可解析 |
| `schema_contract` | ✓ | ✓ | ops 数量上界、根类型、枚举等 |
| `runtime_apply` | `applied` + `reason` | `sanitize` 成功 / fallback 符合预期 |
| `inventory` | ✓ | ✓ | 技能表、dash 区间等（eval 自写） |
| `improvement` | M0–M3 中本 case 启用的子项 | 同左或结构 diff |
| `rubric` | 可选 | 可选 | LLM-as-judge 或启发式分 |
| `effective` | ✓ | ✓ | 是否满足 `effectInvariant`（本设计核心维度） |

**聚合**

- `hard_pass = format ∧ schema_contract ∧ runtime_apply ∧ inventory ∧ effective`（按 case 调整）。
- 在线评测：`pass_rate = 满足 hard_pass 的 run 数 / N`。
- **Gold**：建议 `pass_rate === 1`（或对 `rubric` 单独设阈值）。

### 5.1 `effectInvariant` 建议结构

每个 case 在 `expect` 中声明可机判的不变量，避免“看感觉好不好”：

```json
{
  "expect": {
    "hard": { "mustParse": true, "mustApply": true },
    "effectInvariant": {
      "type": "decision_or_structure",
      "assertions": [
        "orderedChildIds_subset_of_real_children",
        "after_apply_child_order_changed",
        "first_decision_in_probe in [basic_attack, cast_skill]"
      ]
    }
  }
}
```

- `decision_or_structure`：结构变化 + 策略探针二选一或同时满足（按 case 定义）。
- 对 Patch 的 `reorder_children` 场景，建议同时要求 `subset` + `order_changed`，专门拦截“applied 但无效果”。
- 对 Initial 场景，建议至少包含 1 条决策探针断言，防止长期 fallback/贴 seed 却被误判通过。

---

## 6. 基线（baseline.json）

### 6.1 `meta`（绑定环境，避免无效对比）

- `createdAt`
- `promptHashPatch` / `promptHashInitial`（对两段 system prompt 字符串做 hash；prompt 变更即视为新基线世代）
- `modelId`、`temperature`、`provider`（proxy / direct）
- `datasetVersion` 或 manifest 文件 hash

### 6.2 `cases[caseId]`

对每个维度记录：`passRate`（或单次 boolean）、可选 `meanScore`；建议附 `sampleFailures[]`（脱敏、截断）便于 PR 审查。

### 6.3 `aggregate`

按 `suite` / `tier` 汇总 `goldHardPassRate`、`smokeHardPassRate` 等。

### 6.4 回归门禁（示例策略）

- 每个 gold case：各硬维度 `pass_rate` 不得低于基线超过 `δ`（常用 `δ=0`）。
- 全局：`aggregate` 总分不得下降超过约定百分比（如 5%），与团队 EDD 约定一致即可。

### 6.5 更新基线流程

- 模型升级或 prompt 有意优化后，若指标普遍上升，经评审后**显式提交新 baseline.json**，并在 PR 描述中说明变更原因。
- 禁止在无说明情况下「放宽」基线掩盖退化。

---

## 7. 实现与 CI 接法（在线真实 AI）

1. **仅在线真实模型**：每个 case 都调用真实 LLM（与生产同 provider/model 配置），不再以录制 raw 作为主链路。
2. **分层运行**：
   - PR：`smoke`（小集，建议 `N=3`）。
   - main/nightly：`gold + stress`（建议 `N=5~10`）。
3. **一致性要求**：评测请求体必须复用生产拼装（`buildBehaviorTreePatchPayload` / `buildInitialBehaviorTreePayload`），避免“评测输入与线上输入不一致”。
4. **稳定性控制**：固定 `temperature`（当前 0.2），并记录 `modelId/provider/promptHash` 到 baseline，降低对比噪声。
5. **失败留证据**：每条失败 run 保存精简快照（`request meta + raw text + parsed + fail dimensions`），用于 prompt 调优闭环。

---

## 8. 已知产品 / Prompt 张力（评测可帮助暴露）

- Prompt 要求 **「Always 1 to 3 ops (never 0 ops)」**：若某 fixture 下树已无法做**任何**合法小改，模型可能被逼出「无意义但技术上 applied」的 op；eval 可量化该情况，并反推是否放宽 prompt 或调整 fixture。
- Initial：**合法坏输出与 seed 等价**是安全特性；若业务要求「必须产出与 seed 不同的新树」，必须在 case 里显式 `mustDivergeFromSeed` 并承担 flaky 风险（用 N 次与软阈值缓解）。
- 在线真实模型评测会引入采样波动：门禁应以 `pass_rate` + 维度级失败分布联合判断，避免单次偶发误杀。

---

## 9. 文档修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-12 | 初版：与 `auto-decision-engine.ts`、`validation.ts`、`llm-prompt-builder.ts` 当前行为对齐撰写。 |
| 2026-05-12 | 调整为“在线真实 AI 优先”：去掉离线优先叙述，新增 `effective` 维度与 `effectInvariant` 判定，明确「给树+上下文后返回是否有效」为核心门禁。 |
