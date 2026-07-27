# Keco Live Import Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagents are prohibited for this work.

**Goal:** Populate the live Keco `battle-poc` project through MCP and prove all six battle-poc Studio import categories consume and refresh that data.

**Architecture:** Keco remains the authored-data authority. Provisioning and mutation use only the connected account-scoped MCP; a Playwright live-acceptance test drives the real battle-poc UI against hosted Supabase, captures source-bound drafts/modules, and observes representative gameplay UI. Sanitized MCP and browser evidence is retained under `test-results`.

**Tech Stack:** Keco account MCP, Supabase Auth/PostgREST, Next.js 15, React 19, Playwright 1.59, Vitest 2.1.

## Global Constraints

- Work on branch `rebuild` in `/home/hetu/project/battle-poc`.
- Do not use subagents.
- Do not commit any files or external-data identifiers.
- Project ID is `fc3376fb-b6b8-42b0-8a16-459916e41da2`.
- Create and mutate table data only through the connected Keco MCP.
- Use the real battle-poc Studio import UI for import and Apply.
- Never persist secrets, cookies, access tokens, or service-role keys.
- Preserve sanitized evidence in `test-results/keco-live-import-2026-07-27/`.
- When a product defect appears, stop the acceptance, diagnose the failing boundary, add a failing automated test, implement one minimal fix, and restart the live acceptance.

---

### Task 1: Provision the live Keco source

**Files:**
- Create: `test-results/keco-live-import-2026-07-27/source-readback.json`

**Interfaces:**
- Consumes: the exact schemas and values in `docs/superpowers/specs/2026-07-27-keco-live-import-acceptance-design.md`.
- Produces: six Keco table IDs and stable row IDs used by the browser acceptance.

- [ ] **Step 1: Re-read project structure and abort on name collisions**

Call `list_project_structure({ projectId })`. Expected: no tables named
`Skills`, `Jobs`, `Equipment`, `Loadouts`, `BasicAttack`, or
`BalanceScalars`. If a previous interrupted run created any table, query and
reuse it only when its schema and rows exactly match the spec.

- [ ] **Step 2: Create the six tables**

Use `create_table` with semantic labels and these Keco types:

```text
Skills: id:string!, name:string!, description:string, category:string,
  type:string, power:float, mp:int, maxCooldown:int, range:float,
  attachElement:string, attachStrength:string, attachTurns:int,
  dotDamage:float, dotTurns:int, freezeTurns:int, specialEffect:string,
  specialEffectValue:float, specialEffectDuration:int, reactionTriggers:string
Jobs: id:string!, name:string!, description:string, preferredRange:string,
  hp:int, atk:int, def:int, spd:int, growthHp:float, growthAtk:float,
  growthDef:float, growthSpd:float, hpMult:float
Equipment: id:string!, name:string!, icon:string, stat:string, bonus:float
Loadouts: id:string!, skillIds:string!
BasicAttack: id:string!, name:string!, icon:string, multiplier:float,
  description:string
BalanceScalars: key:string!, value:float!
```

Expected: six successful MCP responses with distinct table IDs.

- [ ] **Step 3: Fill the initial empty row and create remaining rows**

Call `create_table_row({ reuseEmpty: true })` for each table's first row and
`create_table_row({ reuseEmpty: false })` for subsequent rows. Use the exact
values in the spec. Expected row counts: Skills 2, Jobs 1, Equipment 1,
Loadouts 1, BasicAttack 1, BalanceScalars 17.

- [ ] **Step 4: Read every row back through MCP**

Call `query_table_rows` for each table with `limit: 100`. Assert semantic
labels and values are unchanged, including reaction JSON and fractional values.

- [ ] **Step 5: Preserve sanitized source evidence**

Write `source-readback.json` with this shape, using only IDs, schemas, and row
values returned by MCP:

```json
{
  "projectId": "fc3376fb-b6b8-42b0-8a16-459916e41da2",
  "projectName": "battle-poc",
  "capturedAt": "ISO-8601 timestamp",
  "tables": {
    "Skills": { "tableId": "uuid", "fields": [], "rows": [] },
    "Jobs": { "tableId": "uuid", "fields": [], "rows": [] },
    "Equipment": { "tableId": "uuid", "fields": [], "rows": [] },
    "Loadouts": { "tableId": "uuid", "fields": [], "rows": [] },
    "BasicAttack": { "tableId": "uuid", "fields": [], "rows": [] },
    "BalanceScalars": { "tableId": "uuid", "fields": [], "rows": [] }
  }
}
```

