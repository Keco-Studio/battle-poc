# Battle POC Non-Import Bug Remediation Design

**Date:** 2026-07-28
**Status:** Approved design, ready for implementation planning
**Branch:** `rebuild`

## Objective

Fix the confirmed save, authorization, map, PVP, and battle-history defects without changing the already verified Keco Studio import contract. Add account-private, cloud-persisted user maps so map creation works across browsers and devices without leaking changes between accounts.

## Constraints

- Do not change the Keco Studio import data model or its verified live import behavior.
- Do not use subagents.
- Do not commit implementation or documentation changes.
- Built-in maps remain repository-owned and read-only.
- User-created maps are private to one Supabase account and persist across devices.
- Every authenticated user may invoke PixelLab map generation.
- Guests may play built-in maps but may not create, mutate, or generate maps.
- Existing password login, Google login, and guest play remain available.
- Production API routes must not write to the deployment filesystem.
- All behavior changes require a failing regression test before implementation.

## Confirmed Defects In Scope

1. Password sign-in can enable auto-save before cloud hydration finishes and overwrite an existing cloud save with guest or previous-account state.
2. Auto-save requests can overlap and complete out of order, allowing an older snapshot to overwrite a newer snapshot.
3. The PVP read policy exposes every column of every authenticated player's `player_saves` row.
4. Map mutation, PixelLab generation, asset sync, and non-Supabase chat modes accept unauthenticated requests.
5. Map loading unconditionally applies the map spawn after save hydration, overwriting the persisted player position.
6. PVP computes every opponent as an unequipped `hero`, regardless of the opponent's actual combat snapshot.
7. `pvpOpponentName` survives battle close and causes later PVE history rows to be recorded as PVP.
8. PVP reuses world-map coordinates and a random wild enemy, so it moves the persisted player and can respawn a monster that was never fought.
9. Battle history always records one round because `battleRound` is reset but never advanced.
10. User map edits currently target shared repository files and therefore cannot be private, cross-device, or durable on serverless production deployments.

## Non-Goals

- Server-authoritative anti-cheat for PVP is not included. PVP remains a POC simulation based on a published opponent snapshot.
- Public map sharing, map marketplace, collaboration, and moderation are not included.
- Historical per-map player positions are not included. The save stores one current map reference and one position.
- PixelLab billing plans and paid quotas are not included. Authentication, payload limits, and audit fields are required; product quotas can be added later.
- Imported skill, job, and game-configuration table formats are unchanged.

## Ownership Boundaries

### Authentication Session

Supabase Auth owns the current user identity. A monotonically increasing client-side auth generation identifies each hydration attempt. Results from an older generation must never mutate current game state.

### Player Save

`useGameState` owns the in-memory player snapshot. A dedicated save coordinator owns all cloud writes. UI components and gameplay effects may update React state but may not call `savePlayerSave` directly for general progress persistence.

### World Map

The world-map subsystem owns `currentMapRef` and `playerPos`. Map loading may validate or clamp a saved position, but it may not replace a valid hydrated position with the map spawn.

### Battle Session

One explicit battle-session object owns the distinction between PVE and PVP. Settlement, history classification, respawn behavior, opponent labels, and coordinate handling derive from this object rather than unrelated state such as an opponent-name string.

### User Maps

Supabase Postgres owns user map metadata and JSON. Supabase Storage owns generated background images. Repository files own built-in maps. No production request writes map data into `data/maps` or `public/assets`.

## Data Model

### `player_saves` Additions

Add these columns:

```sql
alter table public.player_saves
  add column if not exists current_map_ref text not null
    default 'builtin:top-down-pixel-art-rpg-battle-arena-map-wide-ope-1777006352683',
  add column if not exists save_revision bigint not null default 0,
  add column if not exists combat_max_hp integer,
  add column if not exists combat_atk numeric,
  add column if not exists combat_def numeric,
  add column if not exists combat_spd numeric;

alter table public.player_saves
  add constraint player_saves_revision_non_negative check (save_revision >= 0),
  add constraint player_saves_combat_max_hp_positive check (combat_max_hp is null or combat_max_hp > 0),
  add constraint player_saves_combat_atk_non_negative check (combat_atk is null or combat_atk >= 0),
  add constraint player_saves_combat_def_non_negative check (combat_def is null or combat_def >= 0),
  add constraint player_saves_combat_spd_non_negative check (combat_spd is null or combat_spd >= 0);
```

`current_map_ref` uses exactly two forms:

- `builtin:<map-slug>` for repository maps.
- `user:<uuid>` for rows in `user_maps`.

