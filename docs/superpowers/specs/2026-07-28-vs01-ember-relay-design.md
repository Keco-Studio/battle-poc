# VS01 Ember Relay Design

## Goal

Deliver a self-contained 15-20 minute browser-game vertical slice whose authored data is created in the existing Keco `battle-poc` project, validated by complete MCP readback, and compiled into this repository. Runtime gameplay must not depend on Keco, PixelLab, Supabase, or any other database.

## Theme

Ember Relay is a dark industrial-fantasy outpost built from basalt and broken machinery. Teal relay glyphs communicate navigation and safe space; ember red communicates pressure and damage; ice blue communicates control. Gameplay readability takes priority over ornament.

The player is the Relay Warden. They clear Emberwatch Causeway of three hostile archetypes, unlock the Ashen Relay Core, and defeat the Null Custodian.

## Content Scope

- One job: Relay Warden.
- Eight player skills using mechanics already supported by the battle engine.
- Three standard enemies and one boss, each with stable template IDs and authored skill loadouts.
- Two maps with local bitmap backgrounds and local character sprites.
- Browser-local progression: defeat the three Causeway archetypes, unlock the Relay Core, defeat the boss.
- Eight local skill-effect images used by the combat presentation layer.

## Boundaries And Ownership

### Authored content

Keco owns the editable development source. Nine `VS01_*` tables are versioned with `contentVersion = "vs01"`. Cross-table relationships use stable string IDs, not Keco row UUIDs.

After every content update, the complete table set is read back and validated for duplicate IDs and dangling references. Only validated data may be written to `src/content/generated/vs01`.

### Runtime content

TypeScript modules under `src/content/generated/vs01` and PNG files under `public/assets/generated/vs01` are the only VS01 runtime content sources. API routes may expose these modules to the browser, but they must not query a database.

### Runtime state

Combat state remains owned by the existing map-battle controller and game-state hook. VS01 campaign progress has one writer, a small local-storage-backed progression module. Defeated template IDs, map unlock, and completion state are derived from that record.

### Presentation

Map and entity art is selected by stable asset IDs. Skill events resolve to a local FX URL in addition to the existing CSS projectile classification. Missing generated assets retain existing fallbacks so a presentation failure cannot break combat.

## State Flow

1. `/api/maps` lists VS01 maps before legacy built-in maps.
2. `/api/airpg-map` resolves a VS01 map from static code, then falls back to legacy JSON maps.
3. The map response includes stable enemy `templateId` and `skillIds`.
4. Starting combat passes the selected enemy loadout to `createMapBattleSession`.
5. Victory records the enemy template ID locally.
6. The first three template victories unlock the boss map; the boss victory completes VS01.

## Evaluation

The build gate is mandatory. A failed production build scores zero. A passing build is scored with the GameCraft-Bench weighting used by the referenced paper:

- Mechanics: 15%.
- Content depth: 35%.
- Functional visuals: 15%.
- Art and presentation: 35%.

MiniMax-M2.1 remains the game decision model and supplies structured combat/log evidence. Browser screenshots and runtime checks supply visual evidence. The baseline report records both evidence sources and does not claim image understanding from MiniMax.

## Non-Goals

- No Supabase schema, data, or remote operation.
- No runtime Keco or PixelLab calls.
- No account, cloud-save, PvP, or backend feature expansion.
- No redesign of the core LLM decision contract in VS01 baseline.

