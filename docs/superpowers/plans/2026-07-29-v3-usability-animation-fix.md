# V3 Usability And Walk-Cycle Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make V3/legacy navigation reversible, replace weak character motion with visible eight-pose walk cycles, and make the V3 sidebar understandable without engine terminology.

**Architecture:** Keep routing at the page shell, keep asset generation and validation in the existing PixelLab pipeline, and simplify phase-specific React panels without changing runtime combat state. Browser-facing behavior is protected by unit/static tests plus production Playwright flows.

**Tech Stack:** Next.js 15, React 19, Phaser 3, TypeScript, Vitest, Playwright, PixelLab API, Sharp.

## Global Constraints

- Work only on branch `v3`.
- Do not change battle rules, deterministic replay, or Keco-authored content.
- Preserve the optimistic RPG pixel-art visual language.
- Character movement uses eight walk poses per direction and loops only while moving.
- Use player-facing Chinese by default; isolate technical evidence behind advanced disclosure.

---

### Task 1: Bidirectional Version Navigation

**Files:**
- Modify: `tests/v3-ui.test.ts`
- Modify: `tests/integration/v3.spec.ts`
- Modify: `app/legacy/page.tsx`
- Create: `app/legacy/legacy.css`

**Interfaces:**
- Consumes: Next.js route `/` and legacy route `/legacy`.
- Produces: an accessible link named `返回新版 V3` that targets `/`.

- [x] **Step 1: Write failing static and browser tests**

Assert that `app/legacy/page.tsx` imports `next/link`, renders `返回新版 V3`, and that Playwright can navigate `/` -> `/legacy` -> `/`.

- [x] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/v3-ui.test.ts`
Expected: FAIL because the legacy page has no V3 return link.

- [x] **Step 3: Implement the fixed legacy link**

Render a fixed `<Link href="/" className="legacy-v3-return">返回新版 V3</Link>` after `GameMap`, styled as a high-contrast pixel control with a stable z-index.

- [x] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/v3-ui.test.ts`
Expected: PASS.

### Task 2: Player-Facing Sidebar

**Files:**
- Modify: `tests/v3-ui.test.ts`
- Modify: `src/v3/ui/V3Game.tsx`
- Modify: `src/v3/ui/PreparationPanel.tsx`
- Modify: `src/v3/ui/SpectatorConsole.tsx`
- Modify: `src/v3/ui/BattleReport.tsx`
- Modify: `src/v3/ui/v3.css`

**Interfaces:**
- Consumes: existing `V3Progress`, encounter, battle, patch, and report data.
- Produces: journey, battle-status, AI-thought, battle-log, and advanced-detail sections with plain Chinese labels.

- [x] **Step 1: Write failing rendering tests**

Assert exploration source and rendered battle panels contain `当前任务`, `旅程进度`, `战况`, `AI 思路`, `战斗记录`, and `高级详情`, while visible headings no longer expose `Patch 证据`.

- [x] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/v3-ui.test.ts`
Expected: FAIL on missing player-facing labels.

- [x] **Step 3: Implement simplified copy and disclosure**

Keep the same data and callbacks, replace internal labels, reduce duplicated metadata, and move source/status/latency/tree-version/operations into a native `<details>` element.

- [x] **Step 4: Run focused tests and verify pass**

Run: `npx vitest run tests/v3-ui.test.ts`
Expected: PASS.

### Task 3: Real Eight-Pose Walk Cycles

**Files:**
- Modify: `tests/v3-assets.test.ts`
- Modify: `tests/v3-presentation.test.ts`
- Modify: `scripts/generate-v3-pixellab.mjs`
- Modify: `src/v3/presentation/V3WorldScene.ts`
- Regenerate: `public/assets/v3/characters/*/move/*/*.png`
- Modify: `public/assets/v3/manifest.json`

**Interfaces:**
- Consumes: PixelLab `animate-with-text` and existing character references.
- Produces: eight distinct skeleton-driven walk-pose frames per direction, `fps: 12`, looped by Phaser while the actor moves.

- [x] **Step 1: Write failing asset and presentation tests**

Assert animation registrations use the catalog's complete frame count, character FPS is 12, prompts name all eight gait phases, and opposite half-cycles have materially different alpha silhouettes.

- [x] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/v3-assets.test.ts tests/v3-presentation.test.ts`
Expected: FAIL because current prompts do not define gait phases and current assets use 10 FPS with weak silhouettes.

- [x] **Step 3: Update generator and runtime**

Add a force-character-animation switch, PixelLab skeleton estimation, explicit eight-phase gait keypoints, three-frame skeleton windows, dynamic animation frame ranges, and exploration movement speed that makes several poses visible per grid move.

- [x] **Step 4: Regenerate PixelLab character assets**

Run: `V3_FORCE_CHARACTER_ANIMATIONS=1 node scripts/generate-v3-pixellab.mjs`
Expected: all five characters regenerate five authored directions, three mirrored directions, sheets, frame files, and a deterministic manifest.

- [x] **Step 5: Inspect sheets and run focused tests**

Run: `npx vitest run tests/v3-assets.test.ts tests/v3-presentation.test.ts`
Expected: PASS with visible alternating footsteps in inspected sheets.

### Task 4: Production Regression

**Files:**
- Modify: `tests/integration/v3.spec.ts`

**Interfaces:**
- Consumes: the production Next.js build.
- Produces: release evidence for route switching, sidebar labels, canvas/assets, standard loop, sandbox isolation, and mobile framing.

- [x] **Step 1: Run type and unit verification**

Run: `npm run typecheck && npm test`
Expected: zero failures.

- [x] **Step 2: Run production build**

Run: `npm run build`
Expected: exit 0; the pre-existing legacy Hook dependency warning may remain.

- [x] **Step 3: Run production Playwright**

Run: `PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 npx playwright test tests/integration/v3.spec.ts --reporter=line`
Expected: all V3 integration tests pass with no console errors or failed V3 assets.

- [x] **Step 4: Commit the completed correction**

Commit the implementation, regenerated PixelLab assets, tests, and documentation on `v3` without merging or pushing.
