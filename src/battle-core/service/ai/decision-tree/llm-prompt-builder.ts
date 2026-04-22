import type { BattleEntity } from '../../../domain/entities/battle-entity'
import type { BattleSession } from '../../../domain/entities/battle-session'
import { getBattleSkillDefinition } from '../../../content/skills/basic-skill-catalog'
import { BATTLE_BALANCE } from '../../../config/battle-balance'
import { MELEE_RANGE } from './decision-constants'
import { inferRoleProfile, type RoleProfile } from './role-inference'
import type { StrategyTemplateName } from './strategy-template'
import type { RefreshReason } from './intent-store'
import type { TacticalMode } from './decision-context'

export type StructuredLlmPayload = {
  tick: number
  phase: string
  refreshReason: RefreshReason | string
  currentIntent: TacticalMode | string
  memorySummary: string

  actor: EntityPayload
  actorRoleProfile: RoleProfile
  actorSkillsDetailed: SkillDetail[]

  target: EntityPayload
  targetRoleProfile: RoleProfile
  targetSkillsDetailed: SkillDetail[]

  distance: number
  actorHpRatio: number
  targetHpRatio: number

  battleRules: BattleRulesPayload
  availableActions: string[]
  availableStrategyTemplates: StrategyTemplateName[]
}

type EntityPayload = {
  id: string
  name: string
  team: string
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  stamina: number
  maxStamina: number
  atk: number
  def: number
  spd: number
  posX: number
  posY: number
  activeEffects: string[]
}

type SkillDetail = {
  id: string
  name: string
  category: string
  ratio: number
  mpCost: number
  range: number
  cooldownTicks: number
  remainingCooldown: number
  canCast: boolean
  inRange: boolean
  effectHint: string
}

type BattleRulesPayload = {
  basicAttackRange: number
  dodgeStaminaCost: number
  dodgeEvadeChance: number
  mapBounds: { minX: number; maxX: number; minY: number; maxY: number }
}

const ALL_TEMPLATES: StrategyTemplateName[] = [
  'opening_probe', 'pressure_chase', 'control_chain', 'burst_window',
  'kite_cycle', 'retreat_edge', 'safe_trade', 'guerrilla_warfare', 'bait_and_punish',
]

export function buildStructuredPayload(input: {
  session: BattleSession
  actor: BattleEntity
  target: BattleEntity
  refreshReason: RefreshReason | string
  currentIntent: TacticalMode | string
  memorySummary: string
}): StructuredLlmPayload {
  const { session, actor, target } = input
  const distance = Math.hypot(
    actor.position.x - target.position.x,
    actor.position.y - target.position.y,
  )
  return {
    tick: session.tick,
    phase: session.phase,
    refreshReason: input.refreshReason,
    currentIntent: input.currentIntent,
    memorySummary: input.memorySummary,

    actor: buildEntityPayload(actor),
    actorRoleProfile: inferRoleProfile(actor),
    actorSkillsDetailed: buildSkillDetails(actor, session.tick, distance),

    target: buildEntityPayload(target),
    targetRoleProfile: inferRoleProfile(target),
    targetSkillsDetailed: buildSkillDetails(target, session.tick, distance),

    distance: Math.round(distance * 100) / 100,
    actorHpRatio: actor.resources.maxHp > 0 ? Math.round((actor.resources.hp / actor.resources.maxHp) * 100) / 100 : 1,
    targetHpRatio: target.resources.maxHp > 0 ? Math.round((target.resources.hp / target.resources.maxHp) * 100) / 100 : 1,

    battleRules: {
      basicAttackRange: MELEE_RANGE,
      dodgeStaminaCost: BATTLE_BALANCE.dodgeStaminaCost,
      dodgeEvadeChance: BATTLE_BALANCE.dodgeEvadeChance,
      mapBounds: session.mapBounds,
    },
    availableActions: ['basic_attack', 'cast_skill', 'defend', 'dash', 'dodge', 'flee'],
    availableStrategyTemplates: ALL_TEMPLATES,
  }
}

