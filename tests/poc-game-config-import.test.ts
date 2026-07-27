import { describe, expect, it, vi } from 'vitest'
import { buildDraftFromTableRow, detectIdColumnKey, mergeDraftsIntoBundle } from '@/src/lib/gameConfig/importPocGameConfig'
import { ASSET_NAME_COLUMN_KEY } from '@/src/lib/studio/studioLibraryService'
import type { PocGameConfigDraft } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import { applyGameConfigBundle, getBattleRewards, getExpForLevel } from '@/src/lib/gameConfig/gameConfigRegistry'
import { createDefaultGameConfigBundle } from '@/src/lib/gameConfig/defaultGameConfig'
import { getRoleSkillLoadout } from '@/src/battle-core/content/skills/basic-skill-catalog'
import { upsertPocGameConfigDrafts, validateDraftsToBundle } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import {
  calcEnemyStats,
  calcPlayerStats,
  calcPlayerStatsWithEquipment,
  expForLevel,
  getBattleRewards as getRuntimeBattleRewards,
  getSkillById,
  mitigatedPhysicalDamage,
} from '@/app/constants'
import { createBattleSession } from '@/src/battle-core/domain/entities/battle-session'
import type { BattleEntity } from '@/src/battle-core/domain/entities/battle-entity'
import { enqueueBattleCommand, processBattleCommands } from '@/src/battle-core/engine/command-processor'
import { applyDefinitionsToRuntimeCatalog } from '@/src/lib/skills/pocSkillModulesStorage'
import { resetSkillCatalogToBuiltin } from '@/src/battle-core/content/skills/basic-skill-catalog'

