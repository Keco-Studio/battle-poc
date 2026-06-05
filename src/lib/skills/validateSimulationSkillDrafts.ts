/**
 * Validate simulation-format drafts → Keco Skill → battle-core definitions.
 */

import type { Skill } from '@keco/battle-engine'
import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'
import { kecoSkillToBattleCoreDefinition } from '@/src/keco/kecoSkillBridge'
import { flatRowToKecoSkillFromRow } from './kecoSkillTableCodec'
import { emptyPocSkillFlatRow, resolveSkillId, type PocSkillFlatRow } from './pocSkillFieldMapping'
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

    const keco = flatRowToKecoSkillFromRow(flat)
    if (!keco) {
      draftErrors.push({
        draftId: draft.draftId,
        label,
        error: 'Could not convert draft to skill.',
      })
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
    definitions.push(kecoSkillToBattleCoreDefinition(keco))
  })

  return {
    ok: draftErrors.length === 0 && definitions.length > 0,
    kecoSkills,
    definitions,
    draftErrors,
  }
}

export { simulationFlatRowFromDraft, SIMULATION_SKILL_MAPPING_FIELD_KEYS }
