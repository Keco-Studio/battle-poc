# AI Battle V3 Design

## Outcome

V3 delivers the GDD's complete local MVP loop as the default experience: manual exploration, encounter confirmation, pre-battle AI construction, deterministic 1v1 auto-battle, and a replayable post-battle report. Runtime content is compiled into the repository and never reads Keco, PixelLab, Supabase, or another database from the browser.

## Chosen Approach

Three approaches were considered:

1. Extend the current `GameMap` component. This reuses the most code, but its exploration, combat, account, import, and presentation responsibilities are already tightly coupled. Adding the GDD state machine there would increase regression risk and make replay determinism difficult to test.
2. Build a bounded V3 runtime and make it the default route while preserving the current experience at `/legacy`. This keeps the requested main-based history, reuses Phaser and the local AI proxy contract, and gives V3 explicit ownership boundaries. This is the selected approach.
3. Replace the battle core and every legacy screen. This would produce a cleaner repository eventually, but it expands the work beyond the GDD MVP and risks breaking unrelated import and account flows.

## Experience

The theme is **Starbright Frontier**, an optimistic pixel-RPG expedition through a colorful signal garden built over ancient AI ruins. The palette uses sky cyan, leaf green, warm gold, coral red, clean violet, and dark ink for contrast. The tone is adventurous and energetic rather than industrial or grim.

The player controls the Astra Vanguard in a 32x20 exploration field. Movement is manual through keyboard, click/tap, or an on-screen directional pad. The map contains a safe beacon, resource pickups, three standard encounters, and a gate encounter. Touching an encounter opens preparation instead of immediately starting combat.

Preparation shows a 16x16 arena preview, enemy read-only data in standard mode, the player's four equipped skills, a behavior-tree priority list, and an LLM profile. Developer sandbox mode can edit both sides and is visibly marked; it never writes campaign rewards or standard records.

Battle is fully automatic. After each complete Action, both actors enter a decision Tick. Each director receives the authoritative snapshot and current tree, then submits a constrained Patch. Accepted, rejected, timed-out, and stale Patches are recorded. The behavior tree selects one Action, the guardrail validates it, and the deterministic engine executes it. The viewer can pause, step one Action, and select 0.5x, 1x, 2x, or 4x speed without changing simulation rules.

The report includes result, end reason, total Tick count, seed, content/rules/visual/model versions, damage and healing totals, every Action, every Patch, initial/final trees, and deterministic replay. Victory awards starlight and experience, restores battle resources, and marks the encounter cleared. Defeat restores the player at the safe beacon.

## Architecture

`app/page.tsx` renders the V3 client. The existing home experience moves to `app/legacy/page.tsx` without changing its internal modules.

`src/v3/runtime` owns the phase state machine, pure battle engine, behavior-tree evaluator, Patch validator, seeded RNG, replay reducer, progression schema, and optional LLM decision client. The battle engine is the only writer of HP, energy, cooldowns, status effects, positions, Tick, and result. The behavior-tree reducer is the only writer of tree state.

`src/v3/presentation` owns Phaser scenes and animation playback. It consumes immutable view models and emits player exploration intent or viewer controls; it never mutates authoritative battle state.

`src/v3/ui` owns React work surfaces for exploration HUD, preparation, spectator console, and report. It does not contain authored combat values.

`src/content/generated/v3` is the only runtime source for jobs, skills, enemies, maps, encounters, rewards, trees, rules, assets, and provenance. Data is authored through Keco Account, read back, validated, fingerprinted, and then compiled into TypeScript.

`public/assets/v3` contains PixelLab source images, 8-frame directional animation sheets, the extracted per-frame PNGs, skill icons, animated skill FX sheets, maps, and a reproducible manifest.

## Decision Flow

Each actor has `decisionTick`, `treeVersion`, and `pendingRequestId`. A Patch is accepted only when its actor, decision Tick, base tree version, operation count, node IDs, and referenced skills are valid. Late results are retained as evidence with `stale` status but are never applied.

The live decision path calls the local server route, which forwards to the configured local AI proxy. MiniMax M2.1 is the default profile. If the proxy is unavailable or times out, a seeded deterministic director produces a legal Patch or preserves the current tree. This fallback is labeled in the UI and replay record.

The fallback Action order is: legal configured skill, basic attack in range, move toward a reachable attack tile, guard, then wait. Repeated rejected or zero-impact Actions cause the evaluator to skip the offending branch for the next Tick. At the configured maximum Tick count, surviving actors produce a draw.

## Content Scope

V3 contains one playable job, four enemy templates including a gate boss, eight player-usable skills, four behavior-tree presets, one exploration map, two battle arenas, four encounters, four rewards, and one ruleset. The first three victories unlock the boss gate.

Every character has eight directional movement animations with eight real sequential PixelLab frames per direction. East-facing generations may be mirrored for west-facing variants, but every shipped direction remains an eight-frame sequence. Every skill has a readable icon and an eight-frame effect animation.

## Visual System

STYLE FORMULA:

`optimistic 32-bit tactical RPG pixel art, low top-down three-quarter view, crisp 1-pixel clusters, lively readable silhouettes, controlled colorful palette of sky cyan, leaf green, warm gold, coral red, clean violet and deep ink, bright natural lighting, no antialiasing, no gradients, no text, readable at 64 pixels`

UI uses deep ink only as a framing color. Panels are compact, square-edged, and information-dense. Blue identifies the player, coral identifies the opponent, green identifies accepted execution, gold identifies waiting or warnings, and violet identifies LLM or behavior-tree changes. The battlefield remains the largest element in spectator mode.

## Error Handling

Missing visual assets fall back to a checked pixel silhouette and are reported in the manifest test. Invalid content blocks battle start with exact missing references. LLM failures never block battle completion. Corrupt local progress resets only the V3 progress record. Unrecoverable engine invariants end the run as `invalid` and exclude rewards.

## Testing

Pure Vitest coverage verifies content references, seeded determinism, Action guardrails, Patch version rejection, timeout fallback, max-Tick draws, reward isolation, replay equivalence, and anti-loop behavior.

Playwright verifies the full standard path, sandbox isolation, keyboard exploration, touch controls at 390x844, preparation validation, pause/step/speed controls, report filters, replay, asset loading, and absence of runtime Keco/Supabase requests. Desktop and mobile screenshots are reviewed for nonblank Phaser canvases, text overflow, overlap, and pixel asset framing.

## Scope Boundaries

V3 does not add online PvP, ranked play, manual combat actions, fleeing, runtime MCP access, runtime PixelLab access, or Supabase persistence. Existing legacy account and import code remains available under `/legacy` but is not part of the V3 loop.
