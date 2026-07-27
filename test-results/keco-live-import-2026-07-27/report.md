# Keco live import acceptance report

- Date: 2026-07-27 (Asia/Shanghai)
- Branch: `rebuild`
- Baseline: `7843c46 fix: harden Studio import reliability`
- Keco project: `battle-poc` (`fc3376fb-b6b8-42b0-8a16-459916e41da2`)
- Account owner: `33b7f9c6-7310-4100-b51d-fff916e38ab2`
- Result: **accepted**

## Source and import results

All source tables were created, updated, and read through the account-scoped Keco MCP. The browser acceptance used the real battle-poc import modal against hosted Supabase and applied every category through its normal UI.

| Category | Table ID | Stable rows | Applied result |
| --- | --- | ---: | --- |
| Skills | `158fae7e-2841-4800-9764-15e7e07aceaf` | 2 | Both skills bound and active |
| Class stats | `e0656d4d-964f-4d08-9b10-320f725d86d7` | 1 | MCP Chain Mage bound and active |
| Equipment slots | `1b206fd0-ac98-45b1-ae32-10a1adc7e378` | 1 | MCP Relay Blade active |
| Class loadouts | `678b01fc-0b3c-449e-b1be-5ccc49585bef` | 1 | Flame/Frost loadout active |
| Basic attack | `e2aff71c-eb3b-4bc1-ba37-7493460e6a03` | 1 | MCP Pulse Strike active |
| Battle formulas | `db819e6e-5d32-4e46-9593-868cbb9d22a3` | 17 | All 17 scalars active |

The final browser run applied 2 skill drafts, 1 job draft, and 20 game-config drafts. The visible class consumer showed MCP Chain Mage with HP 173, ATK 19, DEF 11, SPD 8 and both imported skills. Equipment, progression, enemy formula, basic attack, armor, damage, defend, and loadout consumers are additionally covered by `tests/poc-game-config-import.test.ts`.

## Source authority refresh

Two stable source rows were changed only through Keco MCP and read back from MCP before the browser rerun:

| Source | Stable row ID | Before | After |
| --- | --- | ---: | ---: |
| `Skills.mcp_chain_flame.power` | `befb7129-90a3-4813-9a96-e8505c23291e` | 2.31 | 2.57 |
| `BalanceScalars.exp_per_level.value` | `57254c2b-d6f1-438e-b49e-327bfd2a3b87` | 149 | 163 |

The final acceptance deliberately rewrote the bound local drafts and active modules to the old values, triggered the normal Provider refresh, and asserted that both drafts and active modules returned to 2.57 and 163. This is the second successful source-authority round; the previous round verified 1.73 to 2.31 and 137 to 149. Together they prove Keco table rows, rather than localStorage cache, are authoritative across repeated updates.

## Defects fixed

1. A game-config Apply broadcast caused its own Provider to start a redundant asynchronous hydrate. A slow hydrate from an earlier category could overwrite a later category's active module. A Provider mutation guard now ignores its own Apply broadcast while preserving external refresh events. Regression: `tests/import-provider-fallback.test.ts`.
2. Import catalog draft counts were memoized only by active module labels, so later categories displayed stale counts. Counts now recompute on render. Regression: `tests/import-ui-integrity.test.ts`.

## Verification

- Live Playwright acceptance: 1 passed, including all six imports, visible consumers, and stale-cache refresh.
- Focused import suite: 8 files, 64 tests passed.
- Full Vitest suite: 50 files, 261 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

The full test suite skipped its opt-in online behavior-tree model call because no model evaluation endpoint/key was requested. The production build reports the pre-existing exhaustive-deps warning in `useMapBattleLoop.ts`. During browser runs, hosted Supabase returned 404 for `player_saves`; the import tables and all import assertions still succeeded, so this is recorded as a separate persistence endpoint issue rather than an import-chain failure.

## Evidence

- `source-readback.json`: sanitized MCP schemas, stable row IDs, full source values, and refresh metadata.
- `acceptance-results.json`: sanitized final browser assertions.
- `00-table-discovery.png`: Keco project/table discovery in battle-poc.
- `01-import-applied.png`: correct draft counts (1, 1, 1, 17) and active config module.
- `02-gameplay-consumers.png`: imported class and skill consumer UI.
- `03-source-refresh.png`: UI state after authoritative source refresh.

The raw Playwright trace was intentionally removed after audit because it captured ephemeral Supabase access and refresh tokens in browser network/session records. No credentials are retained in the evidence directory.