The application exports one `DEFAULT_BUILTIN_MAP_REF` constant with the exact value `builtin:top-down-pixel-art-rpg-battle-arena-map-wide-ope-1777006352683`. Database defaults, guest defaults, catalog fallback, and map-loading fallback all consume this same canonical value.

Combat snapshot columns are updated through the same ordered save pipeline as level, equipment, and skills. They represent the exact locally calculated battle stats last published by that account.

### `user_maps`

Create one row per private map:

```sql
create table public.user_maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  map_data jsonb not null,
  background_object_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_maps_name_not_empty check (length(trim(name)) > 0),
  constraint user_maps_name_length check (length(name) <= 80),
  constraint user_maps_owner_name_unique unique (owner_id, name)
);

create index user_maps_owner_updated_idx
  on public.user_maps(owner_id, updated_at desc);
```

`map_data` uses the existing project-like map JSON consumed by `/api/airpg-map`. The server validates the required map dimensions, ground layer, collision layer, spawn, and entity arrays before insert or update.

RLS permits `select`, `insert`, `update`, and `delete` only when `auth.uid() = owner_id`. Client input never controls `owner_id`; the server always derives it from the verified session.

### Private Storage Bucket

Create the private bucket `battle-user-map-assets`. Every object path uses:

```text
<auth-user-id>/<user-map-id>/<generated-file-name>.png
```

Storage policies allow authenticated users to select, insert, update, and delete only when the first path segment equals `auth.uid()::text`. The browser receives a short-lived signed URL, never a public bucket URL.

### PVP Projection

Remove `player_saves_select_authenticated_pvp`, which currently grants row-wide access. Add a `security definer` RPC named `list_pvp_opponents(p_limit integer default 100)` that:

- rejects anonymous callers;
- excludes `auth.uid()`;
- caps the effective limit to `1..100`;
- returns only `user_id`, `character_name`, `level`, `job_class_id`, `combat_max_hp`, `combat_atk`, `combat_def`, `combat_spd`, and `carried_skill_ids`;
- orders by level descending and `updated_at` descending;
- has `search_path` fixed to `public`.

No inventory, position, currency, current HP, or complete save row is exposed.

## Save Coordination

### Save Snapshot

The cloud save coordinator accepts an immutable `PlayerSaveUpdate` plus the active user ID and auth generation. Callers submit complete snapshots; the coordinator coalesces pending snapshots so only the newest not-yet-started snapshot is written.

### Hydration State Machine

The client uses these phases:

```text
guest -> hydrating(user, generation) -> ready(user, generation, revision)
      -> signing_out -> guest
```

Rules:

1. Entering `hydrating` pauses cloud writes before exposing the new user as save-ready.
2. Load the session user, player save, and battle history for the same generation.
3. Discard every response whose user ID or generation no longer matches.
4. Apply the cloud save as the authoritative snapshot for an existing account.
5. Store `save_revision` from the loaded row.
6. Enter `ready` only after the React state application has completed.
7. Signing out increments the generation, clears queued writes, waits only for an already-started write belonging to the outgoing user, clears user-scoped browser data, and applies guest defaults.

`authedUserId` may be used for display while hydration is running, but cloud auto-save requires `phase === 'ready'` and an exact user/generation match.

### Ordered Optimistic Writes

Only one write may be in flight per coordinator. A write performs:

```text
update player_saves
set <snapshot fields>, save_revision = expectedRevision + 1
where user_id = currentUser and save_revision = expectedRevision
returning save_revision
```

On success, the returned revision becomes the next expected revision and the coordinator writes the latest coalesced pending snapshot, if one exists.

If zero rows are returned, another session changed the save. The coordinator must stop automatic cloud writes for that hydration generation, preserve the newer remote row, emit a visible data-flow trace entry, and require a fresh hydration before more cloud writes. It must never retry by overwriting the remote revision blindly.

LocalStorage writes remain synchronous and may occur for every state change. Cloud writes are coalesced with a 250 ms quiet period for ordinary state changes; battle ticks therefore do not generate one request per tick. A `pagehide` handler may request an immediate flush but must use the same coordinator and revision rules.

The local `SavedState` payload includes `currentMapRef`. Guest sessions therefore restore their last built-in map and position without using cloud persistence.

## Account-Private Map Flow

### Catalog

`GET /api/maps` returns built-in map summaries for guests. For an authenticated user it also returns that user's `user_maps` rows. Each result contains:

```ts
type MapCatalogItem = {
  ref: `builtin:${string}` | `user:${string}`
  name: string
  source: 'builtin' | 'user'
  updatedAt: string | null
}
```

The response never contains another user's map.

