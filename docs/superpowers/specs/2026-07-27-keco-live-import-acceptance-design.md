# Keco Live Import Acceptance

## Goal

Create an authoritative `battle-poc` project in the connected Keco account,
populate deterministic authored data through the account-scoped Keco MCP, and
prove that battle-poc imports, applies, and refreshes that data through its real
Studio import UI.

This is a live acceptance exercise against the shared online Supabase project.
It is not a mocked integration test and it must not treat battle-poc local
storage or built-in constants as the source of truth.

## Fixed Context

- Branch: `rebuild`.
- Keco project: `battle-poc`.
- Keco project ID: `fc3376fb-b6b8-42b0-8a16-459916e41da2`.
- The Keco MCP connection is account-scoped and operational.
- The Keco MCP creates tables and rows; the user created the project because
  the MCP does not expose `create_project`.
- Keco Studio and battle-poc use the same hosted Supabase project.
- Existing Google OAuth work and all acceptance artifacts remain uncommitted.
- No secrets, access tokens, cookies, or service-role keys may be written to
  the repository or captured in screenshots.

## Source Tables

The Keco project contains six purpose-built tables. Field labels intentionally
match battle-poc's automatic header aliases.

### `Skills`

Fields:

`id`, `name`, `description`, `category`, `type`, `power`, `mp`,
`maxCooldown`, `range`, `attachElement`, `attachStrength`, `attachTurns`,
`dotDamage`, `dotTurns`, `freezeTurns`, `specialEffect`,
`specialEffectValue`, `specialEffectDuration`, and `reactionTriggers`.

Rows:

1. `mcp_chain_flame`: `name=MCP Chain Flame`, `description=Live MCP fire
   acceptance skill`, `category=burst`, `type=attack`, `power=1.73`, `mp=7`,
   `maxCooldown=3`, `range=4.5`, `attachElement=fire`,
   `attachStrength=strong`, `attachTurns=3`, `dotDamage=0.27`, `dotTurns=2`,
   `freezeTurns=0`, `specialEffect=def_debuff`, `specialEffectValue=0.21`,
   `specialEffectDuration=2`, and
   `reactionTriggers=[{"element":"fire","reaction":"overload"}]`.
2. `mcp_chain_frost`: `name=MCP Chain Frost`, `description=Live MCP frost
   acceptance skill`, `category=control`, `type=attack`, `power=0.91`, `mp=5`,
   `maxCooldown=2`, `range=5`, `attachElement=ice`,
   `attachStrength=weak`, `attachTurns=2`, `dotDamage=0`, `dotTurns=0`,
   `freezeTurns=2`, and empty special/reaction fields.

The two rows prove multi-row merge behavior and exercise all supported advanced
skill fields without colliding with built-in skill IDs.

### `Jobs`

Fields:

`id`, `name`, `description`, `preferredRange`, `hp`, `atk`, `def`, `spd`,
`growthHp`, `growthAtk`, `growthDef`, `growthSpd`, and `hpMult`.

Row:

`mcp_chain_mage`: `name=MCP Chain Mage`, `description=Live MCP acceptance
class`, `preferredRange=ranged`, `hp=173`, `atk=19`, `def=11`, `spd=8`,
`growthHp=41`, `growthAtk=6`, `growthDef=4`, `growthSpd=2`, and `hpMult=1.7`.

### `Equipment`

Fields: `id`, `name`, `icon`, `stat`, and `bonus`.

Row: `id=weapon`, `name=MCP Relay Blade`, `icon=M`, `stat=atk`, and
`bonus=13.5`. The ID deliberately targets a supported equipment slot while the
value proves that the built-in slot was replaced by live authored data.

### `Loadouts`

Fields: `id` and `skillIds`.

Row: `mcp_chain_mage`, containing
`mcp_chain_flame,mcp_chain_frost`.

### `BasicAttack`

Fields: `id`, `name`, `icon`, `multiplier`, and `description`.

Row: `id=basic_attack`, `name=MCP Pulse Strike`, `icon=M`, `multiplier=1.17`,
and `description=Live MCP basic attack`.

### `BalanceScalars`

Fields: `key` and `value`.

Rows cover every supported scalar key:

- progression: `exp_per_level`, `reward_exp_per_enemy_level`,
  `reward_gold_per_enemy_level`;
- enemy base and growth: HP, ATK, DEF, and SPD;
- `hp_multiplier`;
- battle formulas: armor, basic damage, skill damage, defend damage, and
  defend skill reduction.

Exact values:

