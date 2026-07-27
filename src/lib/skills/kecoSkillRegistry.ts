import type { Skill } from '@keco/battle-engine'

let baseSkillById: Record<string, Skill> | null = null
let simulationSkillById: Record<string, Skill> | null = null

export function setKecoSkillsRecord(record: Record<string, Skill>): void {
  baseSkillById = record
}

export function setSimulationKecoSkillsRecord(record: Record<string, Skill>): void {
  simulationSkillById = record
}

export function clearBaseKecoSkillsRecord(): void {
  baseSkillById = null
}

export function clearSimulationKecoSkillsRecord(): void {
  simulationSkillById = null
}

export function clearKecoSkillsRecord(): void {
  baseSkillById = null
  simulationSkillById = null
}

export function getKecoSkillsRecord(): Record<string, Skill> | null {
  if (!baseSkillById && !simulationSkillById) return null
  return { ...(baseSkillById ?? {}), ...(simulationSkillById ?? {}) }
}
