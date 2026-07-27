# Studio Import Reliability

## Goal

Make the `simulation` Studio project a reliable source for battle-poc skills, jobs, and game configuration. An import must either produce a validated runtime value or a visible error; it must never report success while silently dropping a field or leaving the battle runtime on stale constants.

## Source-of-truth policy

Keco Studio is the sole authority for imported authored data. Local drafts persist source table/row/column bindings and UI state only; persisted modules are never an offline authority. Every Apply, authenticated hydrate, and simulation sync must re-read the bound Studio rows. If the table cannot be read, the row is missing, the draft set is empty, or any supplied value fails validation, the corresponding imported runtime module and Keco cache are removed and runtime falls back to builtin data. No imported value may remain active solely because it was previously cached.

## Scope

This change covers the existing remote-table import path:

`Keco Studio table -> StudioTableRow -> local draft -> validation -> runtime module/registry`.

It does not add CSV/JSON file upload, change Keco Studio, create remote tables, or redesign the import UI. The existing `simulation` project tables are the compatibility reference. `Skills` is the canonical skill table; `Characters` is the canonical character table. Legacy `skill`/`role` tables may be read only when their headers are explicitly mapped.

## Functional Requirements

### FR-1: Complete skill field preservation

The battle-poc skill draft and row codec must preserve every field supported by the simulation skill importer: `id`, `name`, `type`, `power`, `mp`, `maxCooldown`, `description`, `range`, `attachElement`, `attachStrength`, `attachTurns`, `dotDamage`, `dotTurns`, `freezeTurns`, `specialEffect`, `specialEffectValue`, `specialEffectDuration`, and `reactionTriggers`. A UI import followed by Apply must retain these values in the generated runtime definition/module.

`range` is measured in battle tiles. `maxCooldown` is measured in Studio turns at the table boundary; conversion to battle-core ticks happens exactly once at the runtime boundary and is reversible on export.

Imported skill definitions remain in Studio units until they enter the battle-core runtime map. Runtime registration must be idempotent: re-registering an already normalized definition cannot multiply its cooldown again.

### FR-2: Explicit validation

Before Apply, the import validator must reject a table with no ID column, a table whose signature clearly belongs to another import kind, duplicate normalized IDs, invalid numeric values, or IDs whose normalization changes the value in a way that could collide. Errors identify table, row, field, and reason. Defaults are used only when a field is absent, never when a supplied value is malformed.

The table-level validator is a required gate in every import UI. Asset display names may supply a display-name fallback but never substitute for an explicit skill, job, or config ID column. Drafts retain bindings for recognized columns even when their current cell is empty, so later Studio edits are observable on refresh.

Warnings are non-blocking only for unknown columns and optional fields.

### FR-3: Runtime application

All imported game-config values used by battle (enemy formula, rewards/experience, basic attack, equipment, and role loadouts) must be read through `gameConfigRegistry` or an adapter backed by it. Applying a valid draft must change the value observed by the battle calculation without a page reload.

Skill combat fields are only considered imported successfully when the active battle resolver consumes them. At minimum, imported DOT data must create the existing Keco DOT status and produce a later DOT damage result; unsupported fields must be rejected or explicitly remain outside the supported runtime contract.

Valid imported element attachment and reaction triggers are part of the supported contract for both ordinary Studio drafts and simulation sync. The map-battle command path must consume them through the Keco battle-engine integration; merely storing them in params or a detached registry is insufficient.

### FR-4: Non-destructive catalog import

Applying skill or job drafts merges by normalized ID into the active catalog. An existing ID is replaced deliberately and reported as an update; unrelated active entries remain present. The import operation must not clear the catalog merely because the source table contains one row.

Draft modules retain the ID of the module they extend. Re-applying a draft module merges against that same base module instead of whichever module happens to appear first in persistence.

### FR-5: Source refresh and isolation

Simulation drafts are read from the user-scoped `simulation_skill_drafts.user_id` record. Logout clears the local battle-poc import/module persistence. When a bound source row is deleted or cannot be found during refresh, the draft is marked invalid and excluded from Apply; the last value must not be silently reused.

An empty draft set, a malformed live value, an unsupported value, a duplicate ID, or a remote read failure has the same fail-closed runtime result as a deleted row: remove the affected imported module and Keco skill cache.

