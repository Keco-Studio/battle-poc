/**
 * Validate simulation-format drafts → Keco Skill → battle-core definitions.
 */

import type { Skill } from '@keco/battle-engine'
import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'
import { kecoSkillToBattleCoreDefinition } from '@/src/keco/kecoSkillBridge'
import { flatRowToKecoSkillFromRow } from './kecoSkillTableCodec'
import { parseStrengthKey } from './elementLabelCodec'
import { emptyPocSkillFlatRow, parseBattleSkillRow, resolveSkillId, type PocSkillFlatRow } from './pocSkillFieldMapping'
import {
  SIMULATION_SKILL_DRAFTS_REQUIRED_KEYS,
  SIMULATION_SKILL_MAPPING_FIELD_KEYS,
  type SimulationSkillColumnMappingKey,
  type SimulationSkillDraft,
} from './simulationSkillDraftTypes'

export type SimulationSkillDraftValidationResult = {
  ok: boolean
  kecoSkills: Skill[]
  definitions: BattleSkillDefinition[]
  draftErrors: { draftId: string; label: string; error: string }[]
}

function parseReactionTriggersJson(raw: string): PocSkillFlatRow['reactionTriggersJson'] {
  return raw.trim()
}

function simulationFlatRowFromDraft(draft: SimulationSkillDraft): PocSkillFlatRow {
  const base = emptyPocSkillFlatRow()
  const pick = (key: SimulationSkillColumnMappingKey): string =>
    draft.fields[key]?.value?.trim() ?? ''

  const rawId = pick('id')
  const idResolved = rawId ? resolveSkillId(rawId) : { error: 'Skill id cannot be empty' as const }

  return {
    ...base,
    id: 'id' in idResolved ? idResolved.id : rawId,
    name: pick('name'),
    description: pick('description'),
    power: pick('power') || base.power,
    mpCost: pick('mpCost') || base.mpCost,
    maxCooldown: pick('maxCooldown') || base.maxCooldown,
    skillType: pick('type') || base.skillType,
    attachElement: pick('attachElement'),
    attachStrength: pick('attachStrength') || base.attachStrength,
    attachTurns: pick('attachDuration'),
    dotDamage: pick('dotDamage'),
    dotTurns: pick('dotDuration'),
    freezeTurns: pick('freezeDuration'),
    specialEffect: pick('specialType'),
    specialEffectValue: pick('specialValue'),
    specialEffectDuration: pick('specialDuration'),
    reactionTriggersJson: parseReactionTriggersJson(pick('reactionTriggersJson')),
  }
}

export function validateSimulationSkillDrafts(
  drafts: SimulationSkillDraft[],
): SimulationSkillDraftValidationResult {
  const kecoSkills: Skill[] = []
  const definitions: BattleSkillDefinition[] = []
  const draftErrors: { draftId: string; label: string; error: string }[] = []
  const seenIds = new Set<string>()

  if (drafts.length === 0) {
    return {
      ok: false,
      kecoSkills: [],
      definitions: [],
      draftErrors: [{ draftId: '', label: '', error: 'No simulation skill drafts to sync.' }],
    }
  }

  drafts.forEach((draft, index) => {
    const label =
      draft.fields.name?.value?.trim() ||
      draft.fields.id?.value?.trim() ||
      `Skill ${index + 1}`
    if (draft.invalidReason) {
      draftErrors.push({ draftId: draft.draftId, label, error: draft.invalidReason })
      return
    }

    const missingRequired = SIMULATION_SKILL_DRAFTS_REQUIRED_KEYS.filter(
      (key) => !draft.fields[key]?.value?.trim(),
    )
    if (missingRequired.length > 0) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: `Missing: ${missingRequired.join(', ')}`,
      })
      return
    }

    const flat = simulationFlatRowFromDraft(draft)
    if (!flat.id.trim()) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: 'Invalid skill id.',
      })
      return
    }
    if (!flat.name.trim()) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: 'Display name cannot be empty.',
      })
      return
    }

    const parsed = parseBattleSkillRow(flat)
    if (parsed.error || !parsed.definition) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: parsed.error ?? 'Invalid skill field values.',
      })
      return
    }
    const skillType = flat.skillType.trim().toLowerCase()
    if (skillType && skillType !== 'attack' && skillType !== 'heal') {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: `skillType "${flat.skillType}" is not supported.`,
      })
      return
    }
    if (flat.attachElement.trim() && flat.attachStrength.trim() && !parseStrengthKey(flat.attachStrength)) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: `attachStrength "${flat.attachStrength}" is invalid.`,
      })
      return
    }
    const specialType = String(parsed.definition.params?.specialEffect ?? '').trim()
    if (specialType && !['atk_debuff', 'def_debuff', 'heal'].includes(specialType)) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: 'Unsupported specialEffect "' + specialType + '"; supported values are atk_debuff, def_debuff, heal.',
      })
      return
    }

    const keco = flatRowToKecoSkillFromRow(flat)
    if (!keco) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: 'Could not convert draft to skill.',
      })
      return
    }
    if (flat.attachElement.trim() && !keco.attachElement) {
      draftErrors.push({ draftId: draft.draftId, label, error: 'attachElement is invalid.' })
      return
    }
    if (flat.reactionTriggersJson.trim() && !keco.reactionTrigger?.length) {
      draftErrors.push({ draftId: draft.draftId, label, error: 'reactionTriggersJson contains no valid reaction trigger.' })
      return
    }

    if (seenIds.has(keco.id)) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: `Duplicate skill id "${keco.id}".`,
      })
      return
    }
    seenIds.add(keco.id)

    kecoSkills.push(keco)
    const kecoDefinition = kecoSkillToBattleCoreDefinition(keco)
    definitions.push({
      ...kecoDefinition,
      ratio: parsed.definition.ratio,
      mpCost: parsed.definition.mpCost,
      range: parsed.definition.range,
      description: parsed.definition.description,
      params: parsed.definition.params,
      applyFreezeTicks: parsed.definition.applyFreezeTicks ?? kecoDefinition.applyFreezeTicks,
    })
  })

  return {
    ok: draftErrors.length === 0 && definitions.length > 0,
    kecoSkills,
    definitions,
    draftErrors,
  }
}

export { simulationFlatRowFromDraft, SIMULATION_SKILL_MAPPING_FIELD_KEYS }
