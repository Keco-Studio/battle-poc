import type { Skill } from '@keco/battle-engine'

let skillById: Record<string, Skill> | null = null

export function setKecoSkillsRecord(record: Record<string, Skill>): void {
  skillById = record
}

export function getKecoSkillsRecord(): Record<string, Skill> | null {
  return skillById
}
