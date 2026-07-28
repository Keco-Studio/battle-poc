# Supabase Disconnection and Static Keco Content Design

## Goal

Make `battle-poc` operate as a local-first Web application whose authored game
data is compiled into the repository. The application must not connect to the
Supabase projects used by Keco Studio at runtime. When game data needs to
change, the developer names a Keco project and tables, an agent reads them
through the account-scoped Keco MCP, validates them, and updates static source
files consumed directly by the Web frontend.

The existing Supabase implementation is retained as disabled legacy code so it
can be studied or restored deliberately later. This change does not delete or
modify any remote Supabase resource.

## Confirmed Scope

- Disconnect all runtime Supabase client creation, session refresh, database,
  Storage, and Edge Function calls from active application paths.
- Keep existing AI and Pixellab API routes where they do not require Supabase.
- Keep the existing Supabase-related UI visible, but disable its controls and
  show a clear local-mode state.
- Keep browser-local game persistence through `localStorage`.
- Replace browser-time Studio imports and refreshes with code-resident static
  content.
- Preserve Supabase implementation files, migrations, tests, and related UI as
  disabled legacy material with concise comments explaining why they are not
  active.
- Disable the Supabase migration workflow so repository pushes cannot mutate a
  shared Supabase project.

## Non-Goals

- Do not drop, alter, migrate, back up, or inspect remote Supabase data as part
  of implementation.
- Do not delete Supabase tables, policies, triggers, functions, buckets, Edge
  Functions, users, or Auth configuration.
- Do not modify the `keco-studio` or `keco-simulation` repositories.
- Do not turn the entire Next.js project into a static export.
- Do not redesign AI, Pixellab, or unrelated backend routes.
- Do not add an MCP client to the browser or application server.
- Do not choose a permanent Keco source project. The user identifies the source
  for each future content update.

## Current Coupling Inventory

The active codebase currently mixes four Supabase concerns:

1. Auth and session refresh through `middleware.ts`, `SupabaseProvider`,
   `AuthContext`, callback handling, email/password auth, and Google OAuth.
2. Game persistence through player saves, battle history, user maps, map asset
   Storage, and PVP reads.
3. OpenClaw connection storage and proxying through Supabase Edge Functions.
4. Live Keco Studio discovery and import of skill, job, simulation draft, and
   game configuration rows through the shared Supabase database.

Repository automation also contains a migration workflow capable of linking to
preview or production Supabase projects and pushing every migration. The sample
environment file names Keco Studio Supabase environments directly. Both are
connection paths and must be made inert.

## Architecture

### Runtime Mode

The application has one active mode: local Web runtime. Supabase is not an
optional runtime fallback and is not selected from environment variables.

- `BattleRuntimeProviders` omits the active Supabase provider wiring.
- `middleware.ts` becomes a pass-through and performs no session work.
- Auth state resolves to local/guest state without constructing a Supabase
  client.
- Data providers bootstrap from code-resident content and never refresh from a
  remote table.
- Local game state continues to load and save through browser storage.

The previous integration remains in its existing modules where practical. At
the application wiring boundaries, the old provider, middleware, and remote
calls are retained as clearly marked disabled legacy code or references. Large
files are not converted into unreadable block comments; the disabling comment
belongs at the boundary that prevents execution.

### UI Behavior

Existing panels and controls remain visible to preserve the current layout and
make the temporarily unavailable capabilities explicit.

- Login, registration, OAuth, PVP, Studio import, cloud map, and Supabase-backed
  OpenClaw controls are disabled.
- Disabled controls expose the status `Current mode: local` and do not execute
  handlers that can initialize or call Supabase.
- Skill, job, and game configuration panels continue to display active static
  content. Their table discovery, sync, refresh, and Apply controls are disabled.
- Built-in maps and local saves remain usable.
- AI and Pixellab actions that do not require Supabase remain usable. Any
  Supabase auth guard or persistence step in those routes is disconnected while
  its legacy implementation is retained.

Disabled UI must be a real behavioral boundary, not the sole protection. Direct
navigation to an old Supabase-only API route must return a deterministic local-
mode unavailable response without importing a configured client or making a
network request.

## Static Keco Content

Generated content is split by domain under `src/content/generated/`:

- `skills.ts`
- `jobs.ts`
- `game-config.ts`
- `manifest.ts`

The domain files export typed, immutable data compatible with the existing
skill catalog, job catalog, and game configuration registry. Existing runtime
registries remain the consumption boundary, so battle calculations and UI
consumers do not gain a second configuration API.

`manifest.ts` records provenance for each update:

- Keco project ID and project name;
- source table IDs and names;
- selected row IDs;
- synchronization timestamp; and
- a deterministic content fingerprint when practical.

