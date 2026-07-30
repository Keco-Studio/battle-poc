# AI Battle V3 Core Loop Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair V3 movement and campaign completion, then make progression, AI decisions, defeat feedback, and interaction-grounded evaluation complete and player-facing.

**Architecture:** Pure runtime modules own grid travel, progression resolution, decision traces, text formatting, and report analysis. React owns input intent and committed state; Phaser only animates the current route leg and reports arrival. Keco owns new progression rows, which are read back and compiled into the local V3 content graph.

**Tech Stack:** Next.js 15, React 19, Phaser 3.80 Arcade Physics, strict TypeScript, Vitest, Playwright, Sharp, Keco Account MCP.

## Global Constraints

- Work only on branch `v3`; do not inspect or merge other branches and do not push.
- Keep `/` as V3 and `/legacy` as the preserved previous experience.
- Browser runtime must not access Keco, PixelLab, Supabase, or another database.
- Character travel must use the existing eight directions, eight frames per direction, and 12 FPS real walk cycles.
- Standard and sandbox progression must remain isolated.
- Existing PixelLab assets are unchanged unless a broken runtime asset is proven.
- Production evaluation uses fixed 1280x720 desktop and 390x844 mobile viewports.

---

### Task 1: Authoritative Exploration Travel

**Files:**
- Create: `src/v3/runtime/exploration.ts`
- Modify: `src/v3/runtime/useV3Game.ts`
- Modify: `src/v3/runtime/index.ts`
- Modify: `src/v3/presentation/viewModel.ts`
- Modify: `src/v3/presentation/V3WorldScene.ts`
- Modify: `src/v3/presentation/V3PhaserStage.tsx`
- Modify: `src/v3/ui/V3Game.tsx`
- Test: `tests/v3-exploration.test.ts`
- Test: `tests/v3-presentation.test.ts`
- Test: `tests/v3-ui.test.ts`

**Interfaces:**
- Consumes: `V3Point`, `V3MoveIntent`, map width/height, optional blocked points, and the committed progress position.
- Produces:

```ts
export type V3TravelState = {
  committed: V3Point
  route: V3Point[]
  requestId: number
}

export function planTravel(
  state: V3TravelState,
  target: V3Point,
  bounds: { width: number; height: number },
  blocked?: readonly V3Point[],
): V3TravelState

export function commitTravelArrival(
  state: V3TravelState,
  requestId: number,
  arrived: V3Point,
): V3TravelState
```

`V3PhaserStage` adds `onTravelArrival(requestId, point)`. `V3ExploreViewModel` adds `travelRoute` and `travelRequestId`.

- [ ] **Step 1: Write failing pure movement and UI contract tests**

```ts
it('commits only an adjacent arrived cell and ignores duplicate arrival', () => {
  const planned = planTravel({ committed: { x: 3, y: 16 }, route: [], requestId: 0 }, { x: 6, y: 16 }, { width: 32, height: 20 })
  expect(planned.route).toEqual([{ x: 4, y: 16 }, { x: 5, y: 16 }, { x: 6, y: 16 }])
  const once = commitTravelArrival(planned, planned.requestId, { x: 4, y: 16 })
  expect(once.committed).toEqual({ x: 4, y: 16 })
  expect(commitTravelArrival(once, planned.requestId, { x: 4, y: 16 })).toBe(once)
})

it('routes around blocked cells and leaves unreachable state unchanged', () => {
  const state = { committed: { x: 0, y: 0 }, route: [], requestId: 0 }
  expect(planTravel(state, { x: 2, y: 0 }, { width: 3, height: 2 }, [{ x: 1, y: 0 }]).route)
    .toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }])
  expect(planTravel(state, { x: 2, y: 0 }, { width: 3, height: 1 }, [{ x: 1, y: 0 }])).toBe(state)
})
```

