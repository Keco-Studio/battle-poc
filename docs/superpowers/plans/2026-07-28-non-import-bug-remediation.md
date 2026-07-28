# Battle POC Non-Import Bug Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the confirmed non-import save, authorization, map, PVP, and history defects, and replace shared filesystem map mutation with account-private Supabase maps and assets.

**Architecture:** Add account-scoped map/storage schema and a restricted PVP RPC first, then move save ordering, map selection, and battle classification into pure modules with explicit contracts. React hooks and route handlers become thin adapters around those modules, allowing deterministic unit tests before live Supabase and browser verification.

**Tech Stack:** Next.js 15 route handlers, React 19, TypeScript, Supabase Auth/Postgres/Storage, Vitest, Playwright.

## Global Constraints

- Work only on branch `rebuild` in the existing workspace.
- Do not use subagents.
- Do not commit or push.
- Do not change the verified Keco Studio import data model or sentinel data.
- Built-in maps remain read-only; user maps and assets are private and cloud-persisted.
- Every authenticated user may call PixelLab map generation; anonymous users may not.
- Production routes must not write to the deployment filesystem.
- Every production behavior change starts with a failing regression test and an observed RED result.
- Run live migrations only after local unit tests, typecheck, and production build pass.

---

## File Structure

### New Files

- `supabase/migrations/20260728000001_private_maps_ordered_saves_and_pvp_projection.sql`: additive save columns, private maps, Storage policies, and restricted PVP RPC.
- `src/lib/auth/require-server-user.ts`: reusable route-handler authentication based on `auth.getUser()`.
- `src/lib/db/cloud-save-coordinator.ts`: serialized, coalescing, revision-aware save queue.
- `src/lib/maps/map-reference.ts`: canonical map-reference parsing and default reference.
- `src/lib/maps/map-project.ts`: project-like JSON validation and public response conversion.
- `src/lib/maps/server-user-maps.ts`: account-scoped database and Storage operations.
- `src/lib/maps/saved-map-position.ts`: deterministic saved-position versus spawn resolution.
- `src/lib/battle/active-battle-session.ts`: PVE/PVP discriminated union and history metadata helpers.
- `tests/cloud-save-coordinator.test.ts`: ordering, coalescing, generation cancellation, and conflict tests.
- `tests/map-reference.test.ts`: parsing and default-reference tests.
- `tests/saved-map-position.test.ts`: hydration position precedence tests.
- `tests/active-battle-session.test.ts`: history, respawn, coordinate ownership, and rounds tests.
- `tests/server-route-auth.test.ts`: route authentication helper tests.
- `tests/user-map-project.test.ts`: map payload validation tests.
- `app/api/maps/[id]/route.ts`: private map update/delete endpoint.
- `docs/verification/2026-07-28-non-import-bug-remediation.md`: retained live verification evidence.

### Modified Files

- `src/lib/db/types.ts`: new save, map, and RPC types.
- `src/lib/db/player-saves.ts`: conditional revision write API.
- `src/lib/db/index.ts`: exports.
- `app/hooks/useGameState.ts`: hydration state machine, coordinator integration, current map ownership, and explicit battle session.
- `app/components/GameMap.tsx`: catalog references, position restoration, private-map editing, PVP transient coordinates, and final-tick settlement.
- `app/components/DockFeatureModal.tsx`: restricted PVP RPC and combat snapshot mapping.
- `app/components/map-ui/utils/resolveMapBattleOutcome.ts`: PVE-only respawn and explicit final rounds.
- `app/components/map-ui/utils/finalizeMapBattleTick.ts`: pass session kind and final tick.
- `app/components/map-ui/utils/applyMapBattleStepState.ts`: avoid persistent world-coordinate writes during PVP.
- `app/api/maps/route.ts`: combined built-in/private catalog and private-map creation.
- `app/api/airpg-map/route.ts`: built-in or owner-scoped private loading.
- `app/api/maps/update-collision/route.ts`: compatibility wrapper that rejects built-ins and delegates private updates.
- `app/api/pixellab/create-map/route.ts`: authenticated PixelLab to private Storage/database flow.
- `app/api/pixellab-sync/route.ts`: development-only plus authentication.
- `app/api/agent-chat/route.ts`: authenticate every POST mode.
- `app/components/map-ui/PixellabMapGeneratorModal.tsx`: private map response and signed preview copy.
- `app/components/map-ui/CollisionEditorModal.tsx`: private-map-only PATCH contract.
- `app/components/map-ui/gameMapUtils.ts`: canonical built-in map reference helpers.
- `tests/integration/auth.spec.ts`, `tests/integration/battle.spec.ts`, `tests/integration/edge.spec.ts`: browser regressions.

