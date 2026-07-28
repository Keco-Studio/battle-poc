import { describe, expect, it } from 'vitest'
import { resolveGeneratedContent } from '@/src/content/generated/resolveGeneratedContent'
import { GENERATED_CONTENT_MANIFEST } from '@/src/content/generated/manifest'
import { GENERATED_BATTLE_SKILLS } from '@/src/content/generated/skills'
import { GENERATED_JOB_CLASSES } from '@/src/content/generated/jobs'
import { GENERATED_GAME_CONFIG } from '@/src/content/generated/game-config'
import { getBuiltinBattleSkillDefinitions } from '@/src/battle-core/content/skills/basic-skill-catalog'
import { getBuiltinJobClassConfigs } from '@/src/lib/jobs/builtinJobCatalog'
import { createDefaultGameConfigBundle } from '@/src/lib/gameConfig/defaultGameConfig'

describe('generated Keco content seam', () => {
  it('uses generated values when present and fallback values otherwise', () => {
    expect(resolveGeneratedContent({ value: 7 }, () => ({ value: 1 }))).toEqual({ value: 7 })
    expect(resolveGeneratedContent(null, () => ({ value: 1 }))).toEqual({ value: 1 })
  })

  it('selects the fully read-back VS01 Keco source', () => {
    expect(GENERATED_CONTENT_MANIFEST.domains.skills?.tableNames).toEqual(['VS01_Skills'])
    expect(GENERATED_CONTENT_MANIFEST.domains.jobs?.tableNames).toEqual(['VS01_Jobs'])
    expect(GENERATED_CONTENT_MANIFEST.domains.gameConfig?.tableNames).toEqual(['VS01_Game'])
    expect(GENERATED_BATTLE_SKILLS).toHaveLength(8)
    expect(GENERATED_JOB_CLASSES.map((job) => job.id)).toEqual(['relay_warden'])
    expect(GENERATED_GAME_CONFIG.roleLoadouts.relay_warden).toHaveLength(6)
  })

  it('exposes VS01 through the existing runtime registries', () => {
    expect(getBuiltinBattleSkillDefinitions().some((skill) => skill.id === 'relay_bolt')).toBe(true)
    expect(getBuiltinJobClassConfigs()).toHaveLength(6)
    expect(createDefaultGameConfigBundle().roleLoadouts.relay_warden).toContain('frost_lattice')
  })
})
