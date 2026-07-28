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

  it('starts without silently selecting a Keco source', () => {
    expect(GENERATED_CONTENT_MANIFEST.domains).toEqual({
      skills: null,
      jobs: null,
      gameConfig: null,
    })
    expect(GENERATED_BATTLE_SKILLS).toBeNull()
    expect(GENERATED_JOB_CLASSES).toBeNull()
    expect(GENERATED_GAME_CONFIG).toBeNull()
  })

  it('keeps current code defaults active until an MCP source is requested', () => {
    expect(getBuiltinBattleSkillDefinitions()).not.toHaveLength(0)
    expect(getBuiltinJobClassConfigs()).not.toHaveLength(0)
    expect(createDefaultGameConfigBundle().progression.expPerLevel).toBeGreaterThan(0)
  })
})