describe('game config import', () => {
  it('requires an explicit id column and retains blank recognized bindings', () => {
    expect(detectIdColumnKey([{ key: ASSET_NAME_COLUMN_KEY, label: 'Name' }], 'equipment')).toBeUndefined()
    const draft = buildDraftFromTableRow({
      kind: 'equipment',
      tableId: 'studio:config',
      row: { id: 'r1', values: { id: 'weapon', bonus: '' } },
      columns: [{ key: 'id', label: 'id' }, { key: 'bonus', label: 'bonus' }],
      idColumnKey: 'id',
      idValue: 'weapon',
    })
    expect(draft.fields.bonus).toMatchObject({ columnKey: 'bonus', value: '' })
  })
  it('rejects malformed numeric config values instead of silently keeping defaults', () => {
    const { bundle, errors } = mergeDraftsIntoBundle([{
      draftId: 'bad-bonus',
      kind: 'equipment',
      fields: {
        id: { tableId: 't', columnKey: 'id', value: 'weapon' },
        bonus: { tableId: 't', columnKey: 'bonus', value: 'not-a-number' },
      },
    }])
    expect(errors[0]?.error).toContain('bonus')
    expect(bundle.equipment.weapon.bonus).toBe(createDefaultGameConfigBundle().equipment.weapon.bonus)
  })
  it('rejects an unknown equipment stat instead of silently using atk', () => {
    const { errors } = mergeDraftsIntoBundle([{
      draftId: 'bad-stat',
      kind: 'equipment',
      fields: {
        id: { tableId: 't', columnKey: 'id', value: 'weapon' },
        stat: { tableId: 't', columnKey: 'stat', value: 'critical_chance' },
        bonus: { tableId: 't', columnKey: 'bonus', value: '2' },
      },
    }])

    expect(errors[0]?.error).toMatch(/stat/i)
  })
  it('merges equipment and balance drafts', () => {
    const drafts: PocGameConfigDraft[] = [
      {
        draftId: '1',
        kind: 'equipment',
        fields: {
          id: { tableId: 't', columnKey: 'id', value: 'weapon' },
          bonus: { tableId: 't', columnKey: 'b', value: '2' },
        },
      },
      {
        draftId: '2',
        kind: 'balance_scalar',
        fields: {
          id: { tableId: 't', columnKey: 'id', value: 'exp_per_level' },
          value: { tableId: 't', columnKey: 'v', value: '15' },
        },
      },
      {
        draftId: '3',
        kind: 'loadout',
        fields: {
          id: { tableId: 't', columnKey: 'id', value: 'mage' },
          skillIds: { tableId: 't', columnKey: 's', value: 'fireball,arcane_bolt' },
        },
      },
    ]
    const { bundle, errors } = mergeDraftsIntoBundle(drafts)
    expect(errors).toHaveLength(0)
    expect(bundle.equipment.weapon.bonus).toBe(2)
    expect(bundle.progression.expPerLevel).toBe(15)
    expect(bundle.roleLoadouts.mage).toEqual(['fireball', 'arcane_bolt'])
  })

  it('registry drives exp and rewards after apply', () => {
    const bundle = createDefaultGameConfigBundle()
    bundle.progression.expPerLevel = 20
    bundle.progression.rewardGoldPerEnemyLevel = 5
    applyGameConfigBundle(bundle)
    expect(getExpForLevel(3)).toBe(60)
    expect(getBattleRewards(4)).toEqual({ exp: 4, gold: 20 })
  })

  it('drives player equipment, progression, enemy, basic attack, and armor runtime reads', () => {
    const bundle = createDefaultGameConfigBundle()
    bundle.equipment.weapon = { name: 'Guard Blade', icon: 'G', stat: 'def', bonus: 7 }
    bundle.progression.expPerLevel = 25
    bundle.progression.rewardExpPerEnemyLevel = 3
    bundle.progression.rewardGoldPerEnemyLevel = 9
    bundle.enemyFormula = {
      base: { hp: 10, atk: 2, def: 3, spd: 4 },
      growth: { hp: 5, atk: 6, def: 7, spd: 8 },
      hpMultiplier: 2,
    }
    bundle.basicAttack.multiplier = 4
    bundle.battleFormulas.armorK = 100
    applyGameConfigBundle(bundle)

    const base = calcPlayerStats(2, 'hero')
    expect(calcPlayerStatsWithEquipment(2, 'hero', { weapon: true })).toEqual({
      ...base,
      def: base.def + 14,
    })
    expect(expForLevel(3)).toBe(75)
    expect(getRuntimeBattleRewards(4)).toEqual({ exp: 12, gold: 36 })
    expect(calcEnemyStats(3)).toEqual({ maxHp: 40, atk: 14, def: 17, spd: 20 })
    expect(getSkillById('basic_attack')?.multiplier).toBe(4)
    expect(mitigatedPhysicalDamage(100, 50)).toBe(66)
  })

  it('uses imported damage and defend multipliers in battle commands', () => {
    const bundle = createDefaultGameConfigBundle()
    bundle.battleFormulas.basicDamageMultiplier = 2
    bundle.basicAttack.multiplier = 1.5
    bundle.battleFormulas.skillDamageMultiplier = 3
    bundle.battleFormulas.defendDamageReduction = 0.25
    bundle.battleFormulas.defendSkillReduction = 0.4
    applyGameConfigBundle(bundle)
    applyDefinitionsToRuntimeCatalog([{
      id: 'config_skill', name: 'Config Skill', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0,
    }])
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)

    try {
      const basic = runDamageCommand('basic_attack', 'basic_attack')
      expect(basic.right.resources.hp).toBe(89)
      const skill = runDamageCommand('cast_skill', 'config_skill')
      expect(skill.right.resources.hp).toBe(82)
    } finally {
      random.mockRestore()
      resetSkillCatalogToBuiltin()
    }
  })

  it('loadout flows to getRoleSkillLoadout', () => {
    const bundle = createDefaultGameConfigBundle()
    bundle.roleLoadouts.hero = ['taunt', 'shield_wall']
    applyGameConfigBundle(bundle)
    expect(getRoleSkillLoadout('hero')).toEqual(['taunt', 'shield_wall'])
  })

  it('blocks Apply when a game-config source row is marked missing', () => {
    const result = validateDraftsToBundle([{
      draftId: 'deleted-row',
      kind: 'balance_scalar',
      invalidReason: 'Source table row not found; rebind this draft before applying.',
      fields: {
        id: { tableId: 'table-1', columnKey: 'id', value: 'exp_per_level' },
        value: { tableId: 'table-1', columnKey: 'value', value: '999' },
      },
    }])
    expect(result.ok).toBe(false)
    expect(result.draftErrors[0]?.error).toContain('rebind')
  })

  it('replaces an existing config draft with the same kind and normalized id', () => {
    const existing: PocGameConfigDraft = {
      draftId: 'old',
      kind: 'balance_scalar',
      fields: {
        id: { tableId: 'old-table', columnKey: 'id', value: 'EXP_PER_LEVEL' },
        value: { tableId: 'old-table', columnKey: 'value', value: '10' },
      },
    }
    const incoming: PocGameConfigDraft = {
      draftId: 'new',
      kind: 'balance_scalar',
      fields: {
        id: { tableId: 'studio-table', columnKey: 'id', value: 'exp_per_level' },
        value: { tableId: 'studio-table', columnKey: 'value', value: '25' },
      },
    }

    expect(upsertPocGameConfigDrafts([existing], [incoming])).toEqual([incoming])
  })
})

function makeEntity(id: string, team: 'left' | 'right'): BattleEntity {
  return {
    id,
    name: id,
    team,
    position: { x: team === 'left' ? 1 : 2, y: 1 },
    resources: { hp: 100, maxHp: 100, mp: 20, maxMp: 20, stamina: 10, maxStamina: 10, rage: 0, maxRage: 100, shield: 0, maxShield: 10 },
    atk: 20,
    def: 10,
    spd: 5,
    skillSlots: team === 'left' ? [{ skillId: 'config_skill', cooldownTick: 0 }] : [],
    defending: team === 'right',
    alive: true,
    effects: [],
  }
}

function runDamageCommand(action: 'basic_attack' | 'cast_skill', skillId: string) {
  const left = makeEntity(`left-${action}`, 'left')
  const right = makeEntity(`right-${action}`, 'right')
  let session = createBattleSession({ left, right, preparationTicks: 0 })
  session = enqueueBattleCommand(session, {
    commandId: `command-${action}`,
    sessionId: session.id,
    actorId: left.id,
    targetId: right.id,
    skillId,
    action,
    tick: 0,
  })
  return processBattleCommands({ ...session, tick: 1 }).session
}
