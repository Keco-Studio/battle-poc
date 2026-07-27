# Studio Import Reliability Implementation Plan

> **For agentic workers:** Execute inline in this session; do not dispatch subagents and do not commit.

**Goal:** Make the remote Keco Studio table import path lossless, explicit about invalid data, non-destructive, and effective in battle runtime.

**Architecture:** Keep the existing table/draft/module pipeline. Extend the shared skill draft codec and validation result with simulation fields and structured parse errors, make module application merge by ID, and route battle configuration reads through the existing registries.

**Tech Stack:** TypeScript, Next.js, Vitest, localStorage, Supabase Studio table adapter.

## Global Constraints

- Work only on branch `rebuild`.
- Do not create or modify remote Keco Studio tables in this change.
- Do not commit.
- Preserve unrelated user changes.

---

### Task 1: Lock down skill import contract

**Files:**
- Modify: `src/lib/skills/pocSkillFieldMapping.ts`
- Modify: `src/lib/skills/pocSkillDrafts.ts`
- Modify: `src/lib/skills/importPocSkillFromTable.ts`
- Test: `tests/poc-skill-import.test.ts`, `tests/poc-skill-drafts.test.ts`

- [x] Write failing tests for range preservation, simulation advanced fields, and malformed numeric rejection.
- [x] Run the focused tests and confirm failure is caused by dropped fields/default fallback.
- [x] Extend mapping keys, draft sanitization, and row codecs; return structured parse errors while preserving absent-field defaults.
- [x] Run focused skill tests and confirm green.

### Task 2: Make catalog Apply merge by ID

**Files:**
- Modify: `src/lib/skills/pocSkillModulesStorage.ts`
- Modify: `src/lib/jobs/pocJobModulesStorage.ts`
- Test: `tests/poc-skill-drafts.test.ts`, `tests/poc-job-import.test.ts`

- [x] Write failing tests showing a one-row Apply keeps unrelated active entries.
- [x] Run the tests and confirm the active module currently loses unrelated entries.
- [x] Implement deterministic ID merge with update reporting.
- [x] Run focused module/import tests.

### Task 3: Route imported game config through runtime registry

**Files:**
- Modify: `src/lib/gameConfig/gameConfigRegistry.ts`
- Modify: battle consumers that read imported formulas (starting with `app/constants.ts`, `app/hooks/useGameState.ts`, and `app/components/BattlePanel.tsx`)
- Test: `tests/poc-game-config-import.test.ts`

- [x] Add a failing runtime assertion for an imported enemy formula/reward value.
- [x] Run the test and confirm a consumer still reads a hard-coded constant.
- [x] Replace direct reads with registry-backed accessors while preserving defaults.
- [x] Run focused game-config and battle tests.

### Task 4: Reject stale source rows and isolate session state

**Files:**
- Modify: `src/lib/skills/refreshPocSkillDrafts.ts`, `src/lib/jobs/refreshPocJobDrafts.ts`, `src/lib/gameConfig/refreshPocGameConfigDrafts.ts`
- Modify: `src/lib/skills/pocSkillDrafts.ts`, `src/lib/jobs/pocJobDrafts.ts`, `src/lib/gameConfig/pocGameConfigDrafts.ts`, logout cleanup in `app/hooks/useGameState.ts`
- Test: new focused refresh/storage tests under `tests/`

- [x] Write failing tests for deleted rows and signed-out local-state cleanup.
- [x] Run tests and confirm stale values are currently retained.
- [x] Mark missing rows invalid, exclude them from Apply, and preserve the existing logout cleanup plus remote `user_id` query boundary.
- [x] Run focused refresh/storage tests.

### Task 5: Full verification

- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Inspect `git diff` and confirm no commit or remote mutation.

### Task 6: Fix runtime consistency regressions

**Files:**
- Modify: `src/battle-core/content/skills/basic-skill-catalog.ts`, `src/keco/kecoSkillBridge.ts`, `src/lib/skills/pocSkillModulesStorage.ts`
- Modify: `src/keco/resolveKecoCastSkill.ts`, `src/keco/entitySync.ts` if required by the runtime effect path
- Modify: `src/lib/jobs/pocJobFieldMapping.ts`, `src/lib/jobs/importPocJobFromTable.ts`
- Modify: `src/lib/gameConfig/pocGameConfigDrafts.ts`, `src/lib/gameConfig/refreshPocGameConfigDrafts.ts`
- Test: `tests/simulation-skill-sync.test.ts`, `tests/poc-skill-import.test.ts`, `tests/poc-job-import.test.ts`, `tests/poc-game-config-import.test.ts`, plus focused battle/Keco regression coverage

