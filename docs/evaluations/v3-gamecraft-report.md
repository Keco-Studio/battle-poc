# AI Battle V3 GameCraft-Bench Evaluation

Date: 2026-07-29
Branch: `v3`
Production route: `/`
Legacy route: `/legacy`

## Result

- Build gate: **PASS**
- Weighted GameCraft-Bench score: **90.6 / 100**
- Core Mechanics: 92 / 100, weighted 13.8
- Content Depth: 88 / 100, weighted 30.8
- Functional Visuals: 94 / 100, weighted 14.1
- Art and Presentation: 91 / 100, weighted 31.9
- Formula: `BUILD x (15% Mechanics + 35% Content Depth + 15% Functional Visuals + 35% Art/Presentation)`

The score is based on production-browser interaction, deterministic engine tests, local asset checks, and inspected screenshots. It is not based only on source inspection.

## Fixed Defects

- Exploration now commits one physically reached cell at a time. HUD, persistence, camera, encounters, and the Phaser sprite share the same arrival boundary.
- Route-list actions navigate through the world and cannot open an encounter remotely.
- Standard rewards now grant authored HP, energy, attack, defense, and speed bonuses. Sandbox battles use zero bonuses and write no campaign progress.
- The final boss is finishable offline. The browser-fallback regression build is `日耀枪 / 繁花守御 / 晴风步 / 回响弹` after earning all three prerequisite drops.
- AI actions retain visited behavior nodes, selected action nodes, rejected proposals, and fallback reasons.
- Player surfaces no longer expose raw action, result, rejection, patch, or node tokens.
- Victory reports show evidence-backed strengths. Defeat and draw reports show evidence-backed adjustments.
- Character source metadata now matches the delivered eight-direction, eight-frame, 12 FPS walk cycles.

## GDD Traceability

| GDD requirement | Implementation evidence | Verification evidence |
|---|---|---|
| Manual exploration before encounters | Authoritative route state and Phaser arrival bridge | `v3-exploration.test.ts`; intermediate-cell Playwright scenario |
| Real continuous character walking | 8 directions x 8 independent frames at 12 FPS | asset/content tests; `exploration-travel.png` |
| Pre-battle AI construction | Four skill slots, behavior preset, model selector, standard/sandbox modes | UI tests; preparation screenshots |
| Automatic dual-AI battle | Deterministic tick engine, guardrails, behavior-tree patches | battle, decision, and replay tests |
| Visible AI reasoning | Per-actor current action, selected reasoning, patch state | trace tests; mobile battle screenshot |
| Campaign progression | Three Keco-authored drop bonuses and boss unlock | campaign/content tests; boss preparation scenario |
| Finishable final challenge | Embedded cumulative modifiers and browser-fallback winning build | exhaustive 1,680-loadout test; offline-decision boss test; boss Playwright scenario |
| Replayable report | Frozen modifiers and content/rules/visual/model versions | replay test; boss deterministic replay scenario |
| Useful defeat feedback | Pure event aggregation and observed-cause advice | battle-analysis tests; `sunforge-defeat.png` |
| Local runtime | Compiled content/assets; no browser Keco, PixelLab, Supabase, or external request | request capture, asset response capture, production build |

## Keco Readback

Authoritative project: `fc3376fb-b6b8-42b0-8a16-459916e41da2`
Authoritative V3 folder table: `V3_Progression` / `e696dc72-e605-421d-b297-9816b1d50c8c`

Readback returned exactly three rows:

| id | dropId | HP | EN | ATK | DEF | SPD |
|---|---|---:|---:|---:|---:|---:|
| `progression_bloom` | `bloom_core` | 12 | 0 | 0 | 2 | 0 |
| `progression_sunforge` | `sunforge_coil` | 0 | 0 | 4 | 0 | 1 |
| `progression_prism` | `prism_lens` | 6 | 20 | 0 | 1 | 0 |

The compiled cumulative prerequisite bonus is HP +18, EN +20, ATK +4, DEF +3, SPD +1. The source and runtime reference only the V3-folder table above. An empty root-level setup table named `V3_Progression` (`21f1fc0b-b35b-4a3e-bd46-9b074cf963ee`) is not referenced.

## Fingerprints

- Content: `f20b0f0b8e598e0cf60e4f9d5128d860d0d3d05f6226df925bf93531d3930f2a`
- Visual: `413a10ec9007ae69632d68743b93527a909616d94fedb48de613a9242affd580`
- Ruleset: `v3-rules-1`
- Visual version: `v3-pixellab-1`

## Interaction Evidence

- `test-results/v3-gamecraft/exploration-travel.png`
- `test-results/v3-gamecraft/boss-preparation.png`
- `test-results/v3-gamecraft/sunforge-defeat.png`
- `test-results/v3-gamecraft/sunforge-adjusted-victory.png`
- `test-results/v3-gamecraft/boss-victory.png`
- `test-results/v3-gamecraft/mobile-battle.png`

Desktop evidence uses 1280x720. Mobile evidence uses 390x844. Canvas pixel variance is nonzero, loaded V3 assets return successful responses, mobile horizontal overflow is zero, and captured runtime requests remain same-origin.

## Verification Commands

```bash
node scripts/validate-v3-content.mjs
npm run typecheck
npm test
npm run build
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 npx playwright test tests/integration/v3.spec.ts tests/integration/v3-gamecraft.spec.ts --reporter=line
```

## Residual Limits

- Automated browser gating is Chromium-based; Firefox, WebKit, and a physical touch device are not part of this run.
- The optional online model route is intentionally opt-in and was not evaluated. The complete campaign is verified through the deterministic offline route.
- The browser boss scenario loads a schema-valid state containing the three earned prerequisite rewards; the three standard outcome transitions themselves are separately covered by deterministic campaign tests.
- V3 is a focused one-job, four-encounter campaign rather than the GDD's possible long-term multi-region scope.
