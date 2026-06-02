# Studio 默认数据导出

由 `node scripts/export-studio-defaults.mjs` 生成。

## 技能表 `battle_skills.csv`（19 列）

表头与 **keco-simulation** `BATTLE_SKILLS_SHEET_HEADERS` 对齐（snake_case），另加 POC 专用两列：

| 列 | 说明 |
|----|------|
| `id`, `name`, `type`, `power`, `mp_cost`, `max_cooldown`, `description` | 与 simulation 一致 |
| `category`, `range` | **仅 POC**：AI/UI 分类 + 地图施法距离（默认 3） |
| `attach_element`, `attach_strength`, `attach_turns` | 元素附着 |
| `dot_damage`, `dot_turns` | 持续伤害 |
| `freeze_turns` | **唯一冻结列**（= simulation 的 `freezeTurns` → Keco 冻结/跳过回合） |
| `special_effect`, `special_effect_value`, `special_effect_duration` | 治疗/降攻/降防 |
| `reaction_triggers` | 元素反应 JSON |

**已移除（相对旧版 POC 模板）**：`ratio`, `cooldown_ticks`, `keco_type`, `keco_power`, `keco_max_cooldown`, `apply_freeze_ticks`, `shatter_bonus_ratio`, `consume_freeze_on_hit` — 冻结/碎冰改由 `freeze_turns` + 元素反应（如 melt）表达，与 simulation 表一致。

元素默认：`data/skill-keco-defaults.json`

## 伤害公式

见 `DAMAGE_FORMULA_README.md`（单行 `damage_formula.csv`）。