export function buildSystemPrompt(): string {
  return [
    'You are a tactical battle AI. Output ONLY valid JSON, no extra text.',
    '',
    'You MUST respond with a multi-step action sequence (3-5 steps). The engine executes one step per tick.',
    '',
    'Response format:',
    '{',
    '  "name": "<short combo name, e.g. freeze_shatter_combo>",',
    '  "sequence": [',
    '    { "action": "cast_skill", "skillId": "frost_lock" },',
    '    { "action": "dash", "moveTargetX": 5.0, "moveTargetY": 3.0 },',
    '    { "action": "cast_skill", "skillId": "arcane_bolt" }',
    '  ],',
    '  "ttlTicks": 6,',
    '  "reasoning": "<1-sentence explanation>"',
    '}',
    '',
    'Each step in "sequence" has:',
    '- "action": "basic_attack" | "cast_skill" | "defend" | "dash" | "dodge"',
    '- "skillId": required if action="cast_skill"',
    '- "moveTargetX", "moveTargetY": required if action="dash"',
    '',
    'Sequence rules:',
    '- 3 to 5 steps per sequence',
    '- ttlTicks: how many ticks the plan stays valid (3-12, default 6)',
    '- Plan combos: control → reposition → burst (e.g. freeze → dash back → shatter)',
    '- The engine will invalidate your sequence if HP drops sharply or actor gets stunned',
    '',
    'Strategy templates guide your overall approach:',
    '- opening_probe: Cautious poke to test enemy, basic attacks or short dashes',
    '- pressure_chase: All-in aggressive pursuit, close distance and burst',
    '- control_chain: Lead with control skills (freeze/stun), then follow up burst',
    '- burst_window: Maximize burst damage in short window, use highest-ratio skills',
    '- kite_cycle: Maintain safe distance, cast ranged skills, retreat when too close',
    '- retreat_edge: Emergency retreat to map edge, dodge and disengage',
    '- safe_trade: Balanced offense/defense, defend when low HP, steady damage',
    '- guerrilla_warfare: 6-tick cycle: poke→retreat→burst, never commit fully',
    '- bait_and_punish: Bait enemy approach with retreat, then counter-attack',
    '',
    'Rules:',
    `- basic_attack range is ${MELEE_RANGE}; if distance > ${MELEE_RANGE}, use dash first`,
    '- cast_skill requires: skill not on cooldown, enough MP, within skill range',
    '- dodge costs stamina; defend is free but wastes time if far from enemy',
    '- Consider actor/target role profiles for optimal strategy',
    '- Prioritize control skills to open burst windows (freeze → shatter combo)',
    '- If HP is critically low (<15%), strongly consider retreat_edge or dodge sequence',
    '- ALWAYS plan ahead: if you want to cast a skill but are out of range, dash first THEN cast',
  ].join('\n')
}

function buildEntityPayload(entity: BattleEntity): EntityPayload {
  return {
    id: entity.id,
    name: entity.name,
    team: entity.team,
    hp: entity.resources.hp,
    maxHp: entity.resources.maxHp,
    mp: entity.resources.mp,
    maxMp: entity.resources.maxMp,
    stamina: entity.resources.stamina,
    maxStamina: entity.resources.maxStamina,
    atk: entity.atk,
    def: entity.def,
    spd: entity.spd,
    posX: Math.round(entity.position.x * 100) / 100,
    posY: Math.round(entity.position.y * 100) / 100,
    activeEffects: entity.effects.map((e) => `${e.effectType}(${e.remainingTick}t)`),
  }
}

function buildSkillDetails(
  entity: BattleEntity,
  currentTick: number,
  distance: number,
): SkillDetail[] {
  return entity.skillSlots.map((slot) => {
    const def = getBattleSkillDefinition(slot.skillId)
    const remainingCd = Math.max(0, slot.cooldownTick - currentTick)
    const canCast = !!def && remainingCd === 0 && entity.resources.mp >= (def?.mpCost ?? 0)
    const inRange = !!def && distance <= def.range
    return {
      id: slot.skillId,
      name: def?.name ?? slot.skillId,
      category: def?.category ?? 'unknown',
      ratio: def?.ratio ?? 0,
      mpCost: def?.mpCost ?? 0,
      range: def?.range ?? 0,
      cooldownTicks: def?.cooldownTicks ?? 0,
      remainingCooldown: remainingCd,
      canCast,
      inRange,
      effectHint: buildEffectHint(def),
    }
  })
}

function buildEffectHint(def: ReturnType<typeof getBattleSkillDefinition>): string {
  if (!def) return 'unknown'
  const parts: string[] = [`dmg:${def.ratio}x`]
  if (def.applyFreezeTicks) parts.push(`freeze:${def.applyFreezeTicks}t`)
  if (def.shatterBonusRatio) parts.push(`shatter:+${def.shatterBonusRatio}x`)
  if (def.consumeFreezeOnHit) parts.push('consumes_freeze')
  return parts.join(', ')
}
