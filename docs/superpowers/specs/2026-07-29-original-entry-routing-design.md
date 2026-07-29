# Original Entry Routing Design

## Goal

Restore the original map-based game interface as the application root while preserving EMBER//NULL as a separately accessible experience.

## Routing

- `/` renders the existing map game through `useGameState`, `GameMap`, and the existing overlay panels.
- `/ember-null` renders the existing `EmberNullGame` implementation without changing its gameplay or assets.
- The root layout uses the general Battle Demo metadata. The EMBER//NULL route supplies its own route metadata.

## Runtime Boundaries

- Keep the current `BattleRuntimeProviders` stack unchanged.
- Keep the Supabase provider import and wrapper commented out.
- Do not modify game data, LLM decision logic, Pixellab assets, API keys, or remote services.

## Verification

- Run TypeScript type checking.
- Run the existing Vitest suite.
- Build the Next.js application.
- Verify that `/` and `/ember-null` both render successfully.