### Loading

`GET /api/airpg-map?map=<map-ref>` loads repository JSON for a built-in reference. A user reference requires authentication and queries both `id` and `owner_id = auth.uid()`. Missing, deleted, or foreign user-map references return `404`, not `403`, to avoid confirming another account's map IDs.

When the selected map equals the hydrated `currentMapRef`, the client keeps the saved position if it is finite, in bounds, and walkable. Otherwise it selects the nearest walkable cell. The configured spawn is used only for a newly selected map or when no valid saved position exists.

If a saved user map was deleted, the client falls back to `DEFAULT_BUILTIN_MAP_REF`, applies its spawn once, and persists the fallback only after save hydration is ready.

### Creation And Editing

- `POST /api/maps` copies a validated built-in map or accepts validated project-like JSON and creates a private `user_maps` row.
- `PATCH /api/maps/<uuid>` updates only the authenticated owner's private map.
- `DELETE /api/maps/<uuid>` deletes only the authenticated owner's row and owned Storage objects.
- Editing a built-in map first creates a private copy; built-in files are never mutated.
- Collision updates use `PATCH /api/maps/<uuid>` and require collision length to equal `width * height`.

### PixelLab Generation

`POST /api/pixellab/create-map` requires a verified Supabase user for every request. All authenticated users are eligible. The route:

1. validates description length `1..500`;
2. validates integer image dimensions `32..400`;
3. calls PixelLab with the server token;
4. verifies that the result decodes as a PNG and is no larger than 10 MiB;
5. creates a `user_maps` row owned by the caller;
6. uploads the PNG beneath the caller's Storage prefix;
7. updates `background_object_path` and returns the new `user:<uuid>` map reference;
8. removes the partial row or object if a later step fails.

The request body cannot provide an owner ID, output path, or existing map ID.

`POST /api/pixellab-sync` is a local repository-development tool, not user map creation. It requires an authenticated user in development, returns `404` outside development, and performs no production filesystem writes.

## API Authentication

Server routes authenticate with a server Supabase client and `auth.getUser()`. `auth.getSession()` alone is not accepted as server authorization.

The following routes require authentication:

- private-map catalog additions and every user-map read/write;
- PixelLab generation;
- all `/api/agent-chat` POST modes, including DeepSeek, OpenClaw CLI, hooks, service, and Supabase OpenClaw.

Health endpoints may remain unauthenticated but must not invoke a paid generation or mutate state. Authentication failures return `401`; ownership-hidden map lookups return `404`; invalid payloads return `400`.

## Battle Session Model

Replace `pvpOpponentName` plus `isPVPMode` as competing sources of truth with:

```ts
type ActiveBattleSession =
  | {
      kind: 'pve'
      enemyId: number
      opponentName: string
      anchor: BattleGridAnchor
    }
  | {
      kind: 'pvp'
      opponentId: string
      opponentName: string
      opponentLevel: number
      opponentStats: EnemyCombatStats
      opponentSkillIds: string[]
    }
```

Derived rules:

- History type and opponent name come from `session.kind`.
- Closing, fleeing, signing out, and starting another battle clear or replace the complete session atomically.
- Only a PVE victory assigns `pendingRespawnEnemyIdRef`.
- PVP never selects a random wild enemy as its logical opponent.
- PVP renders controller-owned arena positions without writing `playerPos` or persistent enemy positions.
- PVP opponent stats use the published combat snapshot. Rows lacking a valid snapshot fall back to `calcPlayerStats(level, jobClassId)` and are labeled through a trace warning.
- PVE rewards, PVP rewards, and existing defeat penalties remain unchanged by this remediation.

## Battle History Rounds

This real-time battle engine treats one completed battle-core tick as one round for history compatibility. At settlement:

```ts
const rounds = Math.max(1, finalSession.tick)
```

`rounds` is passed directly to victory or defeat settlement. Settlement must not read a React state value that is scheduled in the same tick. The UI continues to display the database field as rounds.

## Failure Handling

- Auth hydration failures leave cloud auto-save paused and retain the last safe local snapshot; they do not treat default state as successfully hydrated cloud state.
- Save conflicts preserve the remote revision and surface `save_conflict` in the data-flow trace.
- User-map database or Storage errors do not fall back to shared filesystem writes.
- A PixelLab failure leaves no usable partial map. Cleanup failures are logged with the row ID and object path.
- A foreign map reference returns `404` and never falls back to a map owned by another account.
- Invalid PVP snapshots use the documented job-based fallback without exposing the full save.

## Test Strategy

### Pure Unit Tests

