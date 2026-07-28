# VS01 Ember Relay Implementation Plan

## 1. Author And Validate Keco Content

- Create the nine versioned `VS01_*` tables without modifying existing tables.
- Fill jobs, skills, enemies, maps, encounters, progression, assets, game metadata, and rubric rows.
- Read every table back and validate IDs and references.

## 2. Compile Static Runtime Content

- Add typed VS01 modules under `src/content/generated/vs01`.
- Populate the existing generated skill, job, config, and provenance exports.
- Add a deterministic content validator and tests for the compiled graph.

## 3. Generate Local Art

- Generate five character sprites, two map backgrounds, and eight skill-effect images with PixelLab.
- Store only local PNGs and a reproducible manifest in `public/assets/generated/vs01`.
- Verify dimensions, transparency where required, and HTTP availability.

## 4. Connect The Vertical Slice

- Add VS01 static maps to map listing and loading routes.
- Pass stable enemy template IDs and enemy skill IDs through the map battle start path.
- Resolve generated character and skill FX paths in the existing rendering layer.
- Add local campaign progression and a compact objective/map-selection surface.

## 5. Verify And Score

- Run focused unit tests, TypeScript checks, the production build, and browser smoke tests.
- Check generated assets, map entry, combat start, persistence, and absence of Supabase requests.
- Capture desktop and mobile evidence and write `docs/evaluations/vs01-baseline.md` using the weighted rubric.

