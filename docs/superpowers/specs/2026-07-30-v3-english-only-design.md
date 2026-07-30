# V3 English-Only Source Design

Date: 2026-07-30
Branch: `v3`

## Goal

Remove Chinese text from the V3 executable surface while preserving gameplay behavior, stable content IDs, asset paths, deterministic battle results, and legacy compatibility.

## Scope

The English-only boundary includes:

- `src/v3/**`
- `scripts/v3-content-source.json`
- V3 content validation scripts
- `tests/v3-*.test.ts`
- `tests/integration/v3*.spec.ts`

Historical documentation, evaluation reports, the daily report, and the legacy application are outside this change. They are not part of the V3 executable surface and may retain Chinese text.

## Content Strategy

All player-visible V3 content will use English:

- game, job, skill, enemy, map, encounter, reward, progression, and behavior-tree names
- descriptions and objective text
- navigation, preparation, spectator, report, and accessibility labels
- battle event messages, validation errors, AI fallback reasons, and analysis text

Stable identifiers remain unchanged. For example, `solar_lance`, `briar_trial`, and `tree_balanced` continue to identify the same records. This avoids save migration, replay, asset, and behavior-tree compatibility risk.

## Existing Worktree Changes

The worktree already contains partial English conversions in V3 presentation and UI files. Those edits will be preserved, reviewed, and completed. They will not be reverted or replaced wholesale.

## Enforcement

A source-level regression test will scan the V3 executable boundary for Unicode Han characters. The test will fail with the exact offending file paths, preventing future Chinese strings from re-entering the V3 code path.

Functional tests will be updated to assert English player-facing behavior rather than internal implementation details.

## Verification

Completion requires:

- zero Han-character matches in the V3 executable boundary
- V3 content validation passes
- TypeScript passes
- the full Vitest suite passes
- the production build passes
- V3 and GameCraft Playwright scenarios pass against the production build
- V3 screenshots render without blank canvas, overlap, or horizontal overflow

## Non-Goals

- translating legacy UI
- renaming stable IDs or asset directories
- adding runtime locale switching
- rewriting historical reports or source provenance descriptions that are not consumed by V3 runtime