### Task 2: Add a repeatable live browser acceptance

**Files:**
- Create: `tests/integration/keco-live-import.spec.ts`
- Read: `test-results/keco-live-import-2026-07-27/source-readback.json`
- Create at runtime: screenshots, trace, and `acceptance-results.json` under the evidence directory.

**Interfaces:**
- Consumes: `PLAYWRIGHT_AUTH_EMAIL`, `PLAYWRIGHT_AUTH_PASSWORD`, hosted Supabase env, and Task 1 table/row IDs.
- Produces: browser assertions for project discovery, import, Apply, source bindings, active module values, and visible gameplay consumers.

- [ ] **Step 1: Add a guarded test and artifact helpers**

Create a Playwright test that skips unless `KECO_LIVE_IMPORT=1`, reads the
sanitized source fixture, signs in through the existing Profile form, and never
logs credentials.

```ts
const runLive = process.env.KECO_LIVE_IMPORT === '1'
test.skip(!runLive, 'Set KECO_LIVE_IMPORT=1 for hosted Keco acceptance')

const evidenceDir = path.resolve('test-results/keco-live-import-2026-07-27')
const source = JSON.parse(await fs.readFile(path.join(evidenceDir, 'source-readback.json'), 'utf8'))
expect(source.projectId).toBe('fc3376fb-b6b8-42b0-8a16-459916e41da2')
```

- [ ] **Step 2: Clear only battle import state and authenticate**

Before login, remove only these keys so unrelated user data is untouched:

```ts
const keys = [
  'battle-poc-skill-drafts-v1',
  'battle-poc-skill-modules-v1',
  'battle-poc-job-drafts-v1',
  'battle-poc-job-modules-v1',
  'battle-poc-game-config-drafts-v1',
  'battle-poc-game-config-modules-v1',
]
for (const key of keys) localStorage.removeItem(key)
localStorage.setItem('battle-job-selected', '1')
```

Expected: Profile shows `Current session:` for the configured account. Then
open the Import button titled `Import skills, stats, and config from Studio`.

- [ ] **Step 3: Import and Apply skills and job**

For `Skills`, select table option `battle-poc / Skills`, choose both sentinel
IDs, click `Import selected (2)`, and click `Apply to catalog`. Assert the
success text contains `Applied` and that both draft bindings use the MCP table
and stable row IDs. Repeat for `Class stats` with `battle-poc / Jobs` and
`mcp_chain_mage`, then click `Validate & apply`.

- [ ] **Step 4: Import and Apply all game-config kinds**

Drive `Equipment slots`, `Class loadouts`, `Basic attack`, and `Battle
formulas` separately. Select the specified rows and click `Validate & apply`
after each import. Expected final config draft counts: equipment 1, loadout 1,
basic attack 1, balance scalar 17.

- [ ] **Step 5: Assert live bindings and module values**

Read the six known local-storage payloads and assert every draft contains the
MCP `tableId`, source row ID, semantic column key, and expected value. Assert
the active modules contain `mcp_chain_flame`, `mcp_chain_frost`,
`mcp_chain_mage`, `MCP Relay Blade`, `MCP Pulse Strike`, and all 17 scalar
values. Capture `01-import-applied.png`.

- [ ] **Step 6: Observe representative gameplay UI**

Close the import modal and verify the job selector exposes `MCP Chain Mage`;
select it and assert the HP/ATK/DEF/SPD values reflect its imported stats. Open
the relevant skill/equipment/battle panels and assert the sentinel names and
values are visible or produce the expected battle-log effect. Capture
`02-gameplay-consumers.png`. Any consumer that cannot be observed through the
existing UI must be covered by an existing focused consumer test and listed as
such in the report; do not add a test-only production hook.

- [ ] **Step 7: Save sanitized browser results**

