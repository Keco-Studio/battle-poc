# AI Battle V3 Evaluation

Date: 2026-07-29
Branch: `v3`

## Scope

- Default route: V3 Starbright Frontier loop
- Legacy route: `/legacy`
- Loop: 32x20 exploration -> preparation -> 16x16 automatic dual-AI battle -> report/replay
- Standard and sandbox progression remain isolated
- Browser runtime uses compiled local content and assets only

## Authored Data

- Keco project: `battle-poc`
- Project ID: `fc3376fb-b6b8-42b0-8a16-459916e41da2`
- V3 source document ID: `c29ee604-f82b-487d-85fa-f1b36635a530`
- Tables: `V3_Game` 1, `V3_Jobs` 1, `V3_Skills` 8, `V3_Enemies` 4, `V3_Maps` 3, `V3_Encounters` 4, `V3_BehaviorTrees` 4, `V3_Rewards` 4, `V3_Rulesets` 1, `V3_Assets` 24

## Fingerprints

- Content: `e1a94f10d78a48a3ed12bcabfedcc06fea6700c96aac9429438cc73c3ff78973`
- Visual: `1a461d39315100837ea46cac1437de5d92d69dc0f7e8c2b618691322ff46b4e0`
- Ruleset: `v3-rules-1`
- Visual version: `v3-pixellab-1`

## PixelLab Inventory

- 3 map images
- 5 character references
- 40 directional character sheets
- 320 distinct character frames
- 8 skill icons
- 8 skill effect sheets
- 64 distinct effect frames
- 64 direct manifest provenance rows
- West, southwest, and northwest frames are pixel-perfect mirrors of east, southeast, and northeast

## Acceptance Evidence

- Desktop viewport: 1440x900, no horizontal overflow, nonblank Phaser canvas, standard loop completes at deterministic seed 7319.
- Mobile viewport: 390x844, full battle arena is centered and contained, no horizontal overflow, status/decision/timeline controls remain readable.
- Standard evidence: first encounter reaches `left_win`, grants 45 EXP and 30 starlight, and stores one cleared encounter.
- Sandbox evidence: victory writes no starlight, cleared encounters, rewards, or standard records.
- Replay evidence: accepted Patch history replays from Tick 0 without network decisions and returns the same terminal state.
- Offline evidence: online AI is opt-in; default runtime records labeled deterministic fallback decisions without 503 browser noise.

## Commands

```bash
npm run typecheck
npm test
npm run build
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 npx playwright test tests/integration/v3.spec.ts --reporter=line
```

## Known Limitations

- The optional live decision proxy must be started separately and enabled with `NEXT_PUBLIC_V3_AI_ENABLED=1`; the default local experience deliberately uses deterministic fallback.
- Browser-engine release gating is Chromium-based in automation. Firefox/WebKit and a physical touch device remain a manual release matrix item.
