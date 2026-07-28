# Supabase Disconnection and Static Keco Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make battle-poc run in local Web mode with zero Supabase runtime traffic and a typed code-resident seam for future Keco MCP content updates.

**Architecture:** A compile-time local-mode contract stops Supabase work at root provider, middleware, provider, UI, and route boundaries while retaining legacy implementations below those boundaries. Generated TypeScript modules optionally replace the existing built-in skill, job, and game-config sources; the browser consumes them only through the existing registries.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Vitest 2, Playwright 1.59.

## Global Constraints

- Do not execute Supabase CLI, SQL, migrations, Edge Function operations, Storage operations, or Auth configuration changes.
- Do not modify remote project `lulrcirmwwvvnupmwqcq` or `simulation_skill_drafts`.
- Do not modify the `keco-studio` or `keco-simulation` repositories.
- Preserve all existing uncommitted work, especially save, map, auth, and API changes; never restore an older version over them.
- Preserve Supabase implementation code and tests as disabled legacy material; do not delete it.
- Keep Supabase-dependent UI visible but disabled with the exact status text `Current mode: local`.
- Keep non-Supabase AI, PixelLab resource sync, built-in maps, and browser `localStorage` behavior active.
- MCP remains a development-time agent tool; do not add it to the application runtime or dependencies.
- Use `apply_patch` for hand edits and stage only files belonging to the current task.

---

### Task 1: Establish the Local Web Runtime Boundary

**Files:**
- Create: `src/lib/runtime/localWebMode.ts`
- Create: `tests/local-web-runtime.test.ts`
- Modify: `src/components/BattleRuntimeProviders.tsx:3-24`
- Modify: `src/lib/SupabaseContext.tsx:7-24`
- Modify: `middleware.ts:1-113`

**Interfaces:**
- Produces: `LOCAL_WEB_MODE: true`, `LOCAL_MODE_STATUS: 'Current mode: local'`, and `LOCAL_MODE_ERROR: 'supabase_disabled_local_mode'`.
- Produces: root provider behavior that supplies guest auth without mounting `SupabaseProvider`.
- Consumes: existing guest fallback in `AuthProvider` when `useSupabaseOptional()` returns `null`.