Write `acceptance-results.json` containing assertion names, expected/actual
values, source table/row IDs, timestamps, and screenshot paths. Do not include
storage keys whose values are Supabase sessions.

- [ ] **Step 8: Run the initial browser acceptance**

Run:

```bash
KECO_LIVE_IMPORT=1 npx playwright test tests/integration/keco-live-import.spec.ts --trace on --reporter=line
```

Expected: one passing live test and trace material under `test-results`.

### Task 3: Prove live source refresh authority

**Files:**
- Modify: `test-results/keco-live-import-2026-07-27/source-readback.json`
- Modify at runtime: `test-results/keco-live-import-2026-07-27/acceptance-results.json`
- Modify: `tests/integration/keco-live-import.spec.ts`

**Interfaces:**
- Consumes: stable Skills and BalanceScalars row IDs from Task 1.
- Produces: proof that Keco values `2.31` and `149` replace cached values `1.73` and `137`.

- [ ] **Step 1: Update exactly two source rows through MCP**

Call `update_table_row` with `expectedRowId` for:

```text
Skills.mcp_chain_flame.power: 1.73 -> 2.31
BalanceScalars.exp_per_level.value: 137 -> 149
```

Expected: both MCP responses identify the same stable row IDs.

- [ ] **Step 2: Re-read both tables through MCP**

Assert `2.31` and `149` are present and the old values are absent. Update the
sanitized source-readback artifact with `updatedAt`, `before`, and `after`.

- [ ] **Step 3: Extend the browser test for refresh**

Reload the page or trigger provider hydration through the normal UI, reopen
the affected import categories, and click Apply without manually changing any
draft values. Assert stored source bindings and active modules now contain
`2.31` and `149`. Capture `03-source-refresh.png`.

- [ ] **Step 4: Re-run the live acceptance**

Run the same Playwright command. Expected: one pass; old values do not occur in
active imported module assertions.

### Task 4: Diagnose and fix any product defect found by the live run

**Files:**
- Test: the smallest relevant existing `tests/*.test.ts` file.
- Modify: only the source module at the proven failing boundary.

**Interfaces:**
- Consumes: a preserved failing trace, screenshot, and exact boundary evidence.
- Produces: a regression test and minimal fix, only when a defect exists.

- [ ] **Step 1: Record one root-cause hypothesis**

Document input/output at MCP read, Supabase table load, mapper, draft, Apply,
registry, and consumer boundaries. Identify the first differing boundary.

- [ ] **Step 2: Add and run one failing focused test**

Run `npm test -- <focused-test-file>`. Expected: failure reproduces the exact
live defect without relying on network access.

- [ ] **Step 3: Implement one minimal source fix**

Change only the proven source boundary. Do not edit live artifacts to hide the
failure and do not broaden the refactor.

- [ ] **Step 4: Run focused and complete live verification again**

Expected: focused regression passes and Tasks 2-3 pass from the clean import
state. Repeat diagnosis before any additional fix.

### Task 5: Preserve final evidence and run regression verification

**Files:**
- Create: `test-results/keco-live-import-2026-07-27/report.md`
- Preserve: all Task 1-3 JSON, screenshots, and trace output.

**Interfaces:**
- Consumes: final MCP read-back, browser artifacts, and test output.
- Produces: a self-contained evidence report with no secrets.

- [ ] **Step 1: Run focused import tests**

```bash
npm test -- tests/poc-skill-import.test.ts tests/poc-job-import.test.ts tests/game-config-import.test.ts tests/poc-import-state.test.ts tests/import-ui-integrity.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full regression gates**

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all commands exit 0. Record the test counts and any pre-existing
warning separately.

- [ ] **Step 3: Write the final report**

`report.md` must record branch and commit baseline, project/table/row IDs,
initial and refreshed sentinel values, each import category result, runtime and
consumer evidence, commands and counts, artifact paths, defects and fixes, and
remaining limitations. Explicitly state whether the chain is accepted.

- [ ] **Step 4: Audit artifacts for secrets and worktree state**

Search the evidence directory for `access_token`, `refresh_token`, `anon_key`,
`service_role`, `cookie`, and bearer-token patterns. Expected: no matches.
Run `git status --short --branch` and leave all work uncommitted.
