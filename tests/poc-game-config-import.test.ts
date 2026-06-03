import { describe, expect, it } from 'vitest'
import { mergeDraftsIntoBundle } from '@/src/lib/gameConfig/importPocGameConfig'
import type { PocGameConfigDraft } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import { applyGameConfigBundle, getBattleRewards, getExpForLevel } from '@/src/lib/gameConfig/gameConfigRegistry'
import { createDefaultGameConfigBundle } from '@/src/lib/gameConfig/defaultGameConfig'
import { getRoleSkillLoadout } from '@/src/battle-core/content/skills/basic-skill-catalog'

describe('game config import', () => {
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

  it('loadout flows to getRoleSkillLoadout', () => {
    const bundle = createDefaultGameConfigBundle()
    bundle.roleLoadouts.hero = ['taunt', 'shield_wall']
    applyGameConfigBundle(bundle)
    expect(getRoleSkillLoadout('hero')).toEqual(['taunt', 'shield_wall'])
  })
})
