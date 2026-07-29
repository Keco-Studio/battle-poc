# AI Battle V3 Evaluation

Date: 2026-07-29
Branch: `v3`

## Scope

- V3 is the default route at `/`; the previous app remains at `/legacy` with two-way navigation.
- The complete local loop is exploration, encounter arrival, preparation, dual-AI battle, report, and deterministic replay.
- Standard progression and sandbox tests remain isolated.
- Browser runtime consumes only compiled local content and assets.

## Authored Data

- Keco project: `fc3376fb-b6b8-42b0-8a16-459916e41da2`
- V3 source document: `c29ee604-f82b-487d-85fa-f1b36635a530`
- Progression table: `e696dc72-e605-421d-b297-9816b1d50c8c`
- Delivered scope: 1 job, 8 skills, 4 enemies, 3 maps, 4 encounters, 4 behavior trees, 4 rewards, 3 progression rows, 1 ruleset, and 24 asset records.

## Fingerprints

- Content: `f20b0f0b8e598e0cf60e4f9d5128d860d0d3d05f6226df925bf93531d3930f2a`
- Visual: `413a10ec9007ae69632d68743b93527a909616d94fedb48de613a9242affd580`
- Ruleset: `v3-rules-1`
- Visual version: `v3-pixellab-1`

## Acceptance

- Exploration position is committed only after physical cell arrival, with deterministic multi-cell routing.
- Five characters each provide eight directions, eight independent frames per direction, and 12 FPS walking.
- The campaign boss is finishable after applying three earned progression bonuses.
- Battle events expose player-facing actions and reasoning without raw engine tokens.
- Reports provide deterministic replay plus evidence-based victory or defeat insights.
- Production desktop and mobile browser scenarios verify canvas pixels, successful assets, local requests, and zero mobile horizontal overflow.

Full scoring, traceability, Keco readback, commands, screenshots, and residual limits are recorded in `docs/evaluations/v3-gamecraft-report.md`.