Add UI assertions that `V3Game.tsx` contains `前往` navigation and no unlocked route row calls `openEncounter` directly.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run tests/v3-exploration.test.ts tests/v3-presentation.test.ts tests/v3-ui.test.ts`

Expected: failure because `exploration.ts`, arrival callbacks, and navigation contracts do not exist.

- [ ] **Step 3: Implement deterministic BFS travel and arrival ownership**

Use cardinal neighbors in fixed order `up, right, down, left`; reject out-of-bounds or blocked targets; make duplicate/mismatched arrivals return the original state. `useV3Game` persists `progress.playerPosition` only after `commitTravelArrival` changes `committed`. Direction intent targets one adjacent cell; map and route-list intent target a full path. A new request during a leg replans from the current leg destination.

In Phaser, move only toward `travelRoute[0]`, call `onTravelArrival` once inside the existing `distance <= 3` branch, and center the exploration camera on `player.sprite.x/y`. Remove Phaser's direct encounter callback. After an arrival commit, React opens preparation when the committed cell matches an unlocked uncleared encounter.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/v3-exploration.test.ts tests/v3-presentation.test.ts tests/v3-ui.test.ts`

Expected: all focused movement, presentation, and UI tests pass.

- [ ] **Step 5: Commit the movement repair**

```bash
git add src/v3/runtime/exploration.ts src/v3/runtime/useV3Game.ts src/v3/runtime/index.ts src/v3/presentation/viewModel.ts src/v3/presentation/V3WorldScene.ts src/v3/presentation/V3PhaserStage.tsx src/v3/ui/V3Game.tsx tests/v3-exploration.test.ts tests/v3-presentation.test.ts tests/v3-ui.test.ts
git commit -m "fix: synchronize v3 exploration travel"
```

### Task 2: Keco Progression And Finishable Boss

**Files:**
- Modify: `scripts/v3-content-source.json`
- Modify: `src/content/generated/v3/types.ts`
- Modify: `src/content/generated/v3/content.ts`
- Modify: `src/content/generated/v3/provenance.json`
- Modify: `scripts/validate-v3-content.mjs`
- Modify: `src/v3/runtime/types.ts`
- Modify: `src/v3/runtime/campaign.ts`
- Modify: `src/v3/runtime/battleEngine.ts`
- Modify: `src/v3/runtime/useV3Game.ts`
- Modify: `src/v3/ui/PreparationPanel.tsx`
- Test: `tests/v3-content.test.ts`
- Test: `tests/v3-campaign.test.ts`
- Test: `tests/v3-battle-engine.test.ts`
- Test: `tests/v3-replay.test.ts`
- Test: `tests/v3-ui.test.ts`

**Interfaces:**

```ts
export type V3StatModifiers = { hp: number; energy: number; atk: number; def: number; spd: number }
export type V3BattleVersions = {
  content: string
  rules: string
  visual: string
  modelProvider: 'minimax' | 'deepseek'
  model: string
}
export type V3ProgressionBonus = V3StatModifiers & {
  id: string
  contentVersion: string
  dropId: string
  description: string
}
export function progressionModifiers(progress: Pick<V3Progress, 'drops'>): V3StatModifiers
```

`V3BattleConfig.left` and `.right` add `modifiers: V3StatModifiers`, and the config adds `versions: V3BattleVersions`; the exact resolved values and version binding are retained in replay config.

- [ ] **Step 1: Write failing progression, balance, and replay tests**

Create three progression fixtures and assert the cumulative prerequisite bonus:

```ts
expect(progressionModifiers({ drops: ['bloom_core', 'sunforge_coil', 'prism_lens'] })).toEqual({
  hp: 18, energy: 20, atk: 4, def: 3, spd: 1,
})
```

