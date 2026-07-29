# AI Battle V3 Core Loop Remediation Design

## Outcome

Bring the existing V3 from a visually complete prototype to a finishable, interaction-grounded micro-game. Existing defects are fixed first: exploration movement must keep logical and visual position synchronized, encounters must require travel, the offline campaign must be completable, and player-facing battle text must not expose engine tokens. The follow-up iteration makes progression meaningful, AI decisions traceable, defeat useful, and the complete loop demonstrable under the GameCraft-Bench evaluation method.

## Evidence Driving The Work

Fresh verification on commit `7c4cbf7` passed typecheck, 365 tests, production build, and all three V3 Playwright tests. Runtime inspection still found four high-impact gaps:

- movement commits the destination immediately while Phaser moves toward it later, so camera, persistence, encounter prompts, and the sprite can disagree;
- the route list opens preparation from anywhere, bypassing the GDD exploration-and-contact loop;
- all 1,680 ordered four-skill loadouts lose to the final boss in deterministic offline mode, so the default campaign cannot be completed;
- the current behavior-tree node is not traced, while battle and report surfaces still expose values such as `skill`, `accepted`, and `left_win:hp_zero`.

The evaluation follows GameCraft-Bench's build gate and four weighted dimensions: Core Mechanics 15%, Content Depth 35%, Functional Visuals 15%, and Art and Presentation 35%. Browser interactions and screenshots are evidence; passing source-level tests alone is not sufficient.

## Approaches Considered

1. Patch Phaser movement timing and rebalance the boss directly. This is small, but logical state still lives ahead of the rendered actor, remote encounter buttons still bypass exploration, and rewards remain decorative.
2. Add an authoritative grid-travel state machine, reward-derived progression, decision traces, and replay-oriented acceptance evidence. This fixes the causes while preserving the existing runtime/presentation ownership boundaries. This is selected.
3. Move exploration ownership entirely into Phaser and periodically mirror state to React. This could feel smooth, but it makes persistence, deterministic tests, encounter transitions, and browser replay evidence harder to reason about.

## Delivery Order

The work is intentionally staged.

1. Repair existing behavior: synchronized movement, arrival-based encounters, no remote challenge bypass, complete player-facing event text, and a reachable offline campaign.
2. Improve the loop: reward-derived expedition bonuses, visible action/node reasoning, and actionable defeat analysis.
3. Add interaction-grounded evaluation: fixed 1280x720 and mobile scenarios, complete campaign evidence, screenshots, overflow checks, and a traceable GDD matrix.

## Exploration Movement

`src/v3/runtime/exploration.ts` owns pure grid travel. A movement intent produces a route from the last committed cell. Direction input plans one adjacent cell. Click, tap, or route navigation plans a deterministic shortest path. The route excludes the committed start and contains adjacent cells only.

Progress stores only the last cell actually reached. The view model exposes the pending route and current destination. Phaser moves the sprite continuously toward the first pending cell, loops the 12 FPS eight-pose directional walk animation during travel, and emits one arrival event after the sprite reaches that cell. React then commits that cell, removes it from the route, and presents the next cell. A replacement input lets the current leg finish and replans from that leg's destination, avoiding mid-cell snaps.

The camera follows the sprite's rendered world position during exploration rather than the logical target. Encounter detection, local persistence, pickups, coordinate UI, and objective updates occur only on committed arrival. The route list uses `前往` as a navigation command; it never opens preparation directly. Reaching an unlocked encounter opens preparation after the arrival commit. Returning from battle restores or preserves a committed cell, never a visual in-between state.

The current exploration map has no authored collision cells. This iteration keeps it as an intentionally open field and makes that constraint explicit in tests. The path contract accepts blocked cells so authored collision can be added later without changing UI or Phaser ownership.

## Campaign Completion And Progression

The three standard rewards already contain stable EXP, starlight, and drop IDs in Keco. Their gameplay effect is made explicit through a new versioned `V3_Progression` table keyed by stable drop ID. Each row can grant HP, attack, defense, energy, or speed bonuses. The compiled progression type and source fingerprint include those rows.

