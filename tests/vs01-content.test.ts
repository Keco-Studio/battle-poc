import { describe, expect, it } from 'vitest'
import { validateMapProject } from '@/src/lib/maps/map-project'
import {
  EMPTY_VS01_PROGRESS,
  VS01_ASSETS,
  VS01_ENEMIES,
  VS01_GAME,
  VS01_MAPS,
  VS01_RUBRIC,
  VS01_SKILLS,
  getVs01MapProject,
  isVs01CoreUnlocked,
  recordVs01Victory,
} from '@/src/content/generated/vs01'

describe('VS01 compiled content', () => {
  it('contains a complete reference graph', () => {
    const skills = new Set(VS01_SKILLS.map((skill) => skill.id))
    const enemies = new Set(VS01_ENEMIES.map((enemy) => enemy.id))
    const assets = new Set(VS01_ASSETS.map((asset) => asset.id))

    expect(VS01_GAME.playerSkillIds.every((id) => skills.has(id))).toBe(true)
    expect(VS01_ENEMIES.every((enemy) => enemy.skillIds.every((id) => skills.has(id)))).toBe(true)
    expect(VS01_ENEMIES.every((enemy) => assets.has(enemy.visualAssetId))).toBe(true)
    expect(VS01_MAPS.every((map) => map.enemyTemplateIds.every((id) => enemies.has(id)))).toBe(true)
    expect(VS01_RUBRIC.filter((item) => item.weight > 0).reduce((sum, item) => sum + item.weight, 0)).toBe(1)
  })

  it('produces valid static map projects', () => {
    for (const slug of ['emberwatch-causeway', 'ashen-relay-core']) {
      const project = getVs01MapProject(slug)
      expect(project).not.toBeNull()
      expect(validateMapProject(project)).toMatchObject({ ok: true })
      for (const definition of Object.values(project?.entityDefs ?? {})) {
        expect(definition.level).toBeGreaterThan(0)
      }
    }
  })

  it('unlocks the core only after all three causeway enemies', () => {
    let progress = EMPTY_VS01_PROGRESS
    progress = recordVs01Victory(progress, 'cinder_wisp')
    progress = recordVs01Victory(progress, 'iron_husk')
    expect(isVs01CoreUnlocked(progress)).toBe(false)
    progress = recordVs01Victory(progress, 'frost_revenant')
    expect(isVs01CoreUnlocked(progress)).toBe(true)
  })
})