Exhaust all 1,680 ordered non-duplicate four-skill loadouts against `marshal_gate` with deterministic fallback decisions. Assert zero wins with empty modifiers, more than zero and fewer than 1,680 wins with the cumulative prerequisite modifier. Assert replay reproduces modified actors and `versions` exactly, sandbox outcome writes no progression, and report metadata comes from `initialConfig.versions` rather than current globals.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/v3-content.test.ts tests/v3-campaign.test.ts tests/v3-battle-engine.test.ts tests/v3-replay.test.ts tests/v3-ui.test.ts`

Expected: failures for missing progression content, modifiers, and preparation bonus summary.

- [ ] **Step 3: Create and populate `V3_Progression` through Keco Account**

Create one table in project `fc3376fb-b6b8-42b0-8a16-459916e41da2` with required fields `id:string`, `contentVersion:string`, `dropId:string`, `hp:int`, `energy:int`, `atk:int`, `def:int`, `spd:int`, and `description:string`. Create exactly these rows:

```json
[
  { "id": "progression_bloom", "contentVersion": "v3.0.0", "dropId": "bloom_core", "hp": 12, "energy": 0, "atk": 0, "def": 2, "spd": 0, "description": "繁花核心强化生命与防御。" },
  { "id": "progression_sunforge", "contentVersion": "v3.0.0", "dropId": "sunforge_coil", "hp": 0, "energy": 0, "atk": 4, "def": 0, "spd": 1, "description": "晴铸线圈强化攻击与速度。" },
  { "id": "progression_prism", "contentVersion": "v3.0.0", "dropId": "prism_lens", "hp": 6, "energy": 20, "atk": 0, "def": 1, "spd": 0, "description": "棱镜透镜强化生命、能量与防御。" }
]
```

Read all rows back and verify every field before touching local generated content.

- [ ] **Step 4: Compile progression and apply embedded modifiers**

Add `content.progression` to the source JSON and V3 content graph. Validate finite nonnegative integer bonuses, unique `dropId`, matching content version, and a reward for each progression drop. Run `node scripts/validate-v3-content.mjs` to refresh the content fingerprint.

Resolve standard modifiers from progress before battle creation; use zero modifiers in sandbox. Apply modifiers in `createActor` to both current and maximum HP/energy and combat stats. Bind content, rules, visual, provider, and model versions when creating the config. Show the five modifier totals and earned source names in preparation, and render the bound versions in report advanced details.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run tests/v3-content.test.ts tests/v3-campaign.test.ts tests/v3-battle-engine.test.ts tests/v3-replay.test.ts tests/v3-ui.test.ts`

Expected: progression graph, exhaustive boss balance, replay, sandbox, and UI tests pass.

- [ ] **Step 6: Commit progression data and runtime**

```bash
git add scripts/v3-content-source.json scripts/validate-v3-content.mjs src/content/generated/v3 src/v3/runtime/types.ts src/v3/runtime/campaign.ts src/v3/runtime/battleEngine.ts src/v3/runtime/useV3Game.ts src/v3/ui/PreparationPanel.tsx tests/v3-content.test.ts tests/v3-campaign.test.ts tests/v3-battle-engine.test.ts tests/v3-replay.test.ts tests/v3-ui.test.ts
git commit -m "feat: add v3 expedition progression"
```

### Task 3: Decision Trace And Player-Facing Text

**Files:**
- Create: `src/v3/presentation/playerText.ts`
- Modify: `src/v3/runtime/behaviorTree.ts`
- Modify: `src/v3/runtime/battleEngine.ts`
- Modify: `src/v3/runtime/types.ts`
- Modify: `src/v3/runtime/useV3Game.ts`
- Modify: `src/v3/presentation/viewModel.ts`
- Modify: `src/v3/presentation/V3WorldScene.ts`
- Modify: `src/v3/ui/V3Game.tsx`
- Modify: `src/v3/ui/SpectatorConsole.tsx`
- Modify: `src/v3/ui/BattleReport.tsx`
- Test: `tests/v3-battle-engine.test.ts`
- Test: `tests/v3-presentation.test.ts`
- Test: `tests/v3-ui.test.ts`

**Interfaces:**

