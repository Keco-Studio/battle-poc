# V3 English-Only Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Chinese text from the V3 executable source boundary and prevent it from returning.

**Architecture:** Keep stable IDs and game behavior unchanged while translating authored content and player-facing strings at their current ownership boundaries. Add one filesystem-based source gate that scans V3 runtime, content source, validators, and V3 tests for Han characters.

**Tech Stack:** TypeScript, React, Phaser 3, Vitest, Playwright, Next.js, JSON-authored content.

## Global Constraints

- Do not rename stable content IDs, asset paths, table IDs, or behavior-tree node IDs.
- Preserve existing uncommitted English-conversion edits.
- Do not translate the legacy application or historical documentation.
- Do not merge another branch or push.
- The V3 executable boundary must contain zero Unicode Han characters.

---

### Task 1: Add the English-only source gate

**Files:**
- Create: `tests/v3-english-only-source.test.ts`

**Interfaces:**
- Consumes: repository-relative V3 source paths.
- Produces: a Vitest gate that reports every file containing `/\p{Script=Han}/u`.

- [ ] **Step 1: Write the failing source scan**

```ts
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const roots = [
  'src/v3',
  'scripts/v3-content-source.json',
  'scripts/validate-v3-content.mjs',
  'tests',
]

const v3Test = /(?:^|\/)v3(?:-[^/]+)?\.(?:test|spec)\.ts$/
const sourceExtension = /\.(?:ts|tsx|mjs|json|css)$/

async function filesUnder(entry: string): Promise<string[]> {
  const absolute = path.resolve(entry)
  const stats = await import('node:fs/promises').then(({ stat }) => stat(absolute))
  if (stats.isFile()) return [entry]
  const children = await readdir(absolute, { withFileTypes: true })
  const nested = await Promise.all(children.map((child) => filesUnder(path.join(entry, child.name))))
  return nested.flat()
}

describe('V3 English-only source boundary', () => {
  it('contains no Han characters', async () => {
    const candidates = (await Promise.all(roots.map(filesUnder))).flat()
      .filter((file) => sourceExtension.test(file))
      .filter((file) => !file.startsWith('tests/') || v3Test.test(file))
    const offenders: string[] = []
    for (const file of candidates) {
      if (/\p{Script=Han}/u.test(await readFile(path.resolve(file), 'utf8'))) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run the gate and verify RED**

Run: `npx vitest run tests/v3-english-only-source.test.ts`

Expected: FAIL listing `scripts/v3-content-source.json`, remaining `src/v3` files, and V3 tests.

- [ ] **Step 3: Commit the failing gate**

```bash
git add tests/v3-english-only-source.test.ts
git commit -m "test: enforce english-only v3 source"
```

### Task 2: Translate authoritative V3 content

**Files:**
- Modify: `scripts/v3-content-source.json`
- Modify: `src/content/generated/v3/provenance.json` through the validator command
- Test: `tests/v3-content.test.ts`
- Test: `tests/v3-ui.test.ts`
- Test: `tests/v3-battle-analysis.test.ts`

**Interfaces:**
- Consumes: existing stable IDs and numeric tuning values.
- Produces: English names and descriptions consumed through `V3_CONTENT`.

- [ ] **Step 1: Replace authored display content without changing IDs**

Use these canonical names:

```text
AI Battle: Starbright Frontier
Astra Vanguard
Solar Lance, Bloom Guard, Gale Step, Prism Snare
Meteor Arc, Radiant Mend, Echo Bolt, Comet Break
Briar Sentinel, Sunforge Striker, Prism Adept, Eclipse Marshal
Starbright Meadow, Sunlit Circuit, Prism Gate
Briar Trial, Sunforge Trial, Prism Trial, Eclipse Gate
Briar Calibration Pack, Sunforge Thruster, Prism Simulation Shard, Stargate Command Seal
Balanced Constellation, Meteor Assault, Prism Control, Bloom Defense
```

Translate every associated `theme`, `title`, and `description` value to concise English. Keep `id`, `dropId`, versions, stats, coordinates, asset IDs, and tree JSON unchanged.

- [ ] **Step 2: Update content-dependent expectations**

Replace Chinese expected strings with the canonical English names above in `tests/v3-content.test.ts`, `tests/v3-ui.test.ts`, and `tests/v3-battle-analysis.test.ts`.

- [ ] **Step 3: Validate content and update fingerprint**

Run: `node scripts/validate-v3-content.mjs`

Expected: `V3 content graph valid: 0 errors` and a new content fingerprint written to `src/content/generated/v3/provenance.json`.

- [ ] **Step 4: Run content tests**

Run: `npx vitest run tests/v3-content.test.ts tests/v3-ui.test.ts tests/v3-battle-analysis.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit authoritative content translation**

