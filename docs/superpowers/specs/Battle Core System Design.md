# Battle Core Complete Development Documentation (V2)

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Core Concepts](#core-concepts)
4. [Technology Stack](#technology-stack)
5. [Module Details](#module-details)
6. [Data Flow](#data-flow)
7. [AI Decision System](#ai-decision-system)
8. [Memory System](#memory-system)
9. [State Machine](#state-machine)
10. [Configuration & Balance](#configuration--balance)
11. [API Interface](#api-interface)
12. [Development Guide](#development-guide)
13. [Deployment Guide](#deployment-guide)
14. [FAQ](#faq)
15. [Version History](#version-history)

---

## Project Overview

Battle Core is an **LLM-based intelligent combat decision system** supporting 1v1 character battles. Core features include:

- **AI-Driven Decisions**: Utilizes Large Language Models (LLM) to analyze combat situations and select tactics in real-time
- **Memory Learning**: Short-term memory (current battle) + Long-term memory (cross-session experience based on vector database)
- **Dynamic Strategies**: LLM can create multi-turn tactical sequences (probe → retreat → counter-attack)
- **Safe & Controllable**: Multiple guardrails ensure AI doesn't go out of control
- **Resource System**: HP/MP/Shield/Rage adding combat depth
- **Extensible**: Configurable skills, strategies, and characters

### V2 New Features

```
├── Unified Rules Interface: GET /api/battle-core/rules provides actions, damage, victory rules - frontend/backend share same source
├── Skill Import System: POST /api/battle-core/skills/import supports incremental skill configuration, no more hardcoding
├── Frontend Phaser Rendering: Replaces pure CSS with professional 2D game engine (maps, entities, effects)
├── AI-RPG/Keco Integration: Maps from AI-RPG, character configs from Keco - complete creative pipeline
├── Chase State Machine Visualization: Frontend chase overlay displays pursuit progress in real-time
├── Dynamic Strategy DSL Enhancement: LLM can generate multi-phase tactics (probe→retreat→counter), validated by validator before execution
├── Memory System Fault Tolerance: VictorDB write/retrieval failures fail-open, doesn't block combat
└── Guardrail System Upgrade: Anti-loop detects repetitive behaviors, dynamic strategy validator normalizes actions/skills
```

### Design Philosophy

```
Give LLM creativity, but always within safe boundaries
- Building blocks (action types, skills) are fixed
- Combinations (tactical sequences, trigger conditions) are unlimited
- Results cannot exceed the physical limits of the building blocks
- Quality inspectors (guardrails) check throughout the process
```

---

## System Architecture

### Layered Architecture Diagram

```
Frontend Layer (Display & Interaction)
├── demoWorld/index.tsx (Page Orchestration)
│   ├── Session Orchestration (create/auto-sim/poll)
│   ├── Event Consumption & Log Assembly
│   └── Calls runtime/fx/event-player submodules
├── battle-event-player.ts
│   └── BattleEvent -> Action Performance (attack/skill/defend/flee/freeze/end)
├── engine-mount.ts
│   └── Phaser Scene Mounting (map, entities, HP/MP bars, chase overlay)
├── engine-runtime.ts
│   └── Coordinate Sync/Resource Bar Sync/Chase Visualization Sync
├── engine-fx.ts
│   └── Hit Effects, Camera Shake, Hit-stop, Freeze Visuals
└── components/BattleLogPanel.tsx
    └── Battle Log Panel (source, action, turn)

Controller Layer (Backend API)
├── BattleCoreController (/api/battle-core/...)
│   ├── Route Distribution, Request Validation, Response Formatting
│   ├── /rules (Unified Rules Interface)
│   ├── /skills, /skills/import (Skill Definition Interfaces)
│   └── /view (Debug/Visual Reference Page)
└── DemoIntegrationController (/api/demo-integration/...)
    └── ai-rpg / keco / dialogue import & integration

Service Layer (Orchestration & Decision)
├── battle-core.ts (Combat Service Orchestration)
│   ├── Session Management
│   ├── Auto Decision Scheduling
│   └── Memory System Coordination (Short-term + Long-term)
├── auto-decision-engine.ts
│   ├── LLM Requests
│   ├── Dynamic DSL Execution
│   └── Fallback & Anti-loop Guardrails
└── dynamic-strategy-validator.ts
    └── LLM Action/Skill Normalization & Legality Correction

Engine Layer (Deterministic Simulation)
├── TickEngine
│   ├── CommandProcessor (Command Execution)
│   └── EffectProcessor (Freeze/Status Effects)
└── BattleEvent Stream (for Frontend Replay)

Domain Layer (Combat Models)
├── BattleEntity (Resources/Position/SkillSlots/Status)
└── BattleSession (Command Queue/Events/Result)

Infra Layer (Storage & Vector Retrieval)
├── SessionStore (Session Storage)
└── VictorMemoryRepository
    ├── PostgreSQL + pgvector(BattleMemory)
    └── Embedding Calls (Qwen priority, LLAMA_URL fallback)
```

### Module Dependencies

```
battle-core/
├── index.ts                    # Main Entry
├── application/
│   └── controllers/
│       ├── battle-core.ts      # Battle Controller
│       └── demo-integration.ts # Demo Integration Controller
├── domain/
│   ├── entities/
│   │   ├── battle-entity.ts    # Battle Entity
│   │   └── battle-session.ts   # Battle Session
│   ├── services/
│   │   ├── battle-core.ts      # Battle Service
│   │   └── battle-core-support/
│   │       ├── types.ts
│   │       ├── strategy-utils.ts
│   │       ├── json-utils.ts
│   │       ├── llm-client.ts
│   │       ├── victor-memory.ts
│   │       ├── actor-intent-store.ts
│   │       ├── strategy-selector.ts
│   │       ├── auto-decision-engine.ts
│   │       └── dynamic-strategy-validator.ts
│   └── types/
│       ├── battle-types.ts
│       ├── command-types.ts
│       ├── effect-types.ts
│       ├── event-types.ts
│       └── skill-types.ts
├── engine/
│   ├── command-processor.ts
│   ├── effect-processor.ts
│   └── tick-engine.ts
├── content/
│   └── skills/
│       └── basic-skill-catalog.ts
├── infra/
│   └── store/
│       └── battle-session-store.ts
└── battle-balance.ts
```

---

## Core Concepts

### BattleEntity

```typescript
type BattleEntity = {
  id: string;              // Unique ID
  name: string;            // Character Name
  team: 'left' | 'right';  // Team Affiliation
  position: { x: number; y: number };  // Position Coordinates
  resources: {             // Resource Pool
    hp: number;            // Current HP
    maxHp: number;         // Maximum HP
    mp: number;            // Current MP
    maxMp: number;         // Maximum MP
    stamina: number;       // Current Stamina
    maxStamina: number;    // Maximum Stamina
    shield: number;        // Current Shield
    maxShield: number;     // Maximum Shield
    rage: number;          // Current Rage
    maxRage: number;       // Maximum Rage
  };
  atk: number;             // Attack Power
  def: number;             // Defense Power
  spd: number;             // Speed
  skillSlots: BattleSkillSlot[];  // Skill Slots
  defending: boolean;      // Defending Status
  alive: boolean;          // Alive Status
  effects: BattleStatusEffect[];  // Status Effects
}
```

### BattleSession

```typescript
type BattleSession = {
  id: string;              // Session ID
  tick: number;            // Current Turn Number
  result: BattleResult;    // Battle Result
  mapBounds: {             // Map Boundaries
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  left: BattleEntity;      // Left Character
  right: BattleEntity;     // Right Character
  commandQueue: BattleCommand[];  // Command Queue
  chaseState: {            // Chase State
    status: 'none' | 'flee_pending';
    runnerId?: string;
    chaserId?: string;
    startTick?: number;
    expireTick?: number;
  };
  events: BattleEvent[];   // Event List
  createdAt: number;       // Creation Time
  updatedAt: number;       // Update Time
}
```

### BattleActionType

```typescript
type BattleActionType =
  | 'basic_attack'  // Basic Attack (Melee)
  | 'cast_skill'    // Cast Skill
  | 'defend'        // Defend (Gain Shield)
  | 'dash'          // Dash (Movement)
  | 'flee';         // Flee (Attempt to Escape)
```

### BattleResult

```typescript
type BattleResult =
  | 'ongoing'      // In Progress
  | 'left_win'     // Left Victory
  | 'right_win'    // Right Victory
  | 'draw'         // Draw
  | 'fled';        // Successful Escape
```

### BattleStatusEffect

```typescript
type BattleStatusEffect = {
  instanceId: string;           // Effect Instance ID
  effectType: BattleEffectType; // Effect Type
  sourceId: string;             // Source ID
  ownerId: string;              // Owner ID
  appliedTick: number;          // Applied Turn
  durationTick: number;         // Duration in Turns
  remainingTick: number;        // Remaining Turns
  stackRule: 'replace' | 'refresh' | 'stack';  // Stacking Rule
  maxStack?: number;            // Maximum Stack Count
  tags?: string[];              // Tags
  params?: Record<string, unknown>;  // Additional Parameters
}
```

### BattleEventType

```typescript
type BattleEventType =
  | 'battle_started'     // Battle Started
  | 'command_received'   // Command Received
  | 'command_rejected'   // Command Rejected
  | 'chase_started'      // Chase Started
  | 'chase_updated'      // Chase Updated
  | 'chase_resolved'     // Chase Resolved
  | 'action_executed'    // Action Executed
  | 'damage_applied'     // Damage Applied
  | 'effect_applied'     // Effect Applied
  | 'effect_expired'     // Effect Expired
  | 'shield_gained'      // Shield Gained
  | 'shield_broken'      // Shield Broken
  | 'rage_changed'       // Rage Changed
  | 'battle_ended';      // Battle Ended
```

---

## Technology Stack

### Backend
- **Node.js + TypeScript**: Core Runtime Environment
- **Express**: HTTP Server
- **Inversify**: Dependency Injection
- **PostgreSQL + pgvector**: Long-term Memory Storage (Vector Database)
- **Axios**: HTTP Client (LLM API Calls)

### Frontend
- **React**: UI Framework
- **Phaser 3**: Professional 2D Game Engine (Map Rendering, Entity Animation, Effects)
- **TailwindCSS**: Styling
- **Axios**: API Calls
- **Frontend Layered Architecture**:
  - engine-mount: Scene Mounting
  - engine-runtime: State Synchronization
  - engine-fx: Effect System
  - battle-event-player: Action Performance

### AI Integration
- **Qwen/DeepSeek API**: LLM Service
- **Custom Prompt Engineering**: Tactical Decision Making
- **Vector Similarity Retrieval**: Experience Matching
- **Dynamic Strategy DSL**: LLM Creates Multi-turn Tactics

---

## Module Details

### 1. Command Processor (command-processor.ts)

Handles execution logic for all battle commands.

```typescript
// Core Functions
export function enqueueBattleCommand(session: BattleSession, command: BattleCommand): BattleSession
export function processBattleCommands(session: BattleSession): CommandProcessorResult

// Action Execution Logic
- basic_attack: Melee damage calculation, triggers rage gain
- cast_skill: Skill casting, checks cooldown/MP/distance
- defend: Gains shield, damage reduction
- dash: Movement, position calculation
- flee: Probability-based escape, triggers chase state
```

**Execution Flow**:
```
Receive Command → Validate Legality (Target/Distance/Resources) → Execute Action → Generate Event → Update State
```

### 2. Effect Processor (effect-processor.ts)

Manages update and expiration of all status effects.

```typescript
export function tickStatusEffects(session: BattleSession): BattleSession
export function applyFreezeToEntity(
  session: BattleSession,
  owner: BattleEntity,
  sourceId: string,
  durationTick: number
): BattleSession
```

**Effect Types**:
- freeze: Frozen (Cannot Act)
- stun: Stunned
- dot: Damage Over Time
- buff/debuff: Attribute Modifiers

### 3. Tick Engine (tick-engine.ts)

Main combat loop engine.

```typescript
export class BattleTickEngine {
  public tick(session: BattleSession): TickEngineResult {
    // 1. Increment turn counter
    // 2. Process command queue
    // 3. Update status effects
    // 4. Recover resources (MP/Stamina)
    // 5. Check victory conditions
  }
}
```

### 4. Actor Intent Store (actor-intent-store.ts)

Manages character plan states and short-term memory.

```typescript
export class ActorIntentStore {
  // Core Functions
  getIntentRefreshReason(...): string | null  // Determines if recalculation needed
  getPlannedDecision(...): AutoDecision | null // Retrieves planned decision
  updateActorPlan(...): void                    // Updates plan
  recordActorMemory(...): void                  // Records memory
  buildActorMemorySummary(...): string          // Builds memory summary
  
  // Data Structures
  private actorPlanState = Map<string, ActorPlanState>
  private actorShortMemory = Map<string, ActorMemoryEntry[]>
  private actorLastSnapshot = Map<string, { tick: number; hpRatio: number }>
}
```

### 5. Strategy Selector (strategy-selector.ts)

Pure function strategy logic, stateless.

```typescript
// Situation Evaluation
export function evaluateSituation(...): {...}

// Strategy Selection (Rule-based)
export function selectStrategy(situation: {...}): AutoStrategy

// Strategy Execution
export function executeStrategy(
  strategy: AutoStrategy,
  situation: {...}
): {
  action: BattleActionType;
  targetId?: string;
  skillId?: string;
  moveTargetX?: number;
  moveStep?: number;
  reason: string;
}
```

### 6. LLM Client (llm-client.ts)

Encapsulates LLM API calls.

```typescript
export async function requestLlmDecision(
  situation: {...},
  llmConfig: LlmConfig,
  memorySummary?: string,
  currentIntent?: AutoStrategy,
  refreshReason?: string
): Promise<LlmDecisionPayload | null>

// Return Format
type LlmDecisionPayload = {
  action?: string;              // Action
  skillId?: string;              // Skill ID
  moveTargetX?: number;          // Movement Target X
  moveStep?: number;             // Movement Step
  strategy?: string;             // Strategy Name
  reason?: string;               // Decision Reason
  strategyTemplate?: string;     // Strategy Template
  template?: string;             // Template Alias
  dynamicStrategyDsl?: any;      // Dynamic Strategy DSL (Innovation Feature)
}
```

### 7. Vector Memory (victor-memory.ts)

Vector storage and retrieval for long-term memory.

```typescript
export class VictorMemoryRepository {
  // Store Memory
  async append(entry: LongTermMemoryEntry): Promise<void>
  
  // Retrieve Similar Memories
  async buildSummary(input: {
    actorSignature: string;
    opponentSignature: string;
    hpRatio: number;
    targetHpRatio: number;
    distance: number;
    actorFrozen: boolean;
    targetFrozen: boolean;
  }): Promise<string>
  
  // Database Table Structure
  // CREATE TABLE "BattleMemory" (
  //   id TEXT PRIMARY KEY,
  //   actor_signature TEXT NOT NULL,
  //   opponent_signature TEXT NOT NULL,
  //   hp_ratio DOUBLE PRECISION NOT NULL,
  //   target_hp_ratio DOUBLE PRECISION NOT NULL,
  //   distance DOUBLE PRECISION NOT NULL,
  //   chosen_strategy TEXT NOT NULL,
  //   result TEXT NOT NULL,
  //   score DOUBLE PRECISION NOT NULL,
  //   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  //   embedding vector(1024)
  // );
}
```

### 8. Decision Executor (decide-auto-action.ts)

Complete decision workflow integrating LLM, memory, strategy templates, and guardrails.

```typescript
export async function decideAutoActionAsync(input: {
  actor: BattleEntity;
  target: BattleEntity;
  currentTick: number;
  situation: {...};           // Combat situation info
  fallbackStrategy: AutoStrategy;  // Fallback strategy
  fallback: {...};            // Fallback decision
  llmConfig: LlmConfig;       // LLM configuration
  memorySummary: string;      // Memory summary
  currentIntent?: AutoStrategy; // Current intent
  refreshReason: string;      // Refresh reason
  intentStore: ActorIntentStore; // Intent store
  dynamicStrategyRegistry?: DynamicStrategyRegistry; // Dynamic strategy registry
}): Promise<AutoDecision>
```

**Decision Flow**:
```
1. Check for active dynamic strategy → if exists, execute
2. No API key → return fallback
3. Call LLM → fail → return fallback
4. Parse LLM response
   - If dynamicStrategyDsl exists → validate and register dynamic strategy
   - If templateName exists → execute strategy template
   - Otherwise parse specific action
5. Apply guardrails (distance/HP checks)
6. Update intent store and memory
7. Return final decision
```

### 9. Auto Decision Engine (auto-decision-engine.ts)

Core module integrating LLM requests, dynamic strategy execution, and guardrail checks.

```typescript
export class AutoDecisionEngine {
  async decide(input: {
    actor: BattleEntity;
    target: BattleEntity;
    situation: {...};
    memorySummary: string;
    victorSummary: string;
    currentIntent?: AutoStrategy;
    refreshReason: string;
  }): Promise<AutoDecision> {
    // 1. Check for active dynamic strategy
    // 2. Call LLM
    // 3. Validate and execute dynamic strategy DSL
    // 4. Apply guardrails
    // 5. Return decision
  }
}
```

### 10. Dynamic Strategy Validator (dynamic-strategy-validator.ts)

Validates LLM-generated dynamic strategy DSL to ensure legality and executability.

```typescript
export function validateDynamicStrategyDsl(
  dsl: any,
  availableSkills: string[],
  currentTick: number
): ValidationResult {
  // 1. Format validation (name/sequence required)
  // 2. Sequence length limit (≤8 steps)
  // 3. Action legality validation
  // 4. Skill availability validation
  // 5. Condition range validation
  // 6. Action normalization (coordinate calculation, etc.)
}
```

---

## Data Flow

### Main Combat Loop

```
Initialize Battle (createBattleSession)
    ↓
Enqueue Command (enqueueBattleCommand)
    ↓
┌─────────────────────────────────────┐
│      Combat Loop (BattleTickEngine)  │
├─────────────────────────────────────┤
│ tick++                              │
│    ↓                                │
│ Process Commands (processBattleCommands)
│   - Legality Check                   │
│   - Execute Action                   │
│   - Calculate Damage                 │
│   - Trigger Events                   │
│    ↓                                │
│ Update Effects (tickStatusEffects)   │
│   - Decrease Duration                │
│   - Remove Expired Effects           │
│   - Trigger Effect Events            │
│    ↓                                │
│ Resource Recovery (recoverPassiveResources)
│   - MP Recovery (+1)                 │
│   - Stamina Recovery (+1)            │
│    ↓                                │
│ Check Victory (applyVictoryIfNeeded) │
└─────────────────────────────────────┘
    ↓
Return Result
```

### Event Flow

```
Action Execution → damage_applied → Damage Calculation
               ↓
         shield_absorb (Shield Absorption)
               ↓
         hp_reduce (HP Reduction)
               ↓
         rage_changed (Rage Change)
               ↓
         check_death → battle_ended
               ↓
         chase_state_check → flee_pending/captured/escaped
```

### Frontend Rendering Data Flow

```
battle-core state/events
  -> demoWorld orchestration
    -> battle-event-player (Action Interpretation)
      -> engine-fx (Hit/Freeze/Camera Effects)
      -> engine-runtime (Coordinate/Bar/Overlay Sync)
      -> BattleLogPanel (Text Log)
        -> Phaser Scene (engine-mount Mounting)
```

### Action to Performance Mapping

```
basic_attack  -> Melee Displacement + slash/burst
cast_skill    -> telegraph + beam/wave/arc projectile
defend        -> Shield Prompt + Light Retreat
flee          -> Escape Displacement + chase overlay
freeze        -> Freeze Indicator + tint + Animation Pause
battle_ended  -> finisher Performance + Result Text
```

### Data Persistence Flow

```
Battle In Progress
    ↓
Short-term Memory (Per Turn Record) → ActorMemoryEntry
    ↓                   (Max 12 Entries)
Battle Ends
    ↓
Long-term Memory Construction → LongTermMemoryEntry
    ↓
Vectorization (getEmbedding)
    ↓
Store in PostgreSQL (pgvector)
    ↓
Next Battle → Similarity Retrieval → Memory Summary → LLM Prompt
```

---

## AI Decision System

### Strategy Hierarchy

```
LLM Decision Output
    ↓
┌─────────────────────────────────────┐
│        Three-layer Strategy Structure│
├─────────────────────────────────────┤
│ 1. Core Strategies (AutoStrategy)   │
│    - steady_trade                   │
│    - kite_and_cast                   │
│    - aggressive_finish               │
│    - combo_break                     │
│    - flee_and_reset                  │
│                                     │
│ 2. Strategy Templates               │
│    - opening_probe                   │
│    - pressure_chase                  │
│    - control_chain                   │
│    - burst_window                    │
│    - kite_cycle                      │
│    - retreat_edge                    │
│    - safe_trade                      │
│                                     │
│ 3. Dynamic Strategies               │
│    - LLM-created tactical sequences │
│    - Multi-phase tactics            │
│    - Condition-triggered            │
└─────────────────────────────────────┘
```

### Strategy Template Extensions

```typescript
const extendedTemplates = {
  guerrilla_warfare: 'Guerrilla Tactics (Probe→Retreat→Counter)',
  bait_and_punish: 'Bait and Punish (Show Weakness→Counter)',
  patient_stalker: 'Patient Stalker (Wait for Opportunity→One-shot)',
  shield_bash: 'Shield Bash Combo (Defense→Counter→Control)'
};
```

### Dynamic Strategy DSL Format

```typescript
type DynamicStrategySequenceStep = {
  action: BattleActionType;      // Action
  skillId?: string;               // Skill ID (if cast_skill)
  moveTargetX?: number | string;  // Movement Target (number or expression)
  moveStep?: number;              // Movement Step
  duration?: number;              // Duration in Turns (optional)
};

type DynamicStrategyConditions = {
  hpRange?: [number, number];           // HP Range [min, max]
  targetHpRange?: [number, number];     // Target HP Range
  distanceRange?: [number, number];     // Distance Range
  rageRatio?: [number, number];         // Rage Ratio Range
  shieldRatio?: [number, number];       // Shield Ratio Range
  targetFrozen?: boolean;                // Target Frozen
  actorFrozen?: boolean;                 // Self Frozen
  tickRange?: [number, number];          // Turn Range
};

type RegisteredDynamicStrategy = {
  name: string;                          // Strategy Name
  conditions: DynamicStrategyConditions; // Trigger Conditions
  sequence: DynamicStrategySequenceStep[]; // Action Sequence
  fallback?: AutoStrategy;                // Fallback Strategy
  startTick?: number;                      // Start Turn (runtime populated)
};
```

### LLM Decision Chain (V2)

```
Input Layer
├── Current Situation (Resources, Distance, Available Skills, Freeze Status, Boundaries)
├── Short-term Memory Summary (Recent Actions & Strategies)
└── VictorMemory Summary (Long-term Retrieval Results)

Decision Layer
└── requestLlmDecision()
    ├── system prompt (Action Whitelist/Strategy Templates/Coordinate Boundaries/Mechanisms)
    ├── actorSkillsDetailed + targetSkillsDetailed
    └── Output JSON Action Intent (may include dynamicStrategyDsl)

Constraint Layer
├── dynamic-strategy-validator (Action & Skill Normalization)
├── guardrail (Illegal Action Correction, No-skill Alternatives)
└── anti-loop (Repetitive Behavior Detection & Interruption)

Execution Layer
├── command enqueue
├── command processor
└── battle events

Fallback Layer
└── fallback (No Key/Timeout/Invalid JSON/Strategy Failure)
```

### LLM Prompt Template

```typescript
const systemPrompt = `
You are a tactical AI making decisions for 1v1 combat.
Available actions: ["basic_attack","cast_skill","defend","dash","flee"]
Available skills: ["arcane_bolt","frost_lock"]
Strategy templates: ["opening_probe","pressure_chase","control_chain","burst_window","kite_cycle","retreat_edge","safe_trade"]

You can also create dynamic strategies in this format:
{
  "dynamicStrategyDsl": {
    "name": "Strategy Name",
    "conditions": { ... },
    "sequence": [ ... ]
  }
}

Return format must be JSON.
`;
```

### Guardrails

LLM output must pass the following checks:

```typescript
// 1. Action Legality
if (!allowedActions.includes(parsedAction)) {
  return fallbackWithState('invalid_action');
}

// 2. Skill Availability
if (action === 'cast_skill' && !situation.availableSkills.includes(skillId)) {
  return fallbackWithState('invalid_skill');
}

// 3. Distance Check
if (action === 'basic_attack' && distance > 1.8) {
  action = 'dash';  // Force change to dash
}

// 4. Early Flee Prevention
if (action === 'flee' && tick <= 8 && hpRatio > 0.35) {
  action = 'dash';  // Prevent early fleeing
}

// 5. Low HP Protection
if (hpRatio < 0.17 && distance > 4.8 && action !== 'flee') {
  action = 'flee';  // Force flee
}
```

---

## Memory System

### Memory Types

#### Short-term Memory (ActorMemoryEntry)

```typescript
type ActorMemoryEntry = {
  tick: number;              // Turn Number
  hpRatio: number;           // Self HP Ratio
  targetHpRatio: number;     // Target HP Ratio
  distance: number;          // Distance
  action: BattleActionType;  // Executed Action
  strategy: string;          // Used Strategy
  source: 'llm' | 'fallback'; // Decision Source
  sourceReason: string;      // Source Reason
}
```

**Characteristics**:
- Recorded every turn
- Maximum 12 entries (FIFO queue)
- Used to build memory summary

#### Long-term Memory (LongTermMemoryEntry)

```typescript
type LongTermMemoryEntry = {
  timestamp: number;          // Timestamp
  actorSignature: string;     // Character Signature (e.g., "Knight#left")
  opponentSignature: string;  // Opponent Signature (e.g., "Mage#right")
  hpRatio: number;            // Self HP Ratio
  targetHpRatio: number;      // Target HP Ratio
  distance: number;           // Distance
  chosenStrategy: AutoStrategy; // Chosen Strategy
  result: 'win' | 'lose' | 'draw'; // Battle Result
  score: number;              // Score (1/-1/0.2)
}
```

**Characteristics**:
- Stored at battle end
- Saved to PostgreSQL+pgvector
- Supports vector similarity retrieval

### Memory System Architecture

```
Short-term Memory
├── Per Turn Record → ActorMemoryEntry
├── Max 12 entries (FIFO queue)
└── Build Summary → Last 4 entries
    ├── Format: "T24: hp=0.85 vs 0.92, action=cast_skill"
    └── Output → Memory Summary

Long-term Memory
├── Trigger: Battle End
├── Storage → PostgreSQL + pgvector
├── Fields: actor/opponent signature, situation, strategy, result, score
└── Vector Embedding: Convert text features to 1024-dim vectors

Retrieval
├── Vector Similarity Calculation (Cosine Similarity)
├── Select Top 3 Most Similar
├── Format: "kite_and_cast:win@0.75/0.32(sim=0.92)"
└── Input to LLM Prompt
```

### VictorMemory Fault Tolerance

```typescript
// Fault Tolerance: Vector write/retrieval exceptions don't block main combat flow
try {
  const embedding = await this.getEmbedding(textForEmbedding);
  if (embedding.length === 0) {
    // Degrade: Store text only, no vector
    await prisma.$executeRawUnsafe(
      'INSERT INTO "BattleMemory" ... VALUES (..., NULL)'
    );
  }
} catch (_error) {
  // Silent failure, doesn't affect combat
  console.warn('VictorMemory write failed, continuing...');
}
```

**Design Principle**: fail-open, memory system exceptions don't block core combat logic.

### Seed Strategy Mechanism

At battle start, pre-select initial strategy based on historical experience:

```typescript
// Seed Strategy Selection Logic
const memory = this.longTermMemoryBySignature.get(actorSignature)
  ?.filter(entry => entry.opponentSignature === opponentSignature)

// Calculate total score for each strategy
const scored = new Map<AutoStrategy, number>()
memory.forEach(entry => {
  const current = scored.get(entry.chosenStrategy) || 0
  scored.set(entry.chosenStrategy, current + entry.score)
})

// Select highest scoring strategy from history
let bestStrategy: AutoStrategy = 'steady_trade'
let bestScore = Number.NEGATIVE_INFINITY
scored.forEach((value, strategy) => {
  if (value > bestScore) {
    bestScore = value
    bestStrategy = strategy
  }
})

// Set initial plan
this.updateActorPlan(actor.id, bestStrategy, 'fallback', 
  `long_memory_seed(${bestStrategy})`, currentTick)
```

---

## State Machine

### Main Battle State Machine

```
Main State
ongoing
├── Normal Combat (attack/skill/defend/dash)
├── Chase Sub-state
│   ├── none
│   └── flee_pending (runner/chaser/startTick/expireTick)
│       ├── captured -> left_win/right_win
│       ├── escaped -> fled
│       └── escape_failed -> back to ongoing
└── timeout_score -> left_win/right_win/draw

Terminal
left_win | right_win | fled | draw
```

**Key Design**: Not "one flee ends battle", must go through chase state and resolution conditions. Frontend overlay uses `chaseState` for real-time chase progress visualization.

### Chase State Machine Details

```
Chase State Machine
├── none → flee_pending: Successful flee triggers
└── flee_pending → none: Captured or Escaped triggers

Chase Resolution Conditions:
- Captured: distance < 1.9
- Escaped: timeout (expireTick)
- Escape Failed: Return to normal combat
```

### Tactical State Machine Example

```
Tactical State Machine
├── approaching → attacking: distance < 2
├── attacking → retreating: after 2 attacks
├── retreating → waiting: no one chasing
└── waiting → approaching: distance > 5
```

---

## Configuration & Balance

### Balance Parameters (battle-balance.ts)

```typescript
export const BATTLE_BALANCE = {
  // Battle Duration Control
  defaultAutoSimMaxTicks: 60,
  hardMaxAutoSimTicks: 180,
  shortBattleTicksThreshold: 18,
  
  // Damage Multipliers
  basicDamageMultiplier: 0.72,   // Basic Attack Damage Multiplier
  skillDamageMultiplier: 0.82,   // Skill Damage Multiplier
  
  // Shield/Rage System
  defendShieldGain: 4,            // Shield gained from defend
  rageGainOnDealScale: 0.7,       // Rage conversion rate from dealing damage
  rageGainOnTakenScale: 1,        // Rage conversion rate from taking damage
  
  // Skill Parameters
  skills: {
    arcane_bolt: {
      ratio: 1.35,
      mpCost: 4,
      range: 6.5,
      cooldownTicks: 2
    },
    frost_lock: {
      ratio: 1.1,
      mpCost: 6,
      range: 7.2,
      cooldownTicks: 3,
      applyFreezeTicks: 2
    }
  }
} as const;
```

### TTK Tuning Guide

```
Factors Affecting TTK
├── Damage Multiplier → TTK Result
├── HP Cap → TTK Result
├── Recovery Speed → TTK Result
├── Skill Cooldown → TTK Result
├── Shield Efficiency → TTK Result
└── Rage Accumulation → TTK Result

Adjustment Direction
├── TTK Too Long → ↑Damage / ↓HP
├── TTK Too Short → ↓Damage / ↑HP
├── Too Many One-shots → Strengthen Shield
└── Too Drawn Out → Strengthen Burst

Target Range
└── 20-25 Turns (Competitive Mode)
    ├── Casual Mode: 30-40 Turns
    ├── Competitive Mode: 20-25 Turns
    └── Fast Mode: 10-15 Turns
```

### Resource System Data Flow

```
Action Trigger
├── defend -> shield +N
├── attack/skill -> damage pipeline
└── hit/taken -> resource change events

Settlement Order
1) dodge check
2) shield absorption
3) HP reduction
4) status effect settlement (e.g., freeze)

Display Layer
├── Backend: Resources are the true data source
└── Frontend: Update HP/MP bars and hit feedback based on events & state
```

**Note**:
- Rage field is maintained in the backend model but may not be the primary visual focus in the display layer depending on product requirements
- MP (mana bar) directly relates to skill availability, frontend display synchronizes with backend data

---

## API Interface

### Base URL
```
http://localhost:3000/api/battle-core
```

### 1. Create Session

**POST** `/sessions`

Request Body:
```json
{
  "leftId": "left-1",
  "rightId": "right-1",
  "leftName": "Knight",
  "rightName": "Mage",
  "leftHp": 72,
  "rightHp": 72,
  "leftAtk": 6,
  "rightAtk": 6,
  "leftDef": 4,
  "rightDef": 4
}
```

Response:
```json
{
  "sessionId": "xxx",
  "tick": 0,
  "result": "ongoing",
  "left": {...},
  "right": {...}
}
```

### 2. Get Session

**GET** `/sessions/:sessionId`

Response:
```json
{
  "sessionId": "xxx",
  "tick": 10,
  "result": "ongoing",
  "left": {...},
  "right": {...},
  "queueSize": 2,
  "eventCount": 45,
  "events": [...]
}
```

### 3. Enqueue Command

**POST** `/sessions/:sessionId/commands`

Request Body:
```json
{
  "actorId": "left-1",
  "action": "cast_skill",
  "targetId": "right-1",
  "skillId": "arcane_bolt",
  "tick": 5
}
```

Response:
```json
{
  "command": {...},
  "queueSize": 3,
  "tick": 5
}
```

### 4. Tick Session

**POST** `/sessions/:sessionId/tick`

Request Body:
```json
{
  "steps": 5
}
```

Response:
```json
{
  "sessionId": "xxx",
  "tick": 10,
  "result": "ongoing",
  "appliedCommandCount": 3,
  "left": {...},
  "right": {...},
  "queueSize": 1,
  "recentEvents": [...]
}
```

### 5. Auto Simulate

**POST** `/sessions/:sessionId/auto-sim`

Request Body:
```json
{
  "maxTicks": 30
}
```

Response:
```json
{
  "sessionId": "xxx",
  "tick": 25,
  "result": "left_win",
  "ticksRan": 25,
  "appliedCommandCount": 42,
  "summary": {
    "totalEvents": 86,
    "damageByActor": {"left-1": 245, "right-1": 198},
    "freezeAppliedCount": 3,
    "rejectedCommandCount": 2,
    "endedReason": "right_defeated"
  },
  "left": {...},
  "right": {...}
}
```

### 6. Benchmark

**POST** `/benchmark/auto-sim`

Request Body:
```json
{
  "rounds": 60,
  "maxTicks": 90
}
```

Response:
```json
{
  "rounds": 60,
  "maxTicks": 90,
  "winRate": {
    "left": 0.7,
    "right": 0.3,
    "draw": 0,
    "timeout": 0
  },
  "average": {
    "ticksRan": 21.58,
    "freezeAppliedCount": 2.3,
    "rejectedCommandCount": 1.2,
    "damageByActor": {
      "left-1": 312.5,
      "right-1": 278.3
    }
  },
  "samples": [...]
}
```

### 7. Get Unified Rules

**GET** `/rules`

Response:
```json
{
  "actions": ["basic_attack", "cast_skill", "defend", "dash", "flee"],
  "damageFormula": "max(1, floor(atk * multiplier - def * 0.45 + random(2.5)))",
  "victoryConditions": {
    "hp_zero": "Opponent HP reaches zero",
    "flee_success": "Successful escape"
  },
  "skillRules": {
    "arcane_bolt": { "type": "damage", "range": 6.5 },
    "frost_lock": { "type": "control", "freezeTicks": 2 }
  }
}
```

### 8. Get Skills

**GET** `/skills`

Response:
```json
{
  "skills": [
    {
      "id": "arcane_bolt",
      "name": "Arcane Bolt",
      "ratio": 1.35,
      "mpCost": 4,
      "range": 6.5,
      "cooldownTicks": 2
    },
    {
      "id": "frost_lock",
      "name": "Frost Lock",
      "ratio": 1.1,
      "mpCost": 6,
      "range": 7.2,
      "cooldownTicks": 3,
      "applyFreezeTicks": 2
    }
  ]
}
```

### 9. Import Skills

**POST** `/skills/import`

Request Body:
```json
{
  "skills": [
    {
      "id": "flame_strike",
      "name": "Flame Strike",
      "ratio": 1.8,
      "mpCost": 8,
      "range": 5.0,
      "cooldownTicks": 4
    }
  ],
  "overwrite": false  // true=overwrite, false=append
}
```

Response:
```json
{
  "imported": 1,
  "total": 3,
  "skills": ["arcane_bolt", "frost_lock", "flame_strike"]
}
```

### 10. Get Memory Status

**GET** `/memory-status`

Response:
```json
{
  "shortTerm": {
    "leftEntries": 12,
    "rightEntries": 12,
    "refreshReasons": ["hp_drop", "plan_expired"]
  },
  "longTerm": {
    "totalEntries": 1245,
    "victorEnabled": true,
    "embeddingModel": "text-embedding-v3"
  }
}
```

### 11. Visual Debug Interface

**GET** `/view`

Returns HTML debug page with battle arena, control panel, logs, etc.

---

## Development Guide

### Environment Requirements

- Node.js 18+
- PostgreSQL 14+ (with pgvector extension)
- npm/yarn

### Environment Variables

```env
# LLM Configuration
QWEN_API_KEY=your-api-key
QWEN_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus

# Left/Right teams can be configured separately (for demo with different AIs)
QWEN_API_KEY_LEFT=left-api-key
QWEN_API_KEY_RIGHT=right-api-key
QWEN_MODEL_LEFT=qwen-plus
QWEN_MODEL_RIGHT=qwen-plus

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/battle

# Memory Backend (inmemory or victordb)
BATTLE_MEMORY_BACKEND=victordb
```

### Adding New Skills

Add to `content/skills/basic-skill-catalog.ts`:

```typescript
const SKILLS: BattleSkillDefinition[] = [
  // ... existing skills
  {
    id: 'new_skill',
    name: 'New Skill',
    ratio: 1.5,           // Damage multiplier
    mpCost: 8,            // MP cost
    range: 8.0,           // Range
    cooldownTicks: 4,     // Cooldown in turns
    applyFreezeTicks?: 2, // Optional: freeze effect
    // Can add more effects
  }
];
```

### Adding New Strategy Templates

Add to `strategy-utils.ts`:

```typescript
export function executeStrategyTemplate(
  template: StrategyTemplateName,
  situation: {...},
  fallbackStrategy: AutoStrategy,
  executeStrategy: Function
): {...} {
  // ... existing templates
  
  if (template === 'new_template') {
    // Implement new template logic
    return {
      action: '...',
      skillId: '...',
      moveTargetX: ...,
      moveStep: ...
    };
  }
}
```

### Adding New Characters

Specify when creating session via API:

```typescript
const session = battleCoreService.createSession({
  leftId: 'warrior-1',
  leftName: 'Berserker',
  leftHp: 100,
  leftAtk: 10,
  leftDef: 3,
  rightId: 'archer-1',
  rightName: 'Archer',
  rightHp: 80,
  rightAtk: 8,
  rightDef: 2
});
```

### AI-RPG & Keco-Studio Integration Workflow

```js
Step 1: Import AI-RPG map
└── Generate entity instances and spatial coordinates (entityInstances)

Step 2: Import Keco configuration tables
└── Provide character configurations (npc_id, skills, attributes, strategy metadata)

Step 3: Bind rules
└── map_instance_id priority binding (spatial ID) + npc_id (character ID)

Step 4: Battle execution
├── Backend calculates based on character configuration
└── Frontend renders based on instance coordinates

Step 5: Event replay
└── profileId <-> renderId mapping, ensuring hits target the same entity
```

**Conclusion**:
- Maps come from AI-RPG, character abilities come from Keco
- Skills and values are primarily import-based, strategy templates provide the general decision framework

### Frontend Phaser Development Guide

```typescript
// Mount Phaser scene
import { mountBattleScene } from './engine-mount';

useEffect(() => {
  const scene = mountBattleScene('battle-container', {
    width: 800,
    height: 400,
    onReady: (game) => {
      // Scene ready
    }
  });
  
  return () => scene.destroy();
}, []);

// Sync battle state
useEffect(() => {
  if (!session || !scene) return;
  syncBattleState(scene, session);
}, [session]);
```

### Code Locations

#### Backend Core Files

```
src/application/controllers/battle-core.ts
src/application/controllers/demo-integration.ts
src/domain/services/battle-core.ts
src/domain/services/battle-core-support/auto-decision-engine.ts
src/domain/services/battle-core-support/dynamic-strategy-validator.ts
src/domain/services/battle-core-support/actor-intent-store.ts
src/domain/services/battle-core-support/llm-client.ts
src/domain/services/battle-core-support/victor-memory-repository.ts
src/battle-core/engine/command-processor.ts
src/battle-core/engine/tick-engine.ts
```

#### Frontend Core Files

```
client/src/pages/demoWorld/index.tsx
client/src/pages/demoWorld/engine-mount.ts
client/src/pages/demoWorld/engine-runtime.ts
client/src/pages/demoWorld/engine-fx.ts
client/src/pages/demoWorld/battle-event-player.ts
client/src/pages/demoWorld/battle-utils.ts
client/src/pages/demoWorld/components/BattleLogPanel.tsx
client/src/api/battleCore.ts
client/src/api/demoIntegration.ts
```

---

### Monitoring & Logging

```typescript
// Log Levels
const logLevels = {
  error: 0,   // Error
  warn: 1,    // Warning
  info: 2,    // Information
  debug: 3,   // Debug
  trace: 4    // Trace
};

// Key Metrics
const metrics = {
  battlesPerSecond: number,
  avgTicksPerBattle: number,
  llmCallSuccessRate: number,
  fallbackRate: number,
  memoryHitRate: number
};
```

### Performance Optimization

```typescript
// 1. LLM Call Caching
const llmCache = new Map<string, LlmDecisionPayload>();

// 2. Batch Processing
const batchSize = 10; // Process 10 commands per batch

// 3. Database Connection Pool
const pool = new Pool({
  max: 20,              // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// 4. Memory Limits
const maxConcurrentBattles = 100;
const maxMemoryEntries = 10000;
```

---

## FAQ

### Q: LLM decisions too slow?
A: 
- Reduce LLM call frequency (from 5 to 8 turns)
- Use faster models (qwen-turbo instead of qwen-plus)
- Enable response caching
- Set timeout (default 4500ms)

### Q: How to make battles faster?
A: Adjust parameters in `battle-balance.ts`:
```typescript
basicDamageMultiplier: 1.2,  // Increase damage
skillDamageMultiplier: 1.4,
defendShieldGain: 2,         // Reduce shield
```

### Q: How to add new skills?
A: See "Adding New Skills" section.

### Q: How to make LLM more innovative?
A: Optimize prompts to encourage `dynamicStrategyDsl` generation, while relaxing guardrail conditions appropriately.

### Q: Database connection failed?
A: Check:
- PostgreSQL is running
- pgvector extension is installed
- DATABASE_URL configuration is correct

### Q: Frontend Phaser scene not displaying?
A: Check:
- Canvas container exists
- Coordinate conversion is correct
- Events are properly consumed

### Q: Chase state not updating?
A: Check:
- Flee command successfully triggered
- chaseState correctly passed to frontend
- Overlay rendering logic

---

## Version History

### v1.0.0 (Initial Version)
- Basic battle engine
- 5 core strategies
- 2 basic skills

### v1.1.0 (AI Decision)
- LLM integration
- 7 strategy templates
- Short-term memory

### v1.2.0 (Memory System)
- Long-term memory (PostgreSQL+pgvector)
- Seed strategy mechanism
- Vector similarity retrieval

### v1.3.0 (Shield/Rage)
- Shield system
- Rage system
- New event types

### v1.4.0 (Dynamic Strategies)
- LLM creates multi-turn tactics
- Dynamic strategy registry
- Tactical sequence execution

### v2.0.0 (Frontend Upgrade + Productization)
- Phaser game engine integration
- Unified rules interface
- Skill import system
- AI-RPG/Keco integration
- Chase state machine visualization
- Memory system fault tolerance
- Dynamic strategy validator