- Save coordinator serializes writes and coalesces pending snapshots.
- An older deferred write cannot overwrite a newer queued snapshot.
- Auth generation changes discard stale hydration results and queued saves.
- A revision conflict pauses cloud writes without blind retry.
- Map-reference parsing accepts only `builtin:<slug>` and `user:<uuid>`.
- A valid saved position wins over spawn; invalid or foreign-map positions use spawn or nearest walkable cell.
- Battle history classification follows the active session and cannot retain a prior PVP opponent.
- PVP outcome does not request wild-enemy respawn or world-coordinate writes.
- Settlement records the final battle-core tick as rounds.

### Database And API Integration Tests

- Account A can CRUD its map and signed asset; account B receives no row and cannot read or mutate A's map.
- Anonymous users cannot create maps, call PixelLab, mutate collision, or post agent chat.
- The PVP RPC excludes self and returns only its declared columns.
- Direct authenticated `select * from player_saves` returns only the caller's row after the broad PVP policy is removed.
- A conditional save update succeeds at the expected revision and returns zero rows for a stale revision.

### Browser Tests

- A returning password user with a cloud save signs in under delayed network conditions without cloud-state rollback.
- Rapid movement and battle ticks settle to the newest cloud snapshot after reload.
- Refresh restores both the selected map and actual player marker position after map loading finishes.
- Account A creates a map; account B cannot see it; account A sees it after a new browser session.
- One real PixelLab generation creates a private map, uploads its image, loads it in the game, and remains visible after reload.
- PVP followed by PVE records correct types and names, preserves the world position, and does not respawn an unrelated monster.
- Battle history records a value greater than one for a battle lasting multiple ticks.

### Regression Suite

Run the complete Vitest suite, TypeScript typecheck, production build, and existing Playwright integration suite. The verified Keco Studio live-import acceptance flow must still pass without changing its sentinel data.

## Live Verification Evidence

Retain a verification report at:

```text
docs/verification/2026-07-28-non-import-bug-remediation.md
```

The report records:

- branch and exact working-tree state;
- migration names and remote application status;
- anonymized account IDs used for isolation checks;
- created private map ID and Storage object path;
- PixelLab request status and rendered map screenshot path;
- save revisions before and after rapid-state verification;
- PVP and PVE battle-history row IDs, types, opponents, and rounds;
- commands and exact pass counts for tests, typecheck, build, and browser checks;
- any external limitation that prevents a required live check.

Secrets, access tokens, passwords, and full email addresses must not be written to the report.

## Acceptance Criteria

1. Existing cloud progress is never written before matching-user hydration completes.
2. At most one cloud save request is in flight per client, and stale revisions never overwrite newer saves.
3. An authenticated user cannot query another user's full `player_saves` row.
4. Anonymous callers cannot spend PixelLab quota, mutate maps, or invoke configured chat backends.
5. User maps and generated assets are visible only to their owner and survive browser/device changes.
6. Refresh preserves the selected map and valid saved player position after all asynchronous loading completes.
7. PVP uses the opponent's published job-aware combat snapshot.
8. A PVP session cannot alter persistent world coordinates, respawn a wild enemy, or classify later PVE history as PVP.
9. Multi-tick battles record their actual final battle-core tick count rather than one.
10. Full unit tests, typecheck, production build, browser integration, live Supabase isolation, live save persistence, and one real PixelLab map-generation flow pass.
11. The Keco Studio import acceptance flow and sentinel values remain unchanged and pass again.

## Migration And Rollback

Apply schema changes through new timestamped Supabase migrations. Do not edit already-applied migrations.

Rollback order, if required:

1. Revert application reads to built-in maps and the prior save shape.
2. Drop Storage policies and the private bucket after exporting owned assets.
3. Drop `list_pvp_opponents` and `user_maps` policies/table.
4. Restore no broad PVP policy; full-save exposure must not be reintroduced during rollback.
5. Leave additive `player_saves` columns in place if older clients ignore them, avoiding destructive save migration.

## Risks And Mitigations

- **Existing sessions during migration:** additive columns and default map references keep older clients readable.
- **Two tabs edit the same save:** revision checks stop silent last-writer rollback and require fresh hydration after conflict.
- **Storage upload succeeds but row update fails:** compensating cleanup removes the uploaded object and partial row.
- **User map is deleted while selected:** deterministic fallback returns the user to the built-in home map.
- **PVP snapshot is stale or forged:** timestamp ordering and validation improve consistency, but server-authoritative competitive integrity remains explicitly out of scope.
- **Tests pass before delayed map fetch finishes:** browser assertions wait on observable catalog/map/position state rather than fixed sleeps.
