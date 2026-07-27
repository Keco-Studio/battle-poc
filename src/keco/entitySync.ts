import type { BattleUnit } from '@keco/battle-engine'
import type { BattleEntity } from '../battle-core/domain/entities/battle-entity'

export function entityToKecoUnit(entity: BattleEntity): BattleUnit {
  return {
    id: entity.id,
    name: entity.name,
    hp: entity.resources.hp,
    maxHp: entity.resources.maxHp,
    atk: entity.atk,
    def: entity.def,
    spd: entity.spd,
    mp: entity.resources.mp,
    maxMp: entity.resources.maxMp,
    type: entity.team === 'left' ? 'player' : 'monster',
    element: null,
    dot: null,
    buffs: [],
    control: null,
  }
}

export function syncEntityToKecoUnit(
  entity: BattleEntity,
  existing?: BattleUnit,
): BattleUnit {
  const current = entityToKecoUnit(entity)
  if (!existing) return current
  return {
    ...current,
    element: existing.element,
    dot: existing.dot,
    buffs: [...existing.buffs],
    control: existing.control,
  }
}

export function applyKecoUnitToEntity(entity: BattleEntity, unit: BattleUnit): BattleEntity {
  return {
    ...entity,
    atk: unit.atk,
    def: unit.def,
    spd: unit.spd,
    alive: unit.hp > 0,
    resources: {
      ...entity.resources,
      hp: unit.hp,
      maxHp: unit.maxHp,
      mp: unit.mp,
      maxMp: unit.maxMp,
    },
  }
}
