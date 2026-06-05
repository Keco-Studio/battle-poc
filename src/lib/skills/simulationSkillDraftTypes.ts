/**
 * keco-simulation battle skill draft shape (Studio import bindings).
 * Kept aligned with keco-simulation battleSkillDrafts.ts for cross-app sync.
 */

export type SimulationSkillColumnMappingKey =
  | 'id'
  | 'name'
  | 'type'
  | 'power'
  | 'mpCost'
  | 'maxCooldown'
  | 'description'
  | 'attachElement'
  | 'attachStrength'
  | 'attachDuration'
  | 'dotDamage'
  | 'dotDuration'
  | 'freezeDuration'
  | 'specialType'
  | 'specialValue'
  | 'specialDuration'
  | 'reactionTriggersJson'

export type SimulationLocalTableCellRef = {
  tableId: string
  columnKey: string
  value: string
}

export type SimulationSkillDraft = {
  draftId: string
  sourceRowId?: string
  fields: Partial<Record<SimulationSkillColumnMappingKey, SimulationLocalTableCellRef>>
}

export type SimulationSkillDraftsPersisted = {
  version: 1
  drafts: SimulationSkillDraft[]
}

export const SIMULATION_SKILL_MAPPING_FIELD_KEYS: SimulationSkillColumnMappingKey[] = [
  'id',
  'name',
  'type',
  'power',
  'mpCost',
  'maxCooldown',
  'description',
  'attachElement',
  'attachStrength',
  'attachDuration',
  'dotDamage',
  'dotDuration',
  'freezeDuration',
  'specialType',
  'specialValue',
  'specialDuration',
  'reactionTriggersJson',
]

export const SIMULATION_SKILL_DRAFTS_REQUIRED_KEYS: SimulationSkillColumnMappingKey[] = [
  'id',
  'name',
]
