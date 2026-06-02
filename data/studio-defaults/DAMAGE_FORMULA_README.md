# 伤害计算公式 CSV 说明（`damage_formula.csv`）

这个文件**不是**技能表，也**不是**经验/敌人成长表。整张表只有 **一行配置**，控制地图战里「一次攻击/技能」怎么算伤害。

## 文件内容（只有 2 行：表头 + 1 行数据）

| 列名 | 含义 | 默认值 |
|------|------|--------|
| `id` | 固定写 `battle_damage`（只能这一行） | battle_damage |
| `mode` | `keco_element` = 元素版公式；`legacy_linear` = 旧线性公式 | keco_element |
| `basic_power` | 普攻在 Keco 里的 power 倍率 | 1 |
| `skill_power_scale` | 技能 CSV 的 `ratio` 转成 Keco power 时再乘这个系数 | 1 |
| `defend_damage_reduction` | 防御姿态下普攻减伤比例（0.6 = 减 60%） | 0.6 |
| `defend_skill_reduction` | 防御姿态下技能减伤比例 | 0.62 |
| `element_reactions_enabled` | `1` 开启元素反应倍率；`0` 关闭 | 1 |

## 实际伤害怎么算（`mode=keco_element` 时）

与 keco-simulation 一致，由 `@keco/battle-engine` 的 `executeSkill` 结算：

```
伤害 = ceil(攻击方 ATK × power × ATK/(ATK+DEF) × 反应倍率 × 其它倍率)
```

- **power**：普攻用 `basic_power`；技能用 `ratio × skill_power_scale`（也可在技能表填 `keco_power` 覆盖）。
- **反应倍率**：目标身上已有元素 A，本技能附着/触发元素 B 时，按反应表乘倍率（蒸发 2×、融化 2× 等）。需要：
  1. 本文件 `element_reactions_enabled=1`
  2. 技能表 `battle_skills.csv` 里配置了 `attach_element`、`reaction_triggers` 等列（见该表 README）

## 和 `battle_balance.csv` 的区别

| 文件 | 管什么 |
|------|--------|
| `damage_formula.csv` | **一行**全局伤害公式 + 是否开元素反应 |
| `battle_balance.csv` | 多行标量：经验、金币、敌人成长、`battle_armor_k` 等 |

不要把伤害公式混进 `battle_balance` 的 `key` 列。

## Studio 导入

左上角 **导入 → 伤害计算公式**，粘贴本 CSV，再 **Validate & apply**。