- [x] Write and run failing tests for one-time cooldown conversion, runtime DOT application, strict job parsing/duplicate IDs, and deleted game-config source rows.
- [x] Make runtime skill registration idempotent while preserving builtin catalog scaling.
- [x] Map supported imported effects into the existing Keco battle-engine execution path and verify a later turn resolves the effect.
- [x] Reject malformed supplied job fields and duplicate normalized IDs with row/field context.
- [x] Mark missing game-config source rows invalid and make validation block Apply.
- [x] Re-run focused tests, then the full verification commands above.

### Task 7: Enforce strict Studio source contracts

**Files:**
- Modify: `app/components/skills/ImportSkillByIdBlock.tsx`, `app/components/jobs/ImportJobByIdBlock.tsx`, `app/components/gameConfig/ImportGameConfigBlock.tsx`
- Modify: `src/lib/studio/validateStudioTableImport.ts`
- Modify: `src/lib/skills/importPocSkillFromTable.ts`, `src/lib/jobs/importPocJobFromTable.ts`, `src/lib/gameConfig/importPocGameConfig.ts`
- Test: focused import tests

- [x] Add failing tests for missing explicit ID columns, wrong-kind tables, and blank optional column bindings.
- [x] Gate every import UI with `validateStudioTableForImport` and remove asset-name ID fallback.
- [x] Persist recognized bindings even when current cells are empty.
- [x] Re-run focused tests.

### Task 8: Fail closed and preserve module lineage

**Files:**
- Modify: skill/job/game-config storage and module storage files
- Modify: `src/lib/skills/simulationSkillSync.ts`, `src/lib/skills/kecoSkillRegistry.ts`
- Test: focused draft and sync tests

- [x] Add failing tests for empty Apply, malformed simulation refresh, cleared Keco cache, and repeated Apply over a Studio base module.
- [x] Clear imported modules for every empty/invalid/unavailable source result.
- [x] Persist `baseModuleId` on draft modules and use it for subsequent merges.
- [x] Replace same-ID imported drafts and report updates instead of rejecting them.
- [x] Make cooldown export conditional on `cooldownUnit`.
- [x] Re-run focused tests.

### Task 9: Make game config drive actual gameplay

**Files:**
- Modify: `app/constants.ts`, `app/hooks/useGameState.ts`, active map battle consumers
- Modify: `src/battle-core/engine/command-processor.ts`
- Test: `tests/poc-game-config-import.test.ts`, runtime calculation tests

- [x] Add failing tests proving imported config changes equipment, progression, enemy stats, basic attack, and battle damage.
- [x] Route runtime reads through `gameConfigRegistry` accessors.
- [x] Re-run runtime and config tests.

### Task 10: Execute imported element and reaction data

**Files:**
- Modify: Keco bridge/resolver integration and map battle command path
- Modify: ordinary and simulation skill validators
- Test: `tests/simulation-skill-sync.test.ts`, `tests/poc-skill-drafts.test.ts`

- [x] Add failing map-command tests for element attachment and reaction execution.
- [x] Use the proven Keco battle engine for element/reaction resolution and synchronize results back to battle-core entities.
- [x] Accept valid element/reaction fields in ordinary Studio drafts; reject malformed values.
- [x] Re-run focused battle tests.

### Task 11: Close the second-pass authority and runtime gaps

**Files:**
- Modify: skill hydrate/simulation sync orchestration and provider fallbacks
- Modify: ordinary and simulation live refresh validation
- Modify: import row selection and enum parsers
- Modify: Keco map-battle turn/status integration
- Test: import state, Studio row import, simulation runtime, and provider fallback tests

- [x] Add failing tests for authenticated simulation hydrate and signed-out clearing.
- [x] Add failing tests for unbound drafts and duplicate IDs in the complete live source.
- [x] Add failing tests for strict skill/config enum validation.
- [x] Add a failing map-battle test for a combined element + DOT/control skill across real ticks.
- [x] Add failing tests for skill/config provider fallback helpers resetting global runtime state.
- [x] Add failing tests for job provider fallback, Studio table load failures, normalized collisions introduced after draft creation, and Keco preparation/final-result boundaries.
- [x] Implement each fix independently and run its focused test after every red-green cycle.
- [x] Re-run the full verification suite and audit all six reported paths from source read to runtime behavior.