| Key | Value |
| --- | ---: |
| `exp_per_level` | 137 |
| `reward_exp_per_enemy_level` | 23 |
| `reward_gold_per_enemy_level` | 17 |
| `enemy_base_hp` | 91 |
| `enemy_base_atk` | 13 |
| `enemy_base_def` | 7 |
| `enemy_base_spd` | 8 |
| `enemy_growth_hp` | 11 |
| `enemy_growth_atk` | 2.4 |
| `enemy_growth_def` | 1.3 |
| `enemy_growth_spd` | 0.7 |
| `hp_multiplier` | 1.83 |
| `battle_armor_k` | 47 |
| `basic_damage_multiplier` | 0.93 |
| `skill_damage_multiplier` | 0.88 |
| `defend_damage_reduction` | 0.41 |
| `defend_skill_reduction` | 0.44 |

Every value differs from battle-poc's built-in default.

## Keco Field Types

- IDs, names, descriptions, categories, enums represented by labels, icons,
  loadout lists, and reaction JSON use Keco `string` fields.
- Whole-number counters and durations use `int` fields.
- Ratios, multipliers, growth values, bonuses, ranges, powers, and scalar
  values use `float` fields.
- Required fields are limited to each table's row identity and display name
  where applicable. Optional zero/empty values remain explicitly present so
  refresh can observe later source edits.

## Data Flow

```text
Keco MCP create_table/create_table_row
  -> Keco MCP query_table_rows read-back
  -> battle-poc Studio project/table discovery
  -> table validation and row selection in StudioImportModal
  -> source-bound local draft
  -> Validate & apply
  -> skill/job/config runtime registries
  -> gameplay consumers
```

The browser session must be authenticated as the same Supabase user that owns
or can access the Keco project. The acceptance must use the application UI for
table selection, row import, and Apply. Directly calling mapper functions does
not count as end-to-end evidence.

## Acceptance Sequence

1. Create all six tables and rows using only the connected Keco MCP.
2. Read every table back through the MCP and record table IDs, row IDs, schemas,
   and values in a sanitized JSON artifact.
3. Start battle-poc on port 3002 and authenticate against the shared hosted
   Supabase project.
4. Open the Studio import center and verify all six `battle-poc` tables appear.
5. Import both skills and Apply to the skill catalog.
6. Import the job and Apply to the job catalog.
7. Import equipment, loadout, basic attack, and all balance rows, then Apply
   the game-config drafts.
8. Assert the persisted source bindings reference the live Keco table and row
   IDs, and assert runtime registry values match the authored sentinel values.
9. Exercise gameplay consumers for at least skill/DOT, job stats, equipment,
   basic attack multiplier, and one balance formula. Registry-only assertions
   are supporting evidence, not the sole evidence.
10. Update `mcp_chain_flame.power` from `1.73` to `2.31` and
    `exp_per_level` from `137` to `149` through the MCP.
11. Trigger battle-poc's normal live refresh/rehydration path and Apply again.
12. Assert both runtime and gameplay consumers use `2.31` and `149`, and that
    `1.73` and `137` are absent from the active imported state, proving Keco
    remains authoritative over cache.

## Failure Policy

- Stop at the first unexplained failure and preserve its evidence.
- Diagnose the failing boundary before changing code or data.
- If a battle-poc defect is found, add a failing automated test before the
  smallest implementation fix, then repeat the complete live acceptance.
- A table that fails validation must not be worked around by manually editing
  local drafts.
- A successful import message without matching runtime and gameplay values is
  a failed acceptance.

## Preserved Evidence

Store uncommitted artifacts under:

`test-results/keco-live-import-2026-07-27/`

Required artifacts:

- `source-readback.json`: sanitized MCP table/row read-back;
- `acceptance-results.json`: timestamped assertions and actual values;
- `report.md`: concise sequence, environment, results, and any defects/fixes;
- screenshots of project/table discovery, successful imports, Apply results,
  and post-refresh values;
- Playwright trace for the browser run when available.

The report must distinguish direct MCP evidence, browser UI evidence, runtime
registry evidence, and gameplay-consumer evidence.

## Completion Criteria

The chain is accepted only when:

1. all six Keco tables and expected rows can be read back through MCP;
2. battle-poc discovers those exact live tables for the same account;
3. every import category creates source-bound drafts and applies without error;
4. all sentinel values reach their runtime registries;
5. representative gameplay consumers observe imported values;
6. post-MCP edits replace the previously applied runtime values through the
   normal refresh path;
7. focused tests and the existing full regression suite pass; and
8. sanitized evidence remains in the working tree.