```ts
export type V3BehaviorTrace = { visitedNodeIds: string[]; selectedNodeId: string | null }
export function evaluateBehaviorTreeWithTrace(
  state: V3BattleState,
  actorId: V3ActorId,
): { action: V3BattleAction; trace: V3BehaviorTrace }
export function playerEventText(event: V3BattleEvent, battle: V3BattleState): string
export function playerNodeText(nodeId: string | undefined, actorId: V3ActorId, battle: V3BattleState): string
```

`V3BattleEvent` adds optional `nodeId`, `visitedNodeIds`, and `rejectCode`; its type union adds `action_rejected`.

- [ ] **Step 1: Write failing trace and translation tests**

Assert a balanced-tree action records a non-root selected node and visited path. Force an unequipped tree skill, assert `action_rejected` records `not_equipped`, and assert fallback still completes. Render spectator/report events and assert no visible `skill`, `accepted:`, `left_win`, `hp_zero`, `set_threshold`, `not_equipped`, or raw node IDs.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/v3-battle-engine.test.ts tests/v3-presentation.test.ts tests/v3-ui.test.ts`

Expected: failures for missing trace fields, rejection event, and shared translations.

- [ ] **Step 3: Implement traced evaluation and shared text formatting**

Traverse with one shared trace array; set `selectedNodeId` only when an action node returns an action. In `resolveDecisionTick`, validate the proposed action once, emit `action_rejected` before fallback when invalid, and attach trace fields to the final action event. Keep `evaluateBehaviorTree` as a compatibility wrapper returning only `.action`.

Translate action kinds to `普通攻击/施放技能/移动/防守/等待`, patch statuses to player language, rejection codes to exact reasons, and results/end reasons to Chinese. Skill and actor IDs resolve through `V3_CONTENT` and battle actor state.

- [ ] **Step 4: Use traces in Phaser, spectator, and report**

Replace raw active-event messages in `V3Game` and `V3WorldScene`. Show compact per-actor rows containing current action, selected node description, and latest patch status. Keep operation kinds and versions only in `高级详情`, with translated operation descriptions.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run tests/v3-battle-engine.test.ts tests/v3-presentation.test.ts tests/v3-ui.test.ts`

Expected: trace, fallback evidence, and player-language tests pass.

- [ ] **Step 6: Commit decision trace and text repair**

```bash
git add src/v3/runtime/behaviorTree.ts src/v3/runtime/battleEngine.ts src/v3/runtime/types.ts src/v3/runtime/useV3Game.ts src/v3/presentation/playerText.ts src/v3/presentation/viewModel.ts src/v3/presentation/V3WorldScene.ts src/v3/ui/V3Game.tsx src/v3/ui/SpectatorConsole.tsx src/v3/ui/BattleReport.tsx tests/v3-battle-engine.test.ts tests/v3-presentation.test.ts tests/v3-ui.test.ts
git commit -m "feat: expose v3 battle reasoning"
```

### Task 4: Evidence-Based Battle Analysis

**Files:**
- Create: `src/v3/runtime/battleAnalysis.ts`
- Modify: `src/v3/runtime/index.ts`
- Modify: `src/v3/ui/BattleReport.tsx`
- Modify: `src/v3/ui/v3.css`
- Test: `tests/v3-battle-analysis.test.ts`
- Test: `tests/v3-ui.test.ts`

**Interfaces:**

```ts
export type V3BattleInsight = { kind: 'strength' | 'adjustment'; title: string; detail: string }
export type V3BattleAnalysis = {
  damageBySkill: Array<{ skillId: string | null; damage: number; hits: number }>
  rejectedActions: number
  decisiveTick: number | null
  insights: V3BattleInsight[]
}
export function analyzeBattle(state: V3BattleState): V3BattleAnalysis
```

- [ ] **Step 1: Write failing deterministic analysis tests**