```bash
git add scripts/v3-content-source.json src/content/generated/v3/provenance.json tests/v3-content.test.ts tests/v3-ui.test.ts tests/v3-battle-analysis.test.ts
git commit -m "feat: translate v3 authored content to english"
```

### Task 3: Complete runtime and UI translation

**Files:**
- Modify: `src/v3/presentation/V3PhaserStage.tsx`
- Modify: `src/v3/presentation/V3WorldScene.ts`
- Modify: `src/v3/presentation/playerText.ts`
- Modify: `src/v3/runtime/battleAnalysis.ts`
- Modify: `src/v3/runtime/battleEngine.ts`
- Modify: `src/v3/runtime/decisionDirector.ts`
- Modify: `src/v3/runtime/useV3Game.ts`
- Modify: `src/v3/ui/BattleReport.tsx`
- Modify: `src/v3/ui/ExploreHud.tsx`
- Modify: `src/v3/ui/PreparationPanel.tsx`
- Modify: `src/v3/ui/SpectatorConsole.tsx`
- Modify: `src/v3/ui/V3Controls.tsx`
- Modify: `src/v3/ui/V3Game.tsx`
- Test: `tests/v3-decision-director.test.ts`
- Test: `tests/v3-decision-route.test.ts`
- Test: `tests/v3-presentation.test.ts`

**Interfaces:**
- Consumes: English `V3_CONTENT` records from Task 2.
- Produces: English-only runtime messages, accessible labels, validation errors, AI evidence, and battle reports.

- [ ] **Step 1: Complete runtime translation**

Use English fallback messages consistently:

```text
Waiting for the next action
Waiting for both AIs to decide
Player skill slots must be unique.
Enemy skill slots must be unique.
Select a valid player behavior tree.
Select a valid enemy behavior tree.
Invalid LLM patch; using deterministic correction.
LLM timed out; using deterministic correction.
LLM request failed; using deterministic correction.
Online AI disabled; using deterministic local strategy.
```

Translate battle-engine event messages to the same English vocabulary used by `playerText.ts`.

- [ ] **Step 2: Complete UI and accessibility translation**

Preserve the current layout and component structure. Translate remaining labels in the Phaser stage, world action label, exploration HUD, preparation panel, spectator console, report, controls, and top-level V3 game shell.

- [ ] **Step 3: Update runtime and presentation test fixtures**

Replace Chinese fixture reasons and expected strings in:

```text
tests/v3-decision-director.test.ts
tests/v3-decision-route.test.ts
tests/v3-presentation.test.ts
```

- [ ] **Step 4: Run focused runtime tests**

Run: `npx vitest run tests/v3-decision-director.test.ts tests/v3-decision-route.test.ts tests/v3-presentation.test.ts tests/v3-ui.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit runtime and UI translation**

```bash
git add src/v3 tests/v3-decision-director.test.ts tests/v3-decision-route.test.ts tests/v3-presentation.test.ts tests/v3-ui.test.ts
git commit -m "feat: make v3 runtime and ui english only"
```

### Task 4: Translate browser scenarios and verify the boundary

**Files:**
- Modify: `tests/integration/v3.spec.ts`
- Modify: `tests/integration/v3-gamecraft.spec.ts`
- Modify: any remaining `tests/v3-*.test.ts` reported by the source gate
- Test: `tests/v3-english-only-source.test.ts`

**Interfaces:**
- Consumes: English accessible names and content from Tasks 2 and 3.
- Produces: English production-browser acceptance coverage and a zero-Han executable boundary.

- [ ] **Step 1: Translate Playwright selectors and assertions**

Use English names such as `Go to Briar Trial`, `Challenge Briar Trial`, `Start AI battle`, `Challenge cleared`, `Challenge failed`, `Keys to victory`, `Next adjustments`, `Expedition bonus`, `Deterministic replay`, and `Return to map`.

- [ ] **Step 2: Run the English-only gate and verify GREEN**

Run: `npx vitest run tests/v3-english-only-source.test.ts`

Expected: PASS with no offending files.

- [ ] **Step 3: Run complete verification**

```bash
node scripts/validate-v3-content.mjs
npm run typecheck
npm test
npm run build
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 npx playwright test tests/integration/v3.spec.ts tests/integration/v3-gamecraft.spec.ts --reporter=line
```

Expected: content validation 0 errors, TypeScript PASS, Vitest PASS, production build PASS, Playwright 7/7 PASS.

- [ ] **Step 4: Inspect browser screenshots**

Inspect the six images in `test-results/v3-gamecraft/` for blank canvas, overlap, clipping, and horizontal overflow.

- [ ] **Step 5: Commit browser acceptance updates**

```bash
git add tests/integration/v3.spec.ts tests/integration/v3-gamecraft.spec.ts tests/v3-english-only-source.test.ts tests/v3-*.test.ts src/content/generated/v3/provenance.json
git commit -m "test: verify english-only v3 experience"
```
