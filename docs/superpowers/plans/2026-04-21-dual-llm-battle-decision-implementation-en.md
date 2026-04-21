# Dual-Side LLM Battle Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable both battle actors (`left` and `right`) in `battle-poc` to make decisions via LLM while keeping rule execution safe, deterministic, and non-blocking with fallback.

**Architecture:** Add a `service` decision layer (LLM request, short-term memory, validation, orchestration) and keep the existing `battle-core/engine` execution layer unchanged; orchestrator triggers decision and enqueue after each tick.

**Tech Stack:** TypeScript, battle-core engine, provider adapter (DeepSeek/Zhipu), Vitest

---

## 1) Scope and Principles

- [ ] **Scope confirmation: both sides use LLM**
  - Cover both actors: `left` and `right`.
  - If one side fails, fallback must be immediate and must not block the loop.

- [ ] **Single source of truth for rules**
  - `command-processor.ts` remains the only state mutation entry.
  - LLM can only output command intent, never mutate session directly.

- [ ] **MVP-first strategy**
  - Start with JSON output contract (no DSL compiler in MVP).
  - Start with short-term memory (current battle window), defer long-term memory.
  - Start with one provider, then expand provider routing.

---

## 2) Target File Structure

**Files:**
- Create: `src/battle-core/service/battle-core-orchestrator.ts`
- Create: `src/battle-core/service/auto-decision-engine.ts`
- Create: `src/battle-core/service/dynamic-strategy-validator.ts`
- Create: `src/battle-core/service/short-term-memory.ts`
- Modify: `src/map-battle/MapBattleController.ts`
- Test: `tests/integration/dual-llm-battle-decision.spec.ts`
- Test: `src/battle-core/service/__tests__/*.test.ts`

---

## 3) Core Runtime Sequence

- [ ] **Fixed tick sequence**
  1. `orchestrator` loads session.
  2. Call `tick-engine.tick(session)` to advance and execute queued commands.
  3. Analyze newly created events (`action_executed`/`command_rejected`/`battle_ended`).
  4. Evaluate whether each actor needs a new decision.
  5. Build short-term context and request LLM decision.
  6. Normalize decision to legal `BattleCommand` via validator.
  7. Enqueue with `enqueueBattleCommand` and persist.

- [ ] **Trigger conditions**
  - Actor is alive and session is `ongoing`.
  - No future command exists for that actor.
  - Actor is not in decision cooldown/circuit-breaker window.

- [ ] **Suppression conditions**
  - Same actor already requested a decision in current tick.
  - Circuit breaker is active after repeated failures.

---

## 4) Responsibilities and Interfaces

### Task 1: Build orchestrator layer

**Files:**
- Create: `src/battle-core/service/battle-core-orchestrator.ts`

- [ ] **Step 1: Define orchestrator I/O**
  - Input includes sessionId, provider config, and mode flags (`dual_llm`).
  - Output includes updated session, decision stats, fallback stats.

- [ ] **Step 2: Implement `advanceTick` pipeline**
  - Trigger decision for both sides after `tick-engine`.
  - Short-circuit immediately if battle already ended.

- [ ] **Step 3: Add per-actor decision gate**
  - `shouldRequestDecision(session, actorId)`.
  - Check queued future command, alive state, control effects, circuit breaker.

### Task 2: Build auto-decision-engine

**Files:**
- Create: `src/battle-core/service/auto-decision-engine.ts`

- [ ] **Step 1: Define provider adapter contract**
  - `requestDecision(context): Promise<RawDecision>`.
  - Abstract provider name, timeout, retry, and model params.

- [ ] **Step 2: Design prompt and output contract**
  - Input: state snapshot, available skills, opponent info, short memory, allowed actions.
  - Output JSON: `action`, `targetId?`, `skillId?`, `metadata?`.

- [ ] **Step 3: Add fault tolerance**
  - Timeout (recommended 300-500ms).
  - Parse errors / missing fields return structured error for validator fallback.

### Task 3: Build dynamic-strategy-validator

**Files:**
- Create: `src/battle-core/service/dynamic-strategy-validator.ts`

- [ ] **Step 1: Normalize and validate**
  - Action whitelist check.
  - Target existence/alive check.
  - Skill equipped/cd/mp/range pre-check for `cast_skill`.
  - Boundary clamp for dash/flee metadata.