Construct event fixtures for repeated `out_of_range`, burst damage, zero damage, and victory. Assert suggestions cite observed counts and skill names, defeat returns `adjustment`, victory returns `strength`, and identical battle records return identical analysis.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/v3-battle-analysis.test.ts tests/v3-ui.test.ts`

Expected: failure because analysis and report insight sections do not exist.

- [ ] **Step 3: Implement pure aggregation and report sections**

Aggregate damage events by `skillId`, rejection events by `rejectCode`, and choose the last damage tick that reduced the loser to zero as decisive. Produce at most three insights in stable priority order: range/mobility, incoming burst/defense, ineffective damage/offense, successful top skill, and strategy adaptation count.

Render `下次调整` for defeat or draw and `制胜关键` for victory above advanced details. Keep advice concise and evidence-backed; never claim an unobserved cause.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/v3-battle-analysis.test.ts tests/v3-ui.test.ts`

Expected: analysis and report rendering tests pass.

- [ ] **Step 5: Commit battle analysis**

```bash
git add src/v3/runtime/battleAnalysis.ts src/v3/runtime/index.ts src/v3/ui/BattleReport.tsx src/v3/ui/v3.css tests/v3-battle-analysis.test.ts tests/v3-ui.test.ts
git commit -m "feat: add actionable v3 battle analysis"
```

### Task 5: GameCraft Interaction Evidence And Final Evaluation

**Files:**
- Create: `tests/integration/v3-gamecraft.spec.ts`
- Modify: `tests/integration/v3.spec.ts`
- Create: `docs/evaluations/v3-gamecraft-report.md`
- Modify: `docs/evaluations/v3-report.md`

**Interfaces:**
- Consumes: the production V3 route and stable accessible labels from Tasks 1-4.
- Produces: deterministic browser scenarios, screenshots under `test-results/v3-gamecraft/`, a GDD traceability matrix, category scores, and updated fingerprints.

- [ ] **Step 1: Write failing interaction scenarios**

Add Playwright scenarios at 1280x720 that:

```ts
await page.getByRole('button', { name: '前往青藤试炼' }).click()
await expect(page.locator('.v3-hud-strip')).toContainText('9,14')
await expect(page.getByRole('heading', { name: '挑战 青藤试炼' })).toBeVisible()
```

Also assert the coordinate changes through at least three intermediate cells before preparation; default Sunforge defeat shows `下次调整`; an adjusted build wins; three prerequisite wins expose progression bonuses and unlock the boss; one tuned boss build wins; replay returns the same result; sandbox leaves progress unchanged; no raw engine tokens are visible; mobile has no horizontal overflow; canvas pixels are nonblank; all local assets return 200; external runtime requests are empty.

- [ ] **Step 2: Run production Playwright and fix only proven integration defects**

Run:

```bash
npm run build
npx next start -p 3004
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 npx playwright test tests/integration/v3.spec.ts tests/integration/v3-gamecraft.spec.ts --reporter=line
```

Expected: both suites pass against the production build. If a scenario fails, follow the root cause from recorded interaction state before editing.

- [ ] **Step 3: Inspect desktop and mobile screenshots**

Inspect exploration, movement, preparation, battle, defeat report, boss victory, and mobile battle images. Check text containment, non-overlap, canvas framing, walking visibility, decision hierarchy, and absence of blank or placeholder visuals. Correct only observed CSS/presentation failures and rerun the affected scenario.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 npx playwright test tests/integration/v3.spec.ts tests/integration/v3-gamecraft.spec.ts --reporter=line
```

Expected: zero command failures, with only the documented legacy Hook warning and Vite CJS deprecation warning.

- [ ] **Step 5: Write the final GameCraft report**

Record build gate, GDD requirement-to-test mapping, Core Mechanics/Content Depth/Functional Visuals/Art and Presentation item scores, weighted total, exact commands, Keco table/row readback, content and visual fingerprints, screenshot paths, fixed defects, and residual limitations. Update the older V3 report so it does not retain stale fingerprints or acceptance claims.

- [ ] **Step 6: Commit evaluation evidence**

```bash
git add tests/integration/v3.spec.ts tests/integration/v3-gamecraft.spec.ts docs/evaluations/v3-gamecraft-report.md docs/evaluations/v3-report.md
git commit -m "test: add v3 interaction-grounded evaluation"
```
