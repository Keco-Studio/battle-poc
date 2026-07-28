# VS01 Ember Relay Baseline

Date: 2026-07-28

## Result

Build gate: **PASS**

Weighted GameCraft-Bench baseline: **85.0 / 100**

| Dimension | Weight | Raw score | Weighted score | Evidence |
| --- | ---: | ---: | ---: | --- |
| Mechanics | 15% | 84 | 12.6 | 319 unit/integration assertions pass; a browser battle reaches MiniMax-M2.1 with `dual_llm` and runtime `available`; online behavior-tree evaluation reaches 0.834 aggregate hard-pass. |
| Content depth | 35% | 88 | 30.8 | One job, eight skills, three standard enemies, one boss, two maps, four encounters, and a local unlock/completion arc are compiled into the runtime. |
| Functional visuals | 15% | 86 | 12.9 | All 15 generated assets return HTTP 200; desktop and mobile canvases contain nonblank multi-color output; target labels, authored levels, objective text, and locked/unlocked map states are exercised in Playwright. |
| Art and presentation | 35% | 82 | 28.7 | Causeway and Core use a consistent basalt/teal/ember language, enemy silhouettes are distinct, and the boss arena reads immediately. Some inherited HUD styling and mixed sprite treatments remain visibly separate from the VS01 art direction. |

## Evidence

### Content compilation

The complete MCP readback validated these row counts before TypeScript compilation:

| Domain | Rows |
| --- | ---: |
| Game | 1 |
| Jobs | 1 |
| Skills | 8 |
| Enemies | 4 |
| Maps | 2 |
| Encounters | 4 |
| Progression | 2 |
| Assets | 15 |
| Rubric | 5 |

Validation found no duplicate stable IDs, wrong content versions, or dangling references. Runtime data is served from [`src/content/generated/vs01`](../../src/content/generated/vs01), not Keco or a database.

### MiniMax-M2.1

The local proxy health check reported MiniMax as the provider and `MiniMax-M2.1` as the configured model. The browser acceptance test observed both `/health` and `/api/ai/battle-decision`, then rendered `Decision Mode: dual_llm` and `LLM Runtime: available` in the battle HUD.

The three-run online behavior-tree baseline produced:

| Suite | Hard-pass rate |
| --- | ---: |
| Initial tree | 1.000 |
| Pressure patch | 0.667 |
| Aggregate | 0.834 |

The pressure-patch result is the main mechanics deduction: response format, schema, runtime application, and inventory checks all passed, but effective tactical correction passed two of three runs.

### Browser acceptance

[`tests/integration/vs01-evaluation.spec.ts`](../../tests/integration/vs01-evaluation.spec.ts) verifies:

- default Causeway map and authored enemy IDs, skill loadouts, stats, and levels;
- 15 local PixelLab assets with HTTP 200 responses;
- a painted Canvas rather than a blank render;
- Core locked before three victories and available after persisted local progression;
- a live MiniMax decision request from battle;
- zero external runtime requests beyond the local Web app and local AI proxy, including zero Keco, PixelLab, or Supabase traffic;
- no page exceptions;
- no overlap among the five mobile top panels.

Visual evidence:

- [Desktop Causeway](../../test-results/vs01-evaluation/desktop-causeway.png)
- [Desktop battle](../../test-results/vs01-evaluation/desktop-battle.png)
- [Desktop Core](../../test-results/vs01-evaluation/desktop-core.png)
- [Mobile Causeway](../../test-results/vs01-evaluation/mobile-causeway.png)

## Verification

```text
npm run typecheck
  PASS

npm test
  Test Files  65 passed | 1 skipped (66)
  Tests       319 passed | 5 skipped (324)

npm run build
  PASS (one pre-existing exhaustive-deps warning in unused useMapBattleLoop.ts)

npm run eval:bt-online
  PASS, aggregate hardPassRate=0.834

npx playwright test tests/integration/vs01-evaluation.spec.ts
  2 passed
```

## Next Baseline Targets

1. Raise behavior-tree pressure-patch effectiveness from 0.667 to at least 0.900 without changing the LLM decision contract.
2. Unify the inherited player card and battle HUD with the VS01 industrial-fantasy presentation.
3. Add deterministic visual evidence that captures each generated skill effect during combat.
4. Validate a complete start-to-boss playthrough duration and difficulty curve, not only the individual progression states.