- [ ] **Step 1: Write the failing runtime-boundary test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('local Web runtime boundary', () => {
  it('pins battle-poc to local mode', async () => {
    const mode = await import('@/src/lib/runtime/localWebMode')
    expect(mode.LOCAL_WEB_MODE).toBe(true)
    expect(mode.LOCAL_MODE_STATUS).toBe('Current mode: local')
    expect(mode.LOCAL_MODE_ERROR).toBe('supabase_disabled_local_mode')
  })

  it('does not mount the Supabase provider', () => {
    const source = readFileSync('src/components/BattleRuntimeProviders.tsx', 'utf8')
    expect(source).not.toMatch(/<SupabaseProvider>/)
    expect(source).toContain('<AuthProvider>')
  })

  it('returns from middleware before legacy Supabase session work', () => {
    const source = readFileSync('middleware.ts', 'utf8')
    const localReturn = source.indexOf('if (LOCAL_WEB_MODE)')
    const clientCreation = source.indexOf('createServerClient(')
    expect(localReturn).toBeGreaterThanOrEqual(0)
    expect(clientCreation).toBeGreaterThan(localReturn)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/local-web-runtime.test.ts`

Expected: FAIL because `src/lib/runtime/localWebMode.ts` does not exist and the root still mounts `SupabaseProvider`.

- [ ] **Step 3: Add the local-mode contract**

```ts
/** battle-poc is intentionally disconnected from the shared Keco Supabase runtime. */
export const LOCAL_WEB_MODE = true as const
export const LOCAL_MODE_STATUS = 'Current mode: local' as const
export const LOCAL_MODE_ERROR = 'supabase_disabled_local_mode' as const
```

- [ ] **Step 4: Disconnect the root provider and middleware**

Change `BattleRuntimeProviders` to keep the legacy import as a comment and render guest auth directly:

```tsx
// Legacy Supabase wiring is intentionally disabled in local Web mode:
// import { SupabaseProvider } from '@/src/lib/SupabaseContext'

return (
  <QueryProvider>
    <AuthProvider>
      <BattleGameConfigProvider>
        <BattleJobsProvider>
          <BattleSkillsProvider>{children}</BattleSkillsProvider>
        </BattleJobsProvider>
      </BattleGameConfigProvider>
    </AuthProvider>
  </QueryProvider>
)
```

Make `isBattleSupabaseConfigured()` return `false` while local mode is pinned, and guard `SupabaseProvider` client creation:

```ts
export function isBattleSupabaseConfigured(): boolean {
  return !LOCAL_WEB_MODE && readSupabaseEnv() !== null
}

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => (LOCAL_WEB_MODE ? null : getOrCreateBrowserSupabaseClient()),
    [],
  )
  return <SupabaseContext.Provider value={client}>{children}</SupabaseContext.Provider>
}
```

At the first line of the exported middleware body, before environment reads or `createServerClient`, add:

```ts
if (LOCAL_WEB_MODE) {
  // The legacy Supabase session-refresh implementation below is retained but inactive.
  return NextResponse.next()
}
```

- [ ] **Step 5: Run the focused tests**

Run: `npx vitest run tests/local-web-runtime.test.ts tests/supabase-auth-flow.test.ts`

Expected: PASS; legacy Supabase module tests still compile while active runtime wiring is absent.

- [ ] **Step 6: Commit the runtime boundary**

```bash
git add src/lib/runtime/localWebMode.ts tests/local-web-runtime.test.ts src/components/BattleRuntimeProviders.tsx src/lib/SupabaseContext.tsx middleware.ts
git commit -m "refactor: disconnect Supabase runtime wiring"
```

### Task 2: Add the Typed Static Keco Content Seam

**Files:**
- Create: `src/content/generated/resolveGeneratedContent.ts`
- Create: `src/content/generated/skills.ts`
- Create: `src/content/generated/jobs.ts`
- Create: `src/content/generated/game-config.ts`
- Create: `src/content/generated/manifest.ts`
- Create: `tests/generated-keco-content.test.ts`
- Modify: `src/battle-core/content/skills/basic-skill-catalog.ts:1-6,544-590`
- Modify: `src/lib/jobs/builtinJobCatalog.ts:1-24`
- Modify: `src/lib/gameConfig/defaultGameConfig.ts:1-107`

**Interfaces:**
- Produces: `resolveGeneratedContent<T>(generated: T | null, fallback: () => T): T`.
- Produces: `GENERATED_BATTLE_SKILLS`, `GENERATED_JOB_CLASSES`, and `GENERATED_GAME_CONFIG`, initially `null` because no source was requested.
- Produces: `GENERATED_CONTENT_MANIFEST` with nullable per-domain provenance.
- Consumers: existing skill catalog, job catalog, and `createDefaultGameConfigBundle()`.

- [ ] **Step 1: Write the failing generated-content test**

```ts
import { describe, expect, it } from 'vitest'
import { resolveGeneratedContent } from '@/src/content/generated/resolveGeneratedContent'
import { GENERATED_CONTENT_MANIFEST } from '@/src/content/generated/manifest'
import { GENERATED_BATTLE_SKILLS } from '@/src/content/generated/skills'
import { GENERATED_JOB_CLASSES } from '@/src/content/generated/jobs'
import { GENERATED_GAME_CONFIG } from '@/src/content/generated/game-config'
import { getBuiltinBattleSkillDefinitions } from '@/src/battle-core/content/skills/basic-skill-catalog'
import { getBuiltinJobClassConfigs } from '@/src/lib/jobs/builtinJobCatalog'
import { createDefaultGameConfigBundle } from '@/src/lib/gameConfig/defaultGameConfig'

describe('generated Keco content seam', () => {
  it('uses generated values when present and fallback values otherwise', () => {
    expect(resolveGeneratedContent({ value: 7 }, () => ({ value: 1 }))).toEqual({ value: 7 })
    expect(resolveGeneratedContent(null, () => ({ value: 1 }))).toEqual({ value: 1 })
  })

  it('starts without silently selecting a Keco source', () => {
    expect(GENERATED_CONTENT_MANIFEST.domains).toEqual({
      skills: null,
      jobs: null,
      gameConfig: null,
    })
    expect(GENERATED_BATTLE_SKILLS).toBeNull()
    expect(GENERATED_JOB_CLASSES).toBeNull()
    expect(GENERATED_GAME_CONFIG).toBeNull()
  })

  it('keeps current code defaults active until an MCP source is requested', () => {
    expect(getBuiltinBattleSkillDefinitions()).not.toHaveLength(0)
    expect(getBuiltinJobClassConfigs()).not.toHaveLength(0)
    expect(createDefaultGameConfigBundle().progression.expPerLevel).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/generated-keco-content.test.ts`

Expected: FAIL because the generated content modules do not exist.

- [ ] **Step 3: Create the resolver and empty generated domain modules**

```ts
export function resolveGeneratedContent<T>(generated: T | null, fallback: () => T): T {
  return generated ?? fallback()
}
```

```ts
import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'

/** Updated only after a user names a Keco source and the complete MCP read validates. */
export const GENERATED_BATTLE_SKILLS: readonly BattleSkillDefinition[] | null = null
```

```ts
import type { JobClassConfig } from '@/src/lib/jobs/jobConfigTypes'

export const GENERATED_JOB_CLASSES: readonly JobClassConfig[] | null = null
```

```ts
import type { GameConfigBundle } from '@/src/lib/gameConfig/gameConfigTypes'

export const GENERATED_GAME_CONFIG: Readonly<GameConfigBundle> | null = null
```

```ts
export type GeneratedDomainProvenance = {
  projectId: string
  projectName: string
  tableIds: readonly string[]
  tableNames: readonly string[]
  rowIds: readonly string[]
  syncedAt: string
  fingerprint: string
}

export const GENERATED_CONTENT_MANIFEST = {
  version: 1,
  domains: { skills: null, jobs: null, gameConfig: null },
} as const satisfies {
  version: 1
  domains: Record<'skills' | 'jobs' | 'gameConfig', GeneratedDomainProvenance | null>
}
```

- [ ] **Step 4: Route existing static catalogs through the generated seam**

In the skill catalog, resolve once and use `ACTIVE_SKILLS` for map initialization, builtin reads, and resets:

```ts
const ACTIVE_SKILLS = resolveGeneratedContent(
  GENERATED_BATTLE_SKILLS,
  () => SKILLS,
)

const SKILL_MAP = new Map(ACTIVE_SKILLS.map((skill) => {
  const scaled = withScaledCooldown(skill)
  return [scaled.id, scaled] as const
}))
```

In `getBuiltinJobClassConfigs()`:

```ts
const generated = resolveGeneratedContent(
  GENERATED_JOB_CLASSES,
  () => JOB_CLASS_IDS.map(buildConfig),
)
return generated.map((config) => ({ ...config, stats: { ...config.stats } }))
```

In `createDefaultGameConfigBundle()`, construct the current fallback exactly as today, resolve it against `GENERATED_GAME_CONFIG`, then deep-clone the resolved bundle before returning. This keeps callers from mutating generated constants.

- [ ] **Step 5: Run catalog and registry tests**

Run: `npx vitest run tests/generated-keco-content.test.ts tests/poc-job-import.test.ts tests/poc-game-config-import.test.ts tests/poc-skill-import.test.ts`

Expected: PASS with current values unchanged because all generated domains are `null`.

- [ ] **Step 6: Commit the static content seam**

```bash
git add src/content/generated tests/generated-keco-content.test.ts src/battle-core/content/skills/basic-skill-catalog.ts src/lib/jobs/builtinJobCatalog.ts src/lib/gameConfig/defaultGameConfig.ts
git commit -m "feat: add static Keco content seam"
```

### Task 3: Pin Runtime Providers to Static Content

**Files:**
- Create: `tests/local-content-providers.test.ts`
- Modify: `src/lib/skills/BattleSkillsProvider.tsx:58-166`
- Modify: `src/lib/jobs/BattleJobsProvider.tsx:46-97`
- Modify: `src/lib/gameConfig/BattleGameConfigProvider.tsx:43-109`
- Modify: `tests/import-provider-fallback.test.ts:60`

**Interfaces:**
- Consumes: `LOCAL_WEB_MODE` and the existing `resetPoc*RuntimeToBuiltin()` functions.
- Produces: provider hydrate behavior that always installs static code content in local mode.
- Produces: provider Apply/sync methods that return `LOCAL_MODE_ERROR` and never call Studio loaders.

- [ ] **Step 1: Write the failing local-provider test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const providerContracts = [
  {
    file: 'src/lib/skills/BattleSkillsProvider.tsx',
    reset: 'resetPocSkillsRuntimeToBuiltin()',
    legacyHydrate: 'hydratePocSkills(',
  },
  {
    file: 'src/lib/jobs/BattleJobsProvider.tsx',
    reset: 'resetPocJobsRuntimeToBuiltin()',
    legacyHydrate: 'hydratePocJobs(',
  },
  {
    file: 'src/lib/gameConfig/BattleGameConfigProvider.tsx',
    reset: 'resetPocGameConfigRuntimeToBuiltin()',
    legacyHydrate: 'hydratePocGameConfig(',
  },
] as const

describe('local content providers', () => {
  it.each(providerContracts)('$file resets to static content before legacy hydrate', ({ file, reset, legacyHydrate }) => {
    const source = readFileSync(file, 'utf8')
    const localBranch = source.indexOf('if (LOCAL_WEB_MODE)')
    expect(localBranch).toBeGreaterThanOrEqual(0)
    expect(source.indexOf(reset, localBranch)).toBeGreaterThan(localBranch)
    expect(source.indexOf(legacyHydrate, localBranch)).toBeGreaterThan(source.indexOf(reset, localBranch))
  })

  it('returns the stable local-mode error from disabled provider actions', () => {
    const sources = providerContracts.map(({ file }) => readFileSync(file, 'utf8')).join('\n')
    expect(sources.match(/LOCAL_MODE_ERROR/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sources).toContain('syncedCount: 0')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/local-content-providers.test.ts`

Expected: FAIL because authenticated provider mocks still enter legacy remote hydrate paths.

- [ ] **Step 3: Add local-mode branches before all legacy provider work**

For each provider hydrate callback, add a first branch that resets to the static builtin/generated runtime and returns before reading Supabase or drafts:

```ts
if (LOCAL_WEB_MODE) {
  const local = resetPocSkillsRuntimeToBuiltin()
  setModulesState(local.state)
  applyRuntime(local)
  setIsHydrating(false)
  return
}
```

Use the corresponding job/config reset helper in those providers. Add these exact local-mode returns before the legacy Apply and sync bodies:

```ts
// BattleSkillsProvider.applySkillDrafts
if (LOCAL_WEB_MODE) {
  return { skills, errors: [LOCAL_MODE_ERROR] }
}

// BattleSkillsProvider.syncSimulationSkills
if (LOCAL_WEB_MODE) {
  return {
    skills,
    errors: [LOCAL_MODE_ERROR],
    warnings: [],
    syncedCount: 0,
  }
}

// BattleJobsProvider.applyJobDrafts and
// BattleGameConfigProvider.applyConfigDrafts
if (LOCAL_WEB_MODE) {
  return { errors: [LOCAL_MODE_ERROR] }
}
```

Keep the existing remote implementation below each branch with the comment `Legacy Supabase import path retained for deliberate future restoration.`

- [ ] **Step 4: Mark superseded provider integration tests as legacy**

Change only the outer suite declaration in `tests/import-provider-fallback.test.ts`:

```ts
describe.skip('legacy Supabase import Provider hydrate fallback', () => {
```

Do not delete or rewrite its cases.

- [ ] **Step 5: Run provider and generated-content tests**

Run: `npx vitest run tests/local-content-providers.test.ts tests/generated-keco-content.test.ts tests/import-provider-fallback.test.ts`

Expected: new local tests PASS; the old provider suite is reported skipped.

- [ ] **Step 6: Commit provider local mode**

```bash
git add tests/local-content-providers.test.ts tests/import-provider-fallback.test.ts src/lib/skills/BattleSkillsProvider.tsx src/lib/jobs/BattleJobsProvider.tsx src/lib/gameConfig/BattleGameConfigProvider.tsx
git commit -m "refactor: load battle content from static code"
```

### Task 4: Keep Remote UI Visible but Disabled

**Files:**
- Create: `app/components/LocalModeNotice.tsx`
- Create: `tests/local-mode-ui.test.ts`
- Modify: `app/components/DockFeatureModal.tsx:202-1020`
- Modify: `app/components/studioImport/StudioImportModal.tsx:35-153`
- Modify: `app/components/skills/SimulationSkillSyncPanel.tsx:1-80`
- Modify: `app/components/skills/SkillCatalogSourcesPanel.tsx:32-150`
- Modify: `app/components/jobs/PocJobConfigPanel.tsx:30-155`
- Modify: `app/components/gameConfig/PocGameConfigPanel.tsx:34-145`
- Modify: `app/components/map-ui/PixellabMapGeneratorModal.tsx:16-175`
- Modify: `app/components/GameMap.tsx:1302-1401`

**Interfaces:**
- Consumes: `LOCAL_WEB_MODE` and `LOCAL_MODE_STATUS`.
- Produces: `<LocalModeNotice />` with `role="status"` and `data-testid="local-mode-notice"`.
- Produces: `data-remote-feature` on every disabled control that would otherwise call Supabase.

- [ ] **Step 1: Write the failing local-mode UI test**

```ts
// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { LocalModeNotice } from '@/app/components/LocalModeNotice'

describe('local-mode remote UI', () => {
  it('renders a stable local status', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    root.render(React.createElement(LocalModeNotice))
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Current mode: local')
    root.unmount()
  })
})
```

Extend the existing UI source-contract assertions to require `disabled={LOCAL_WEB_MODE || ...}` and `data-remote-feature` on auth submit, Google OAuth, OpenClaw save/test, PVP load, Studio Apply/sync, and PixelLab cloud-map generation controls.

Add this exact contract to `tests/local-mode-ui.test.ts`:

```ts
import { readFileSync } from 'node:fs'

const remoteUiFiles = [
  'app/components/DockFeatureModal.tsx',
  'app/components/skills/SimulationSkillSyncPanel.tsx',
  'app/components/skills/SkillCatalogSourcesPanel.tsx',
  'app/components/jobs/PocJobConfigPanel.tsx',
  'app/components/gameConfig/PocGameConfigPanel.tsx',
  'app/components/map-ui/PixellabMapGeneratorModal.tsx',
  'app/components/GameMap.tsx',
]

it.each(remoteUiFiles)('%s exposes disabled Supabase controls in local mode', (file) => {
  const source = readFileSync(file, 'utf8')
  expect(source).toContain('LOCAL_WEB_MODE')
  expect(source).toContain('data-remote-feature="supabase"')
})
```

- [ ] **Step 2: Run the UI tests and verify they fail**

Run: `npx vitest run tests/local-mode-ui.test.ts tests/import-ui-integrity.test.ts`

Expected: FAIL because `LocalModeNotice` and local-mode disabled attributes do not exist.

- [ ] **Step 3: Add the reusable local-mode notice**

```tsx
import { LOCAL_MODE_STATUS } from '@/src/lib/runtime/localWebMode'

export function LocalModeNotice() {
  return (
    <p role="status" data-testid="local-mode-notice" className="text-[11px] font-semibold text-amber-700">
      {LOCAL_MODE_STATUS}
    </p>
  )
}
```

- [ ] **Step 4: Disable remote controls without hiding their panels**

For every handler that can reach Supabase, keep the control in place. For example, the OpenClaw save control becomes:

```tsx
<button
  type="button"
  data-remote-feature="supabase"
  disabled={
    LOCAL_WEB_MODE ||
    openclawLoading ||
    !openclawGatewayUrl.trim() ||
    !openclawToken.trim()
  }
  onClick={async () => {
    setOpenclawLoading(true)
    try {
      await invokeSupabaseFn('openclaw_bind', {
        gatewayUrl: openclawGatewayUrl.trim(),
        secret: openclawToken.trim(),
      })
    } finally {
      setOpenclawLoading(false)
    }
  }}
>
  {openclawLoading ? 'Saving...' : 'Save & Test'}
</button>
```

Render `<LocalModeNotice />` once in each affected panel. Do not disable Studio catalog navigation or panel close/back controls because they make no remote request. Keep PixelLab resource sync enabled: its auth guard is removed in Task 5. Disable only cloud-map generation because its current success path persists to Supabase Storage/database.

- [ ] **Step 5: Run the focused UI tests**

Run: `npx vitest run tests/local-mode-ui.test.ts tests/import-ui-integrity.test.ts`

Expected: PASS; import panels remain renderable and remote action controls are disabled.

- [ ] **Step 6: Commit the UI state**

```bash
git add app/components/LocalModeNotice.tsx tests/local-mode-ui.test.ts tests/import-ui-integrity.test.ts app/components/DockFeatureModal.tsx app/components/studioImport/StudioImportModal.tsx app/components/skills/SimulationSkillSyncPanel.tsx app/components/skills/SkillCatalogSourcesPanel.tsx app/components/jobs/PocJobConfigPanel.tsx app/components/gameConfig/PocGameConfigPanel.tsx app/components/map-ui/PixellabMapGeneratorModal.tsx app/components/GameMap.tsx
git commit -m "refactor: disable Supabase UI in local mode"
```

### Task 5: Stop Supabase at Server Route Boundaries

**Files:**
- Create: `src/lib/runtime/localModeResponse.ts`
- Create: `tests/local-web-route-boundaries.test.ts`
- Modify: `app/api/auth/me/route.ts:1-40`
- Modify: `app/auth/callback/page.tsx:1-78`
- Modify: `app/api/maps/route.ts:38-126`
- Modify: `app/api/maps/[id]/route.ts:1-78`
- Modify: `app/api/maps/update-collision/route.ts:1-75`
- Modify: `app/api/airpg-map/route.ts:91-139`
- Modify: `app/api/pixellab/create-map/route.ts:27-154`
- Modify: `app/api/pixellab-sync/route.ts:70-91`
- Modify: `app/api/agent-chat/route.ts:348-550`

**Interfaces:**
- Produces: `localModeUnavailable(feature: string, status = 503): NextResponse` with `{ ok: false, error: LOCAL_MODE_ERROR, feature }`.
- Produces: built-in map GET behavior with no Supabase call.
- Produces: PixelLab resource sync and ordinary AI chat behavior without a Supabase auth gate.

- [ ] **Step 1: Write failing route-boundary tests**

Mock `createServerSupabase` and `requireServerUser`, then import route handlers and assert:

```ts
const mapsResponse = await mapsRoute.GET()
expect(mapsResponse.status).toBe(200)
expect(createServerSupabase).not.toHaveBeenCalled()

const createMapResponse = await mapsRoute.POST(new Request('http://local/api/maps', {
  method: 'POST',
  body: '{}',
}))
expect(createMapResponse.status).toBe(503)
expect(await createMapResponse.json()).toMatchObject({
  error: 'supabase_disabled_local_mode',
  feature: 'cloud_maps',
})
expect(createServerSupabase).not.toHaveBeenCalled()
```

Add a table-driven assertion with these exact feature/handler pairs:

```ts
const unavailableCases = [
  ['auth', () => authRoute.GET()],
  ['cloud_maps', () => mapByIdRoute.PATCH(request, { params: Promise.resolve({ id: 'map-1' }) })],
  ['cloud_maps', () => collisionRoute.POST(request)],
  ['pixellab_cloud_map', () => pixellabCreateRoute.POST(request)],
] as const

for (const [feature, invoke] of unavailableCases) {
  const response = await invoke()
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({
    error: 'supabase_disabled_local_mode',
    feature,
  })
}
expect(createServerSupabase).not.toHaveBeenCalled()
```

Separately request a known `builtin:` AirPG map and assert 200. Invoke PixelLab resource sync in a mocked development filesystem and assert it reaches `readdir` without calling `requireServerUser`. Set the agent-chat backend environment to `supabase_openclaw`, invoke GET/POST, and assert the `supabase_openclaw` unavailable feature without a Supabase client call.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/local-web-route-boundaries.test.ts`

Expected: FAIL because current handlers still initialize Supabase or require a server user.

- [ ] **Step 3: Add the standard local-mode response**

```ts
import { NextResponse } from 'next/server'
import { LOCAL_MODE_ERROR } from './localWebMode'

export function localModeUnavailable(feature: string, status = 503) {
  return NextResponse.json({ ok: false, error: LOCAL_MODE_ERROR, feature }, { status })
}
```

- [ ] **Step 4: Guard Supabase-only handlers before client construction**

Add these feature guards before client construction:

- `app/api/auth/me/route.ts`: `localModeUnavailable('auth')`.
- `app/api/maps/route.ts` POST: `localModeUnavailable('cloud_maps')`.
- `app/api/maps/[id]/route.ts` PATCH/DELETE: `localModeUnavailable('cloud_maps')`.
- `app/api/maps/update-collision/route.ts` POST: `localModeUnavailable('cloud_maps')`.
- `app/api/pixellab/create-map/route.ts` POST: `localModeUnavailable('pixellab_cloud_map')`.
- `app/api/agent-chat/route.ts` Supabase health/chat branches: `localModeUnavailable('supabase_openclaw')`.

Each handler uses this exact branch shape:

```ts
if (LOCAL_WEB_MODE) return localModeUnavailable('cloud_maps')
// Legacy Supabase implementation retained below.
```

For `/api/maps` GET, return `listBuiltinMaps()` immediately in local mode. For AirPG maps, allow `builtin:` references and return `localModeUnavailable('cloud_maps')` only for `user:` references. For `/auth/callback`, render the existing page shell with `<LocalModeNotice />` and a home link instead of calling `useSupabase()`.

- [ ] **Step 5: Preserve non-Supabase server capabilities**

In PixelLab resource sync and ordinary agent chat, bypass only the Supabase auth guard:

```ts
if (!LOCAL_WEB_MODE) {
  const supabase = await createServerSupabase()
  const auth = await requireServerUser(supabase)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
}
// Existing non-Supabase implementation continues.
```

Before either `supabase_openclaw` GET health or POST chat branch can call a function, return `localModeUnavailable('supabase_openclaw')`. Do not change DeepSeek, hooks, or local OpenClaw service modes.

- [ ] **Step 6: Run route tests and existing map contracts**

Run: `npx vitest run tests/local-web-route-boundaries.test.ts tests/map-reference.test.ts tests/user-map-project.test.ts tests/server-route-auth.test.ts`

Expected: local route tests PASS; legacy map/auth unit contracts continue compiling.

- [ ] **Step 7: Commit route boundaries carefully**

Review `git diff` for every dirty route before staging. Confirm the user's map/save implementation remains below the new local-mode branch.

```bash
git add src/lib/runtime/localModeResponse.ts tests/local-web-route-boundaries.test.ts app/api/auth/me/route.ts app/auth/callback/page.tsx app/api/maps/route.ts app/api/maps/\[id\]/route.ts app/api/maps/update-collision/route.ts app/api/airpg-map/route.ts app/api/pixellab/create-map/route.ts app/api/pixellab-sync/route.ts app/api/agent-chat/route.ts
git commit -m "refactor: block Supabase server routes"
```

### Task 6: Disable Supabase Configuration and Remote Test Automation

**Files:**
- Create: `tests/supabase-automation-disabled.test.ts`
- Modify: `.env.example:1-25`
- Modify: `.github/workflows/supabase-migrations.yml:1-25`
- Modify: `README.md:1-70`
- Modify: `tests/integration/auth.spec.ts:1-20`
- Modify: `tests/integration/keco-live-import.spec.ts:1-30`
- Modify: `tests/integration/edge.spec.ts` at remote-only describe blocks

**Interfaces:**
- Produces: a permanently skipped migration job while local Web mode is active.
- Produces: documentation that Supabase variables are legacy and ignored.
- Preserves: remote integration test bodies as explicitly skipped legacy evidence.

- [ ] **Step 1: Write the failing automation contract test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Supabase automation is disabled', () => {
  it('cannot run the migration job', () => {
    const workflow = readFileSync('.github/workflows/supabase-migrations.yml', 'utf8')
    expect(workflow).toMatch(/migrate-database:\s*\n\s*if:\s*\$\{\{ false \}\}/)
  })

  it('does not publish a usable shared Supabase URL in setup', () => {
    const env = readFileSync('.env.example', 'utf8')
    expect(env).not.toMatch(/^NEXT_PUBLIC_SUPABASE_URL=/m)
    expect(env).toContain('Legacy Supabase integration is disabled')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/supabase-automation-disabled.test.ts`

Expected: FAIL because the migration job is active and `.env.example` contains an active local Supabase URL.

- [ ] **Step 3: Make configuration inert while preserving history**

Add directly below `migrate-database:`:

```yaml
    # Legacy workflow retained for history. battle-poc must not mutate shared Supabase projects.
    if: ${{ false }}
```

Replace active Supabase sample assignments with commented, intentionally blank legacy variables:

```dotenv
# Legacy Supabase integration is disabled in local Web mode.
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
```

Do not retain the real preview or production project URLs in battle-poc setup instructions. Add a README `Local Web data mode` section explaining that game data is code-resident and future Keco updates are performed through MCP-to-code changes.

- [ ] **Step 4: Disable only remote Playwright suites**

At the outer suite of `auth.spec.ts` and `keco-live-import.spec.ts`, use:

```ts
test.describe.skip('legacy Supabase integration - disabled in local Web mode', () => {
```

In `edge.spec.ts`, skip only describes/cases that create Supabase admin clients or verify cloud persistence. Keep corrupt-localStorage and other local-only edge tests active. Test bodies and cleanup logic remain present.

- [ ] **Step 5: Run automation and configuration tests**

Run: `npx vitest run tests/supabase-automation-disabled.test.ts tests/database-contract.test.ts tests/supabase-auth-flow.test.ts`

Expected: PASS. Database migration files and legacy SDK behavior remain intact, while automation cannot push them.

- [ ] **Step 6: Commit configuration disconnection**

```bash
git add .env.example .github/workflows/supabase-migrations.yml README.md tests/supabase-automation-disabled.test.ts tests/integration/auth.spec.ts tests/integration/keco-live-import.spec.ts tests/integration/edge.spec.ts
git commit -m "chore: disable Supabase automation"
```

### Task 7: Prove Zero Supabase Traffic and Local Persistence

**Files:**
- Create: `tests/integration/local-web-mode.spec.ts`
- Modify: `tests/integration/battle.spec.ts` only if an existing assertion assumes cloud state

**Interfaces:**
- Consumes: `data-testid="local-mode-notice"` and `data-remote-feature="supabase"` from Task 4.
- Verifies: no request whose hostname ends in `.supabase.co` or whose path contains `/auth/v1`, `/rest/v1`, `/storage/v1`, or `/functions/v1`.

- [ ] **Step 1: Write the browser test**

```ts
import { expect, test } from '@playwright/test'

test('local Web mode keeps remote UI visible with zero Supabase traffic', async ({ page }) => {
  const supabaseRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.hostname.endsWith('.supabase.co') ||
      /\/(auth|rest|storage|functions)\/v1\//.test(url.pathname)
    ) {
      supabaseRequests.push(request.url())
    }
  })

  await page.addInitScript(() => {
    localStorage.setItem('battle-job-selected', '1')
    localStorage.setItem('battle-game-save', JSON.stringify({
      playerLevel: 3,
      playerExp: 4,
      playerGold: 5,
      playerHP: 100,
      equippedGear: {},
      inventory: [],
      playerPos: { x: 8, y: 8 },
      jobClassId: 'hero',
    }))
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByTestId('local-mode-notice')).toBeVisible()
  await expect(page.locator('[data-remote-feature="supabase"]').first()).toBeDisabled()
  await page.reload()
  await expect(page.getByText(/LV\.3/)).toBeVisible()
  expect(supabaseRequests).toEqual([])
})
```

- [ ] **Step 2: Run the browser test and verify the first failure**

Run: `npx playwright test tests/integration/local-web-mode.spec.ts`

Expected before final fixes: FAIL on a missing status/disabled locator, persistence assertion, or observed Supabase request. Diagnose the exact boundary before editing.

- [ ] **Step 3: Fix only the boundary exposed by the browser test**

Use the task ownership above: root/middleware issues belong to Task 1 files, data issues to Tasks 2-3, disabled UI issues to Task 4, and route traffic to Task 5. Do not add broad request interception that merely hides a real connection attempt.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npx vitest run tests/local-web-runtime.test.ts tests/generated-keco-content.test.ts tests/local-content-providers.test.ts tests/local-mode-ui.test.ts tests/local-web-route-boundaries.test.ts tests/supabase-automation-disabled.test.ts
npm test
npm run typecheck
npm run build
npx playwright test tests/integration/local-web-mode.spec.ts
```

Expected: all active tests PASS; legacy Supabase suites are reported skipped; build succeeds without Supabase variables; browser test records zero Supabase requests.

- [ ] **Step 5: Inspect the final diff and remote-safety evidence**

Run:

```bash
git status --short
git diff --check
git diff --name-only origin/rebuild...HEAD
```

Confirm no Supabase CLI output, migration, remote snapshot, generated credential, or remote data artifact was created. Confirm the pre-existing dirty files still contain the user's cloud-save/map work below inactive boundaries.

- [ ] **Step 6: Commit the browser acceptance**

```bash
git add tests/integration/local-web-mode.spec.ts tests/integration/battle.spec.ts
git commit -m "test: verify local Web mode isolation"
```