When standard mode creates a battle, it derives the player's cumulative modifiers from collected drops and embeds the resolved modifier object in `V3BattleConfig`. The engine applies those values when creating the actor. Replay therefore remains deterministic even if campaign progress later changes. Sandbox uses an explicit modifier set and never reads or writes standard progression.

The final-boss target is not “default build always wins.” At least one legal build must win after the three prerequisite rewards, at least one plausible build must still lose, and no pre-boss reward may be granted early. An exhaustive deterministic loadout test gates this balance. Preparation shows the earned expedition bonuses so the player understands why earlier victories matter.

Keco remains the authoring source. `V3_Progression` is created and populated in the existing V3 project first, read back, then reflected in `scripts/v3-content-source.json` and `src/content/generated/v3`. The existing `V3_Rewards` schema remains unchanged and links through `dropId`. Browser runtime remains fully local.

## Decision Trace And Player Language

Behavior-tree evaluation returns both the selected action and a trace containing visited node IDs and the selected action node. The engine records this trace on the action event. It also records rejected proposed actions before applying a safe fallback. Rendering never mutates these records.

A shared player-text formatter owns translations for action kinds, patch statuses, result tokens, rejection codes, node descriptions, and event messages. `V3WorldScene`, `V3Game`, `SpectatorConsole`, and `BattleReport` consume this formatter instead of displaying raw engine messages.

The spectator surface always shows the current action, selected behavior-tree node, and latest strategy result for both actors. Patch operations, source, latency, versions, and raw identifiers stay inside advanced details. The visible summary uses actor and skill names, not internal IDs.

## Defeat Analysis And Report

`src/v3/runtime/battleAnalysis.ts` derives report insights from immutable battle records. It identifies the decisive damage sequence, damage and usage by skill, rejected or fallback actions, ineffective zero-impact actions, and the largest behavior-tree changes. It produces a small set of evidence-backed player suggestions, such as adding mobility when repeated range failures occur or adding defense when burst damage dominates.

The report keeps result, reward, replay, rematch, and return commands. It adds a prominent `下次调整` section on defeat and a `制胜关键` section on victory. Timeline rows use translated labels and messages. Advanced details retain seed, rules, visual, content, model, and tree versions plus exact operations. Replay continues to consume recorded patches rather than requesting the network.

## Error Handling

- Unreachable click targets preserve the current committed position and show no false route or encounter.
- Duplicate arrival callbacks are idempotent and cannot skip cells or open preparation twice.
- New movement input during a leg cannot teleport or persist an unvisited cell.
- Invalid progression bonuses fail content validation and block battle start with a precise error.
- Offline or malformed LLM results continue through the deterministic fallback and remain visibly labeled.
- An invalid action is recorded before fallback so the report does not hide why behavior changed.

## Testing And Acceptance

TDD covers each defect before implementation.

- Pure movement tests verify adjacency, deterministic routes, blocked/unreachable targets, one-cell commits, replanning, and idempotent arrival.
- Presentation tests verify camera follow uses rendered position, movement stays active across multiple gait frames, and encounter callbacks occur only after arrival.
- Campaign tests exhaust all ordered four-skill loadouts for the final boss before and after progression, proving at least one post-progression win and at least one loss.
- Engine tests verify modifier embedding, replay equivalence, selected-node traces, invalid-action events, and translated formatter output.
- UI tests verify navigation replaces remote preparation, bonuses are visible, current nodes remain visible, report advice is evidence-backed, and raw engine tokens do not appear.
- Playwright runs against the production build at 1280x720 and 390x844. It demonstrates actual travel into an encounter, a standard defeat and adjusted rematch, three prerequisite victories, boss unlock and victory, sandbox isolation, replay, no horizontal overflow, nonblank canvas, no failed assets, and no runtime Keco/Supabase requests.

Evaluation evidence is written to `docs/evaluations/v3-gamecraft-report.md` with a GDD traceability matrix, category scores, commands, screenshots, remaining limitations, and the new visual fingerprint.

## Scope Boundaries

This iteration does not add online PvP, new PixelLab art, audio, a second player class, a new map, manual combat controls, runtime Keco access, or a general-purpose quest system. Existing generated art remains unchanged unless testing finds an actual broken asset. Legacy behavior is preserved apart from shared build verification.