---

### Task 1: Database Contract And Type Surface

**Files:**
- Create: `supabase/migrations/20260728000001_private_maps_ordered_saves_and_pvp_projection.sql`
- Modify: `src/lib/db/types.ts`
- Test: `tests/database-contract.test.ts`

**Interfaces:**
- Produces: `UserMapRow`, expanded `PlayerSaveRow`, `PvpOpponentRow`, typed `list_pvp_opponents` RPC.
- Produces: private bucket ID `battle-user-map-assets` and canonical map default.

- [ ] **Step 1: Write the failing schema-contract test**

Create a test that reads the migration text and asserts all security-critical clauses, including removal of the broad policy:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260728000001_private_maps_ordered_saves_and_pvp_projection.sql', 'utf8')

describe('private map and ordered save migration', () => {
  it('adds ordered saves, owner-only maps, private assets, and restricted PVP projection', () => {
    expect(sql).toContain('save_revision bigint not null default 0')
    expect(sql).toContain('current_map_ref text not null')
    expect(sql).toContain('create table public.user_maps')
    expect(sql).toContain("'battle-user-map-assets'")
    expect(sql).toContain('drop policy if exists player_saves_select_authenticated_pvp')
    expect(sql).toContain('function public.list_pvp_opponents')
    expect(sql).toContain('revoke all on function public.list_pvp_opponents(integer) from public')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --run tests/database-contract.test.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the migration and exact TypeScript rows**

The migration must:

```sql
alter table public.player_saves
  add column if not exists current_map_ref text not null default 'builtin:top-down-pixel-art-rpg-battle-arena-map-wide-ope-1777006352683',
  add column if not exists save_revision bigint not null default 0,
  add column if not exists combat_max_hp integer,
  add column if not exists combat_atk numeric,
  add column if not exists combat_def numeric,
  add column if not exists combat_spd numeric;

create table public.user_maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  map_data jsonb not null,
  background_object_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, name)
);

alter table public.user_maps enable row level security;
```

Add four owner-only policies, the private bucket and path policies, drop the broad player-save policy, and define `list_pvp_opponents(integer)` with fixed `search_path`, caller exclusion, a `1..100` cap, and only the nine spec fields. Grant it only to `authenticated`.

Add these TypeScript surfaces:

```ts
export interface UserMapRow {
  id: string
  owner_id: string
  name: string
  map_data: Json
  background_object_path: string | null
  created_at: string
  updated_at: string
}

export interface PvpOpponentRow {
  user_id: string
  character_name: string
  level: number
  job_class_id: string | null
  combat_max_hp: number | null
  combat_atk: number | null
  combat_def: number | null
  combat_spd: number | null
  carried_skill_ids: string[]
}
```

- [ ] **Step 4: Run contract test and typecheck**

Run: `npm test -- --run tests/database-contract.test.ts && npm run typecheck`

Expected: PASS and typecheck exit 0.

---

### Task 2: Pure Save Coordinator

**Files:**
- Create: `src/lib/db/cloud-save-coordinator.ts`
- Create: `tests/cloud-save-coordinator.test.ts`
- Modify: `src/lib/db/player-saves.ts`
- Modify: `src/lib/db/index.ts`

**Interfaces:**
- Produces: `CloudSaveCoordinator<T>`, `CloudSaveWriteResult`, and `savePlayerSaveAtRevision(update, expectedRevision)`.
- Consumes: immutable complete save snapshots from `useGameState`.

- [ ] **Step 1: Write failing coordinator tests**

Tests use deferred promises to prove observable ordering rather than mock call counts:

```ts
const writes: Array<{ value: number; expected: number }> = []
const first = deferred<{ applied: true; revision: number }>()
const coordinator = new CloudSaveCoordinator<{ value: number }>({
  write: async (snapshot, expected) => {
    writes.push({ ...snapshot, expected })
    if (writes.length === 1) return first.promise
    return { applied: true, revision: expected + 1 }
  },
  quietMs: 0,
})

coordinator.start({ userId: 'u1', generation: 1, revision: 7 })
coordinator.enqueue({ value: 1 })
coordinator.enqueue({ value: 2 })
coordinator.enqueue({ value: 3 })
expect(writes).toEqual([{ value: 1, expected: 7 }])
first.resolve({ applied: true, revision: 8 })
await coordinator.whenIdle()
expect(writes).toEqual([{ value: 1, expected: 7 }, { value: 3, expected: 8 }])
```

Add separate cases for generation cancellation, revision conflict suspension, and no writes before `start`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/cloud-save-coordinator.test.ts`

Expected: FAIL because the coordinator module does not exist.

- [ ] **Step 3: Implement the minimal coordinator**

Use this public contract:

```ts
export type CloudSaveWriteResult =
  | { applied: true; revision: number }
  | { applied: false; reason: 'conflict' }

export class CloudSaveCoordinator<T> {
  constructor(options: {
    write: (snapshot: Readonly<T>, expectedRevision: number, userId: string) => Promise<CloudSaveWriteResult>
    quietMs: number
    onConflict?: () => void
    onError?: (error: unknown) => void
  })
  start(input: { userId: string; generation: number; revision: number }): void
  enqueue(snapshot: Readonly<T>): void
  cancel(): void
  flush(): Promise<void>
  whenIdle(): Promise<void>
  isReadyFor(userId: string, generation: number): boolean
}
```

`savePlayerSaveAtRevision` must use `.update({ ...update, save_revision: expectedRevision + 1 }).eq('user_id', userId).eq('save_revision', expectedRevision).select('save_revision').maybeSingle()` and return conflict for no row.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/cloud-save-coordinator.test.ts && npm run typecheck`

Expected: all coordinator cases pass and typecheck exits 0.

---

### Task 3: Auth Hydration And Ordered Auto-Save Integration

**Files:**
- Create: `src/lib/auth/game-save-hydration.ts`
- Create: `tests/game-save-hydration.test.ts`
- Modify: `app/hooks/useGameState.ts`

**Interfaces:**
- Produces: `GameSaveHydrationGuard` with generation checks.
- Consumes: `CloudSaveCoordinator<PlayerSaveUpdate>` from Task 2.

- [ ] **Step 1: Write failing hydration tests**

Prove that a sign-in generation is not save-ready before cloud apply, and that an older response is rejected:

```ts
const guard = new GameSaveHydrationGuard()
const first = guard.begin('user-a')
expect(guard.canSave('user-a')).toBe(false)
const second = guard.begin('user-b')
expect(guard.complete(first)).toBe(false)
expect(guard.complete(second)).toBe(true)
expect(guard.canSave('user-b')).toBe(true)
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/game-save-hydration.test.ts`

Expected: FAIL because the guard module is missing.

- [ ] **Step 3: Implement guard and integrate the hook**

The hook must replace `dbHydrated` as a boolean write gate with explicit phase/generation refs. In both initial session and `SIGNED_IN` paths, cancel the previous save lifecycle before beginning the next hydration:

```ts
saveCoordinatorRef.current.cancel()
const token = hydrationGuardRef.current.begin(user.id)
applySessionUser(user)
const [save, logs] = await Promise.all([loadPlayerSave(), fetchBattleHistory(50)])
if (!hydrationGuardRef.current.isCurrent(token)) return
if (save) applyDbSave(save)
setBattleLogs(mapBattleHistoryRows(logs))
setPendingHydrationCommit({ token, revision: save?.save_revision ?? 0 })
```

Start the coordinator from a React effect that runs after the hydrated state commit:

```ts
useEffect(() => {
  if (!pendingHydrationCommit) return
  const { token, revision } = pendingHydrationCommit
  if (!hydrationGuardRef.current.complete(token)) return
  saveCoordinatorRef.current.start({ userId: token.userId, generation: token.generation, revision })
  setPendingHydrationCommit(null)
}, [pendingHydrationCommit])
```

Auto-save continues writing LocalStorage immediately, but only enqueues cloud snapshots when guard and coordinator both match the current user/generation. Sign-out cancels the generation and queue before resetting state.

- [ ] **Step 4: Verify GREEN and existing auth tests**

Run: `npm test -- --run tests/game-save-hydration.test.ts tests/supabase-auth-flow.test.ts tests/google-oauth-login.test.ts`

Expected: all tests pass.

---

### Task 4: Map References, Validation, And Position Resolution

**Files:**
- Create: `src/lib/maps/map-reference.ts`
- Create: `src/lib/maps/map-project.ts`
- Create: `src/lib/maps/saved-map-position.ts`
- Create: `tests/map-reference.test.ts`
- Create: `tests/user-map-project.test.ts`
- Create: `tests/saved-map-position.test.ts`
- Modify: `app/components/map-ui/gameMapUtils.ts`

**Interfaces:**
- Produces: `DEFAULT_BUILTIN_MAP_REF`, `parseMapRef`, `validateMapProject`, `resolveInitialMapPosition`.

- [ ] **Step 1: Write failing pure tests**

Cover valid built-in/user refs, path traversal rejection, malformed JSON, collision length, and position precedence:

```ts
expect(parseMapRef('builtin:demo-project')).toEqual({ source: 'builtin', id: 'demo-project' })
expect(parseMapRef('builtin:../secret')).toBeNull()
expect(parseMapRef(`user:${crypto.randomUUID()}`)?.source).toBe('user')
expect(resolveInitialMapPosition({
  selectedRef: 'builtin:a', savedRef: 'builtin:a', savedPosition: { x: 4, y: 5 },
  spawn: { x: 1, y: 1 }, isWalkable: () => true,
})).toEqual({ x: 4, y: 5 })
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/map-reference.test.ts tests/user-map-project.test.ts tests/saved-map-position.test.ts`

Expected: FAIL because the map modules are missing.

- [ ] **Step 3: Implement pure map contracts**

`parseMapRef` accepts built-in IDs matching `/^[a-z0-9][a-z0-9-]{0,127}$/` and canonical UUID user IDs. `validateMapProject` returns a discriminated `{ ok: true; value } | { ok: false; error }`, requires dimensions `1..128`, exact ground/collision lengths, finite spawn/entity coordinates, and JSON-serializable input no larger than 1 MiB. `resolveInitialMapPosition` keeps a same-map valid saved position and otherwise uses the nearest walkable spawn.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/map-reference.test.ts tests/user-map-project.test.ts tests/saved-map-position.test.ts`

Expected: all pure map tests pass.

---

### Task 5: Server Authentication And Private Map APIs

**Files:**
- Create: `src/lib/auth/require-server-user.ts`
- Create: `src/lib/maps/server-user-maps.ts`
- Create: `tests/server-route-auth.test.ts`
- Modify: `app/api/maps/route.ts`
- Modify: `app/api/airpg-map/route.ts`
- Create: `app/api/maps/[id]/route.ts`
- Modify: `app/api/maps/update-collision/route.ts`

**Interfaces:**
- Produces: authenticated user or a typed `401` response.
- Produces: combined `MapCatalogItem[]`, owner-scoped map CRUD, signed background URLs.
- Consumes: Task 1 schema and Task 4 validation.

- [ ] **Step 1: Write failing authentication-helper tests**

```ts
expect(await requireServerUser({
  auth: { getUser: async () => ({ data: { user: null }, error: null }) },
} as never)).toMatchObject({ ok: false, status: 401 })

expect(await requireServerUser({
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
} as never)).toMatchObject({ ok: true, user: { id: 'u1' } })
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/server-route-auth.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement helper and route contracts**

`GET /api/maps` always lists built-ins, then calls `getUser()` and adds only matching `user_maps` when authenticated. `GET /api/airpg-map` parses the map ref; user refs require auth and `.eq('id', id).eq('owner_id', user.id).maybeSingle()`. `POST /api/maps`, `PATCH /api/maps/[id]`, and `DELETE /api/maps/[id]` require auth, derive owner from the user, validate map data, and return `404` for absent/foreign IDs. The old collision route becomes a compatibility adapter that accepts only a `user:<uuid>` reference.

- [ ] **Step 4: Verify routes compile and tests pass**

Run: `npm test -- --run tests/server-route-auth.test.ts tests/user-map-project.test.ts && npm run typecheck`

Expected: PASS and no TypeScript errors.

---

### Task 6: PixelLab And Chat Authorization

**Files:**
- Modify: `app/api/pixellab/create-map/route.ts`
- Modify: `app/api/pixellab-sync/route.ts`
- Modify: `app/api/agent-chat/route.ts`
- Modify: `app/components/map-ui/PixellabMapGeneratorModal.tsx`
- Modify: `app/components/map-ui/hooks/usePixellabSync.ts`
- Test: `tests/server-route-auth.test.ts`

**Interfaces:**
- PixelLab response: `{ ok: true; mapRef: `user:${string}`; previewUrl: string; imageSize }`.
- Anonymous POST response: `401` before any paid/external call.

- [ ] **Step 1: Extend the failing auth tests**

Add exported request-preflight helpers and assert that anonymous PixelLab, sync, and chat requests return `401`, while sync in production returns `404` without filesystem access.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/server-route-auth.test.ts`

Expected: FAIL because current routes do not enforce the shared preflight.

- [ ] **Step 3: Implement authenticated cloud generation**

Authenticate before reading `PIXELLAB_API_TOKEN` or calling `fetch`. Validate input, call PixelLab, decode and size-check PNG, insert the owner map, upload to `battle-user-map-assets/<user>/<map>/background.png`, update `background_object_path`, create a signed URL, and clean up partial state on failure. Remove `writeFile`/`mkdir` production behavior and update UI copy so it says the result is saved to the current account.

Require auth before every agent-chat POST mode. Keep GET health read-only. Make `/api/pixellab-sync` return `404` unless `NODE_ENV === 'development'`, then require auth before copying local files.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/server-route-auth.test.ts && npm run typecheck`

Expected: auth tests and typecheck pass.

---

### Task 7: Map UI Hydration And Private Editing

**Files:**
- Modify: `app/hooks/useGameState.ts`
- Modify: `app/components/GameMap.tsx`
- Modify: `app/components/map-ui/CollisionEditorModal.tsx`
- Modify: `app/components/map-ui/PixellabMapGeneratorModal.tsx`
- Modify: `tests/integration/battle.spec.ts`
- Modify: `tests/integration/edge.spec.ts`

**Interfaces:**
- `GameState.currentMapRef`, `GameState.setCurrentMapRef`.
- Catalog select values are complete map refs.
- Collision editor is enabled only for `user:` refs; built-ins are copied before editing.

- [ ] **Step 1: Add failing browser assertions**

The test seeds `battle-game-save` with the canonical map ref and a non-spawn walkable coordinate, reloads, waits for the map request to finish, and compares the actual player marker/grid state rather than only LocalStorage. Add a guest assertion that map generation returns/signals authentication required.

- [ ] **Step 2: Run targeted Playwright and verify RED**

Run: `npx playwright test tests/integration/battle.spec.ts tests/integration/edge.spec.ts`

Expected: saved-position test fails because map load applies spawn.

- [ ] **Step 3: Integrate map refs and position resolution**

Persist `currentMapRef` in local/cloud snapshots. Initialize the selected map from hydrated game state. After map JSON loads, call `resolveInitialMapPosition` and apply spawn only for a changed map or invalid position. Catalog refresh preserves a still-existing selected ref. Private collision PATCH updates cloud JSON; built-in edit first calls `POST /api/maps` to create a private copy. PixelLab success selects the returned private ref.

- [ ] **Step 4: Verify GREEN**

Run targeted Vitest map tests, Playwright battle/edge specs, and typecheck.

Expected: actual marker position survives completed map load and refresh.

---

### Task 8: Restricted PVP Snapshot Loading

**Files:**
- Modify: `app/hooks/useGameState.ts`
- Modify: `app/components/DockFeatureModal.tsx`
- Create: `src/lib/battle/pvp-opponent.ts`
- Create: `tests/pvp-opponent.test.ts`

**Interfaces:**
- `PVPUser` includes `jobClassId`, `stats`, and carried skills; it excludes complete save fields.
- Consumes: `list_pvp_opponents` RPC.

- [ ] **Step 1: Write failing snapshot tests**

```ts
expect(resolvePvpOpponentStats({
  level: 12,
  jobClassId: 'mage',
  combatSnapshot: { maxHp: 900, atk: 44, def: 12, spd: 20 },
})).toEqual({ maxHp: 900, atk: 44, def: 12, spd: 20 })

expect(resolvePvpOpponentStats({
  level: 12,
  jobClassId: 'mage',
  combatSnapshot: null,
})).toEqual(calcPlayerStats(12, 'mage'))
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/pvp-opponent.test.ts`

Expected: FAIL because the resolver is missing and the current path hardcodes hero.

- [ ] **Step 3: Implement RPC mapping**

Replace `.from('player_saves').select(...)` with `.rpc('list_pvp_opponents', { p_limit: 100 })`. Validate numeric snapshot fields; use the job fallback only for invalid/null snapshots and trace the fallback. PVP list stats and battle stats use the same resolved object.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/pvp-opponent.test.ts && npm run typecheck`

Expected: mage snapshot remains mage-aware and no `select` of the broad table remains in the PVP list.

---

### Task 9: Explicit Battle Session, PVP Isolation, And Real Rounds

**Files:**
- Create: `src/lib/battle/active-battle-session.ts`
- Create: `tests/active-battle-session.test.ts`
- Modify: `app/hooks/useGameState.ts`
- Modify: `app/components/GameMap.tsx`
- Modify: `app/components/map-ui/utils/resolveMapBattleOutcome.ts`
- Modify: `app/components/map-ui/utils/finalizeMapBattleTick.ts`
- Modify: `app/components/map-ui/utils/applyMapBattleStepState.ts`

**Interfaces:**
- Produces: `ActiveBattleSession`, `historyMetadataForSession`, `shouldRespawnWorldEnemy`, `historyRoundsFromFinalTick`.
- Settlement signatures accept explicit `rounds`.

- [ ] **Step 1: Write failing battle-session tests**

```ts
expect(historyMetadataForSession(pvpSession)).toEqual({ battleType: 'pvp', opponentName: 'Mage B' })
expect(historyMetadataForSession(pveSession)).toEqual({ battleType: 'pve', opponentName: 'Slime' })
expect(shouldRespawnWorldEnemy(pvpSession, 'win')).toBe(false)
expect(shouldRespawnWorldEnemy(pveSession, 'win')).toBe(true)
expect(historyRoundsFromFinalTick(17)).toBe(17)
expect(historyRoundsFromFinalTick(0)).toBe(1)
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/active-battle-session.test.ts`

Expected: FAIL because battle classification currently depends on stale React state.

- [ ] **Step 3: Implement explicit ownership**

Replace `pvpOpponentName` and independent opponent skill state with one `activeBattleSession`. `startBattle` replaces it with PVE; `startPVPBattle` replaces it with PVP; close/flee/sign-out clear it. Settlement derives history from the session passed to it. `resolveMapBattleOutcome` receives the battle kind and sets `pendingRespawnEnemyIdRef` only for PVE victory.

During PVP, keep controller positions in dedicated transient render state and skip `setPlayerPos` plus persistent `setEnemyPositions`. Pass `Math.max(1, s.tick)` synchronously into victory/defeat settlement and database history.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/active-battle-session.test.ts tests/map-battle-controller.test.ts && npm run typecheck`

Expected: unit tests pass and no stale `pvpOpponentName` references remain.

---

### Task 10: Full Local Regression Gate

**Files:**
- Modify only files required by observed failures.

- [ ] **Step 1: Run all unit tests**

Run: `npm test -- --run`

Expected: every test file and test passes; record exact counts.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: exit 0. Investigate warnings that point to modified files; do not dismiss stale-closure warnings without checking state ownership.

- [ ] **Step 4: Run complete Playwright suite**

Run: `npx playwright test`

Expected: all integration specs pass with no unexpected console errors or HTTP 4xx/5xx.

- [ ] **Step 5: Re-run Keco import acceptance**

Run the existing live acceptance command documented in `docs/superpowers/plans/2026-07-27-keco-live-import-acceptance.md`, preserving sentinel values `mcp_chain_flame.power = 2.57` and `exp_per_level.value = 163`.

Expected: the import flow remains green and sentinel readback is unchanged.

---

### Task 11: Apply Remote Migration And Verify Real Account Isolation

**Files:**
- Create: `docs/verification/2026-07-28-non-import-bug-remediation.md`

- [ ] **Step 1: Confirm the target Supabase project**

Read the configured URL host without printing keys or tokens. Compare it with the already verified battle-poc production project. Stop if the project reference differs.

- [ ] **Step 2: Apply the new migration**

Use the existing approved Supabase CLI/project-link flow to push only pending migrations.

Expected: remote migration history includes `20260728000001` once.

- [ ] **Step 3: Verify two-account RLS**

Using two authenticated test sessions, create one private map as account A. Assert account B's catalog excludes it, direct row select returns no row, map load returns `404`, update affects zero rows, and Storage access fails. Re-authenticate as A and verify the map remains readable.

- [ ] **Step 4: Verify ordered real save**

Record the account's starting `save_revision`, perform rapid movement and a multi-tick battle through the UI, wait for coordinator idle, reload, and query the row. Assert revision increased monotonically and the newest position/progress survived.

- [ ] **Step 5: Verify PVP projection privacy**

Call `list_pvp_opponents`; confirm self is absent and keys equal the nine-field allowlist. Attempt direct `select *` for another user's ID and confirm no row is returned.

---

### Task 12: Real PixelLab, PVP/PVE, And Evidence Retention

**Files:**
- Modify: `docs/verification/2026-07-28-non-import-bug-remediation.md`
- Create screenshot under: `test-results/non-import-live-verification/`

- [ ] **Step 1: Run one real PixelLab generation**

As the configured authenticated account on port 3002, generate one minimal valid map through the visible UI. Record HTTP status, returned private map UUID, object path, and signed preview success without recording secrets.

- [ ] **Step 2: Verify persistence and isolation**

Load the generated map, move off spawn, reload after all requests settle, and capture a screenshot showing the generated background and restored marker. Reopen a new authenticated browser context and verify the same map appears.

- [ ] **Step 3: Verify PVP then PVE**

Record the world position and wild-enemy roster, complete a PVP battle, then complete a PVE battle. Query the two newest history rows and assert correct types/opponents, rounds greater than one for multi-tick battles, unchanged PVP world position, and no unrelated enemy respawn.

- [ ] **Step 4: Complete the evidence report**

Write exact command outputs, pass counts, anonymized IDs, migration status, save revisions, battle-history IDs, map/object IDs, and screenshot path. Run `git diff --check` and `git status --short`; confirm all work remains uncommitted and no secret file is added.

- [ ] **Step 5: Final fresh verification**

Re-run `npm test -- --run`, `npm run typecheck`, `npm run build`, and the relevant Playwright/live checks after the final edit. Only then report completion.
