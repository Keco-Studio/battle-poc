# Technical Debt Baseline

Last updated: 2026-04-30

## Quality Gates

- `npm run lint`: passing (no warnings)
- `npm run typecheck`: passing
- `npm test`: passing (`26` files, `93` tests)

## Current Debt Snapshot

### 1) Oversized TypeScript files (>= 800 lines)

- `app/components/GameMap.tsx` (`1497`)
- `src/battle-core/engine/command-processor.ts` (`1121`)
- `app/hooks/useGameState.ts` (`1087`)
- `app/components/DockFeatureModal.tsx` (`820`)

### 2) Type erosion markers

- `as any` / `: any`: `23` occurrences across `11` files
- `eslint-disable-next-line react-hooks/exhaustive-deps`: `2` occurrences across `2` files

### 3) Lint warnings (from current baseline run)

- None

## Immediate Repayment Queue (P0)

1. Keep `lint`, `typecheck`, `test` in CI on every PR.
2. Continue `GameMap` decomposition until under `900` lines.
3. Eliminate newly introduced `any` and hook dependency disables (no new debt policy).
4. Continue reducing oversized files and type erosion markers.