- [ ] **Step 2: Return unified result type**
  - `ok: true` => legal command.
  - `ok: false` => reason + fallback command.

- [ ] **Step 3: Define fallback policy**
  - In melee range: `basic_attack`
  - Can approach: `dash`
  - No effective offense: `defend`
  - Optional tactical retreat: `flee` (feature flag)

### Task 4: Build short-term-memory module

**Files:**
- Create: `src/battle-core/service/short-term-memory.ts`

- [ ] **Step 1: Implement event window extraction**
  - Extract recent N events from `session.events` (suggest 8-12).

- [ ] **Step 2: Produce decision summary**
  - Recent action chain, rejection reason counters, resource deltas, distance trend.

- [ ] **Step 3: Output LLM-friendly context**
  - Provide both textual summary and structured fields for stable model behavior.

### Task 5: Integrate into map-battle controller

**Files:**
- Modify: `src/map-battle/MapBattleController.ts`

- [ ] **Step 1: Introduce orchestrator entry**
  - Replace hardcoded dual-side intent branches with `orchestrator.advanceTick(...)`.

- [ ] **Step 2: Keep feature flags**
  - Support both `manual` (legacy) and `dual_llm` (new) modes.

- [ ] **Step 3: Keep UI compatibility**
  - Preserve event structure so existing rendering logic remains unchanged.

---

## 5) Stability and Safety Guards

- [ ] **Anti-loop controls**
  - Force fallback after 2 consecutive `command_rejected` for same actor.
  - Temporarily ban repeated failing action after 3 failures.

- [ ] **Rate limiting and budget**
  - Minimum decision interval per actor (1-2 ticks).
  - Max decisions per tick to avoid request storm.

- [ ] **Failure isolation**
  - Provider timeout/error/empty output must not throw into main loop.
  - All failures degrade to fallback and emit observability logs.

---

## 6) Test and Verification Plan

### Task 6: Unit tests

**Files:**
- Test: `src/battle-core/service/__tests__/dynamic-strategy-validator.test.ts`
- Test: `src/battle-core/service/__tests__/short-term-memory.test.ts`
- Test: `src/battle-core/service/__tests__/auto-decision-engine.test.ts`

- [ ] **Step 1: Validator cases**
  - Invalid action, invalid target, unavailable skill, out-of-range, insufficient resources.

- [ ] **Step 2: Memory cases**
  - Window boundaries, summary integrity, trend correctness.

- [ ] **Step 3: Decision engine cases**
  - Timeout, malformed JSON, provider error, normal response.

### Task 7: Integration tests

**Files:**
- Test: `tests/integration/dual-llm-battle-decision.spec.ts`

- [ ] **Step 1: Dual-side happy path**
  - Both sides continuously produce actions and battle can terminate.

- [ ] **Step 2: One-side failure fallback**
  - One provider path fails but tick loop continues.

- [ ] **Step 3: Anti-loop validation**
  - Repeated rejection triggers fallback/circuit breaker.

### Task 8: Regression verification

- [ ] **Step 1: Run core suite**
  - Run: `npx vitest run`
  - Expected: all green, no regressions.

- [ ] **Step 2: Smoke checks**
  - Inspect action/reject/fallback ratio from battle logs.

---

## 7) Observability Design

- [ ] **Metrics**
  - `decision_latency_ms`
  - `decision_success_rate`
  - `validator_reject_rate`
  - `fallback_rate`
  - `commands_per_tick`

- [ ] **Log context**
  - `sessionId`, `actorId`, `tick`, `provider`, `reason`.

- [ ] **Initial rollout thresholds**
  - `fallback_rate` < 35%
  - `validator_reject_rate` < 25%

---

## 8) Rollout Strategy

- [ ] **Phase A: Dev integration**
  - Run full dual-side flow with mocked provider locally.

- [ ] **Phase B: Limited rollout**
  - Enable `dual_llm` for test battles.
  - Compare stability and duration against manual mode.

- [ ] **Phase C: Default enablement**
  - Switch default to `dual_llm` after metrics stabilize.

---

## 9) Definition of Done

- [ ] Both sides are driven by LLM and can sustain a full battle.
- [ ] Any LLM/provider failure does not interrupt battle progression.
- [ ] No obvious idle lock/reject spam loops in normal play.
- [ ] Key metrics are observable and tests pass.
- [ ] `manual` and `dual_llm` modes are both available for rollback.