Authenticated skill hydrate must also fetch the current user-scoped simulation drafts and re-read every Studio binding. `includeSimulationSync` is a behavioral contract, not a persistence toggle: when enabled, hydrate either installs a freshly validated simulation overlay or clears it with an observable error. A draft with no Studio table binding is invalid and must never be applied from local persistence alone.

Duplicate normalized IDs are rejected from the complete live source table before the import UI selects a row and again during every live refresh. Selecting the first matching row is not a valid ambiguity policy, including for cross-table simulation bindings and collisions introduced after a draft was created.

Supplied enum-like values such as skill category/type, element strength, and equipment stat must be recognized explicitly. Unknown values are errors rather than aliases for a default. Unexpected hydrate exceptions reset both provider state and the corresponding global runtime registry to builtin data.

Keco-owned statuses created by an element/reaction cast must participate in the real map-battle turn flow. DOT damage, freeze/control, buffs, element duration, Keco turn numbers, and battle-core entity state must advance together; tests that call Keco turn helpers directly are not sufficient evidence. Keco turns and statuses do not advance during preparation or after the battle result is final.

A Studio table load that rejects, returns no table, or returns no columns is a visible import error. Unexpected hydrate exceptions in skill, job, and game-config providers reset both provider state and persisted/global runtime state to builtin data.

## Data flow and boundaries

`validateStudioTableForImport` owns table-level checks. Field mappers own parsing and return structured errors. Draft codecs own preservation of source bindings. Module storage owns merge/replace semantics. Registries are the only runtime read path for imported configuration.

## Acceptance tests

1. A `Skills` row containing range, element, DOT, freeze, special effect, and reaction data survives table import, draft validation, Apply, and runtime lookup.
2. A malformed `power`, `mp`, or cooldown value fails validation with the source field and row identified; it does not become a default.
3. A range of `6.2` and a cooldown of `3` remain `6.2` tiles and `3` turns respectively at the table boundary, with one documented tick conversion at runtime; a full Apply/re-registration path yields exactly `30` runtime ticks, never `300`.
4. Applying one imported skill/job leaves unrelated active entries intact and reports ID updates.
5. Editing a registered balance scalar changes the corresponding battle registry calculation immediately.
6. A deleted source row cannot continue to apply its stale draft value.
7. A signed-out session cannot reuse the previous session's local import/module state, and remote simulation drafts are queried by `user_id`.
8. A valid imported skill with `dotDamage` and `dotTurns` applies the Keco DOT status and a subsequent Keco turn resolves its DOT damage.
9. A supplied malformed job number or unsupported `preferredRange` fails with row/field context; duplicate normalized job IDs fail instead of dropping a row.
10. A deleted game-config source row marks its draft invalid and Apply returns an error instead of reusing the previous value.
11. Deleting every local draft removes the previously applied skill/job/config draft module; job and config UIs do not report success for an empty Apply.
12. A recognized optional column imported while blank is still bound and picks up a later Studio value.
13. Re-applying drafts that extend a selected Studio module preserves unrelated entries from that same Studio module.
14. Imported equipment, basic attack, progression, enemy formula, and battle formula values change their real gameplay consumers, not only registry getters.
15. A malformed simulation refresh removes both the simulation module and Keco cache.
16. Cooldowns round-trip according to `cooldownUnit`, including Studio values of 10 turns or more.
17. Authenticated hydrate re-fetches simulation drafts for the current user and restores a freshly validated overlay; signed-out hydrate clears it.
18. A local draft without a Studio table binding is rejected and clears its imported module.
19. Duplicate normalized IDs in a selected Studio table fail before any first-row draft is created.
20. Invalid skill category/type, element strength, and equipment stat values fail with field context instead of becoming defaults.
21. An element-bearing DOT/control skill advances and expires its Keco state through real map-battle commands/ticks.
22. An unexpected provider hydrate failure resets React state, runtime catalogs, registries, and Keco caches to builtin data.
23. A normalized ID collision added after a draft was created invalidates skill, job, game-config, and simulation refreshes before stale data can be applied.
24. A rejected, missing, or columnless game-config table load is surfaced to the import UI and creates no selectable rows.
25. Keco turn/status state remains unchanged during preparation and after a final battle result.
26. Job provider hydrate failure clears persisted Studio job modules as well as the active job registry.

## Verification

Implement test-first with Vitest. Run focused import tests, then `npm test`, `npm run typecheck`, and `npm run build`. Work remains on `rebuild`; no commit is created.