The manifest contains identifiers and provenance only. It must not contain
credentials, access tokens, cookies, Supabase keys, or unrelated Keco account
data.

The current built-in content remains active until the user requests a specific
MCP-backed content update. Adding the generated modules establishes the stable
consumption path; it does not silently import the existing `battle-poc` or
`simulation` Keco projects.

## MCP Update Flow

The Keco MCP is a development-time authoring tool, not an application runtime
dependency.

```text
User identifies a Keco project and tables
  -> agent reads project structure and complete target rows through Keco MCP
  -> agent maps and validates rows against battle-poc domain types
  -> agent updates static TypeScript content and provenance
  -> tests verify registries and gameplay consumers
  -> Web frontend receives the data through the normal code build
```

An update is atomic at the repository level. The agent first reads every
required table page and validates the complete dataset. If a required table is
missing, pagination is incomplete, IDs collide, references are unresolved, or
a supplied value is invalid, no generated domain file is partially updated.
The last valid committed static content remains active.

The repository does not include credentials or a standalone script that tries
to impersonate the MCP connection. Future updates are performed through the
available account-scoped MCP tools and ordinary reviewed code changes.

## Supabase Disconnection Boundaries

### Application

- No active import of the Supabase client is reachable from root providers or
  middleware.
- No startup effect calls `auth.getSession`, `auth.getUser`, or subscribes to
  Supabase auth changes.
- Local save hydration and writes do not wait on auth or database state.
- Supabase-only routes return locally without calling Auth, PostgREST, Storage,
  RPC, or Functions.
- Non-Supabase paths must not retain a newly added Supabase authentication gate.

### Configuration and Automation

- `.env.example` no longer offers a usable Keco Studio Supabase connection as
  battle-poc setup. Legacy variable names may remain commented and are labeled
  inactive.
- The Supabase migration workflow is disabled at the job boundary and documents
  that shared environments must not be mutated from battle-poc.
- The `supabase/` directory and migration history remain in the repository as
  disabled legacy material. Implementation does not apply them locally or
  remotely.
- Supabase packages may remain installed while legacy TypeScript still imports
  them. Package removal is outside this reversible disconnection.

### Remote Safety

The implementation must not run `supabase link`, `supabase db push`, migration
commands, SQL, Edge Function deployment/deletion, Storage deletion, or Auth
configuration changes. In particular, it makes no change to production project
`lulrcirmwwvvnupmwqcq` or to `simulation_skill_drafts`.

## Existing Worktree Changes

The worktree already contains uncommitted changes in Supabase-backed save, map,
auth, and API paths. They are user-owned work and must not be reverted. The
implementation will preserve those changes in place and disconnect them at the
smallest stable application boundaries. When an overlapping file must change,
the final diff must retain the existing work as disabled legacy behavior rather
than replacing it with an older committed version.

## Error Handling

- Disabled UI controls cannot enter loading states or emit rejected Supabase
  promises.
- Direct calls to Supabase-only route handlers receive a stable unavailable
  status and local-mode error code.
- Absence of Supabase environment variables is normal and produces no warning
  spam.
- Invalid generated content fails tests or build-time validation before it can
  become active.
- A failed future MCP read leaves existing generated files unchanged.
- Local storage parse failures continue to fall back to safe game defaults.

## Verification

Focused automated coverage will prove:

1. Root providers and middleware do not create or call a Supabase client.
2. Supabase-only controls are visible, disabled, and report local mode.
3. Supabase-only route handlers return locally without a network dependency.
4. Existing non-Supabase AI, Pixellab, and built-in map paths remain reachable.
5. Static skills, jobs, equipment, loadouts, and balance values flow through
   their existing registries into representative gameplay consumers.
6. Browser-local save state survives reload without a session or database.
7. A browser smoke test observes zero requests to Supabase hosts during startup
   and representative local play.
8. The migration workflow cannot execute its migration job.

Legacy Supabase integration tests remain in the repository but are marked as
disabled legacy coverage where their old runtime assumptions no longer apply.
They are not deleted.

Verification commands include focused Vitest tests followed by the full active
Vitest suite, `npm run typecheck`, `npm run build`, and a Playwright smoke test
against the local Web application.

## Completion Criteria

The refactor is complete when:

1. battle-poc starts, builds, and supports local play without Supabase variables;
2. no tested browser workflow sends a Supabase request;
3. Supabase-dependent UI is still visible but cannot initiate remote work;
4. local persistence and non-Supabase routes retain their intended behavior;
5. static generated content is the only active authored-data input to runtime
   registries;
6. the repository documents a repeatable MCP-to-code update contract;
7. Supabase integration code and migrations remain available as disabled legacy
   material; and
8. no remote Supabase resource was modified during implementation.
