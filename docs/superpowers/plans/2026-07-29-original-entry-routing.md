# Original Entry Routing Implementation Plan

> **For agentic workers:** Execute this plan inline. The user explicitly requested speed over TDD for this change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original map game at `/` and preserve EMBER//NULL at `/ember-null`.

**Architecture:** Reassign the two existing React experiences at the Next.js App Router boundary. No game systems, providers, data sources, or backend integrations change.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest

## Global Constraints

- Work only on `feature/restore-original-entry`; do not modify `main`.
- Preserve the existing Supabase disconnection.
- Preserve both game implementations and their assets.
- Do not use TDD for this routing-only change.

---

### Task 1: Restore the original root entry

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `useGameState()` and the existing map/panel components.
- Produces: The original map-based interface at `/`.

- [x] Replace the EMBER//NULL root page with the historical map page composition.
- [x] Restore general Battle Demo metadata in the root layout.

### Task 2: Preserve EMBER//NULL as a separate route

**Files:**
- Create: `app/ember-null/page.tsx`

**Interfaces:**
- Consumes: `EmberNullGame` from `app/components/ember-null/EmberNullGame.tsx`.
- Produces: The EMBER//NULL experience at `/ember-null` with route-specific metadata.

- [x] Add the App Router page and render the existing game component unchanged.

### Task 3: Verify both routes and isolation

**Files:**
- No source files modified.

**Interfaces:**
- Consumes: The completed routing changes.
- Produces: Evidence that existing behavior compiles, tests, builds, and renders.

- [x] Run `npm run typecheck` and expect exit code `0`.
- [x] Run `npm test` and expect the existing suite to pass.
- [x] Run `npm run build` and expect both `/` and `/ember-null` in the route output.
- [x] Start the application and verify both routes return successful HTML responses.
- [x] Confirm `BattleRuntimeProviders` still leaves Supabase wiring commented out.
