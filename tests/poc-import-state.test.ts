import { beforeEach, describe, expect, it } from 'vitest'
import { getBuiltinBattleSkillDefinitions } from '@/src/battle-core/content/skills/basic-skill-catalog'
import {
  DRAFT_SKILL_MODULE_ID,
  savePocSkillModulesState,
  studioModuleId as skillStudioModuleId,
  upsertDraftModule as upsertSkillDraftModule,
  upsertStudioModule as upsertSkillStudioModule,
} from '@/src/lib/skills/pocSkillModulesStorage'
import { applyPocSkillDrafts, bootstrapPocSkillsFromPersistence, hydratePocSkills } from '@/src/lib/skills/pocSkillsStorage'
import { savePocSkillDrafts } from '@/src/lib/skills/pocSkillDrafts'
import { getBuiltinJobClassConfigs } from '@/src/lib/jobs/builtinJobCatalog'
import {
  DRAFT_JOB_MODULE_ID,
  savePocJobModulesState,
  studioModuleId as jobStudioModuleId,
  upsertDraftModule as upsertJobDraftModule,
  upsertStudioModule as upsertJobStudioModule,
} from '@/src/lib/jobs/pocJobModulesStorage'
import { applyPocJobDrafts, bootstrapPocJobsFromPersistence, hydratePocJobs } from '@/src/lib/jobs/pocJobsStorage'
import { savePocJobDrafts } from '@/src/lib/jobs/pocJobDrafts'
import { createDefaultGameConfigBundle } from '@/src/lib/gameConfig/defaultGameConfig'
import { savePocGameConfigModulesState } from '@/src/lib/gameConfig/pocGameConfigModulesStorage'
import { applyPocGameConfigDrafts, bootstrapPocGameConfigFromPersistence, hydratePocGameConfig } from '@/src/lib/gameConfig/pocGameConfigStorage'
import { savePocGameConfigDrafts } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import { refreshPocSkillDraftsFromLiveTables } from '@/src/lib/skills/refreshPocSkillDrafts'
import { refreshPocJobDraftsFromLiveTables } from '@/src/lib/jobs/refreshPocJobDrafts'
import { refreshPocGameConfigDraftsFromLiveTables } from '@/src/lib/gameConfig/refreshPocGameConfigDrafts'
import { refreshSimulationSkillDraftsFromLiveTables } from '@/src/lib/skills/refreshSimulationSkillDrafts'

function installMemoryStorage() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    clear: () => { values.clear() },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
}

describe('strict Studio import runtime state', () => {
  beforeEach(() => installMemoryStorage())

  it('removes every stale draft module when Apply receives no drafts', async () => {
    const skillBuiltins = getBuiltinBattleSkillDefinitions()
    savePocSkillModulesState({ activeModuleId: DRAFT_SKILL_MODULE_ID, modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', definitions: skillBuiltins },
      { id: DRAFT_SKILL_MODULE_ID, label: 'Stale', source: 'drafts', definitions: skillBuiltins },
      { id: 'studio:legacy', label: 'Legacy Studio', source: 'studio', studioLibraryId: 'legacy', definitions: skillBuiltins },
    ] }, { notify: false })
    savePocSkillDrafts([])

    const jobBuiltins = getBuiltinJobClassConfigs()
    savePocJobModulesState({ activeModuleId: DRAFT_JOB_MODULE_ID, modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', configs: jobBuiltins },
      { id: DRAFT_JOB_MODULE_ID, label: 'Stale', source: 'drafts', configs: jobBuiltins },
      { id: 'studio:legacy', label: 'Legacy Studio', source: 'studio', studioLibraryId: 'legacy', configs: jobBuiltins },
    ] }, { notify: false })
    savePocJobDrafts([])

    const bundle = createDefaultGameConfigBundle()
    savePocGameConfigModulesState({ activeModuleId: 'studio-drafts', modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', bundle },
      { id: 'studio-drafts', label: 'Stale', source: 'drafts', bundle },
    ] }, { notify: false })
    savePocGameConfigDrafts([])

    const [skills, jobs, config] = await Promise.all([
      applyPocSkillDrafts(null),
      applyPocJobDrafts(null),
      applyPocGameConfigDrafts(null),
    ])

    expect(skills.state.activeModuleId).toBe('builtin')
    expect(jobs.state.activeModuleId).toBe('builtin')
    expect(config.state.activeModuleId).toBe('builtin')
    expect(skills.state.modules.some((module) => module.source === 'studio')).toBe(false)
    expect(jobs.state.modules.some((module) => module.source === 'studio')).toBe(false)
    expect(skills.errors.length).toBeGreaterThan(0)
    expect(jobs.errors.length).toBeGreaterThan(0)
    expect(config.errors.length).toBeGreaterThan(0)
  })

  it('does not bootstrap unvalidated imported modules from persistence', () => {
    const skillBuiltins = getBuiltinBattleSkillDefinitions()
    savePocSkillModulesState({ activeModuleId: DRAFT_SKILL_MODULE_ID, modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', definitions: skillBuiltins },
      { id: DRAFT_SKILL_MODULE_ID, label: 'Stale', source: 'drafts', definitions: [{ id: 'stale_skill', name: 'Stale', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }] },
      { id: 'simulation-sync', label: 'Stale simulation', source: 'simulation-sync', definitions: [{ id: 'stale_simulation', name: 'Stale simulation', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }] },
    ] }, { notify: false })

    const jobBuiltins = getBuiltinJobClassConfigs()
    savePocJobModulesState({ activeModuleId: DRAFT_JOB_MODULE_ID, modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', configs: jobBuiltins },
      { id: DRAFT_JOB_MODULE_ID, label: 'Stale', source: 'drafts', configs: [{ ...jobBuiltins[0]!, id: 'stale_job' }] },
    ] }, { notify: false })

    const bundle = createDefaultGameConfigBundle()
    const staleBundle = createDefaultGameConfigBundle()
    staleBundle.progression.expPerLevel = 999
    savePocGameConfigModulesState({ activeModuleId: 'studio-drafts', modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', bundle },
      { id: 'studio-drafts', label: 'Stale', source: 'drafts', bundle: staleBundle },
    ] }, { notify: false })

    expect(bootstrapPocSkillsFromPersistence().skills.some((skill) => skill.id === 'stale_skill')).toBe(false)
    expect(bootstrapPocJobsFromPersistence().jobClassIds).not.toContain('stale_job')
    expect(bootstrapPocGameConfigFromPersistence().progression.expPerLevel).not.toBe(999)
  })

  it('removes stale draft modules during hydrate when there are no Studio bindings', async () => {
    const skillBuiltins = getBuiltinBattleSkillDefinitions()
    savePocSkillModulesState({ activeModuleId: DRAFT_SKILL_MODULE_ID, modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', definitions: skillBuiltins },
      { id: DRAFT_SKILL_MODULE_ID, label: 'Stale', source: 'drafts', definitions: [{ id: 'stale_skill', name: 'Stale', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }] },
      { id: 'simulation-sync', label: 'Stale simulation', source: 'simulation-sync', definitions: [{ id: 'stale_simulation', name: 'Stale simulation', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }] },
    ] }, { notify: false })
    savePocSkillDrafts([])

    const jobBuiltins = getBuiltinJobClassConfigs()
    savePocJobModulesState({ activeModuleId: DRAFT_JOB_MODULE_ID, modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', configs: jobBuiltins },
      { id: DRAFT_JOB_MODULE_ID, label: 'Stale', source: 'drafts', configs: [{ ...jobBuiltins[0]!, id: 'stale_job' }] },
    ] }, { notify: false })
    savePocJobDrafts([])

    const bundle = createDefaultGameConfigBundle()
    const staleBundle = createDefaultGameConfigBundle()
    staleBundle.progression.expPerLevel = 999
    savePocGameConfigModulesState({ activeModuleId: 'studio-drafts', modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', bundle },
      { id: 'studio-drafts', label: 'Stale', source: 'drafts', bundle: staleBundle },
    ] }, { notify: false })
    savePocGameConfigDrafts([])

    const [skills, jobs, config] = await Promise.all([
      hydratePocSkills(null),
      hydratePocJobs(null),
      hydratePocGameConfig(null),
    ])

    expect(skills.state.activeModuleId).toBe('builtin')
    expect(skills.skills.some((skill) => skill.id === 'stale_skill')).toBe(false)
    expect(skills.skills.some((skill) => skill.id === 'stale_simulation')).toBe(false)
    expect(skills.state.modules.some((module) => module.id === 'simulation-sync')).toBe(false)
    expect(jobs.state.activeModuleId).toBe('builtin')
    expect(jobs.snapshot.jobClassIds).not.toContain('stale_job')
    expect(config.state.activeModuleId).toBe('builtin')
    expect(config.bundle.progression.expPerLevel).not.toBe(999)
  })

  it('re-applies drafts against their original Studio base module', () => {
    const skillState = upsertSkillStudioModule({
      activeModuleId: 'builtin',
      modules: [{ id: 'builtin', label: 'Default', source: 'builtin', definitions: getBuiltinBattleSkillDefinitions() }],
    }, 'skills-lib', 'Studio skills', [{ id: 'studio_only', name: 'Studio only', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }])
    const skillFirst = upsertSkillDraftModule(skillState, 'Drafts', [{ id: 'draft_one', name: 'One', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }])
    const skillSecond = upsertSkillDraftModule(skillFirst, 'Drafts', [{ id: 'draft_two', name: 'Two', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }])
    const skillDraft = skillSecond.modules.find((m) => m.id === DRAFT_SKILL_MODULE_ID)!
    expect((skillDraft as { baseModuleId?: string }).baseModuleId).toBe(skillStudioModuleId('skills-lib'))
    expect(skillDraft.definitions.some((d) => d.id === 'studio_only')).toBe(true)

    const jobState = upsertJobStudioModule({
      activeModuleId: 'builtin',
      modules: [{ id: 'builtin', label: 'Default', source: 'builtin', configs: getBuiltinJobClassConfigs() }],
    }, 'jobs-lib', 'Studio jobs', [{ ...getBuiltinJobClassConfigs()[0]!, id: 'studio_job' }])
    const jobFirst = upsertJobDraftModule(jobState, 'Drafts', [{ ...getBuiltinJobClassConfigs()[0]!, id: 'draft_job_one' }])
    const jobSecond = upsertJobDraftModule(jobFirst, 'Drafts', [{ ...getBuiltinJobClassConfigs()[0]!, id: 'draft_job_two' }])
    const jobDraft = jobSecond.modules.find((m) => m.id === DRAFT_JOB_MODULE_ID)!
    expect((jobDraft as { baseModuleId?: string }).baseModuleId).toBe(jobStudioModuleId('jobs-lib'))
    expect(jobDraft.configs.some((config) => config.id === 'studio_job')).toBe(true)
  })

  it('marks local-only drafts invalid instead of treating localStorage as authority', async () => {
    const [skills, jobs, config] = await Promise.all([
      refreshPocSkillDraftsFromLiveTables([{
        draftId: 'local-skill',
        fields: {
          id: { tableId: '', columnKey: 'id', value: 'local_skill' },
          name: { tableId: '', columnKey: 'name', value: 'Local Skill' },
          mpCost: { tableId: '', columnKey: 'mp', value: '0' },
          maxCooldown: { tableId: '', columnKey: 'cooldown', value: '0' },
        },
      }], async () => null),
      refreshPocJobDraftsFromLiveTables([{
        draftId: 'local-job',
        fields: {
          id: { tableId: '', columnKey: 'id', value: 'local_job' },
          name: { tableId: '', columnKey: 'name', value: 'Local Job' },
        },
      }], async () => null),
      refreshPocGameConfigDraftsFromLiveTables(null, [{
        draftId: 'local-config',
        kind: 'balance_scalar',
        fields: {
          id: { tableId: '', columnKey: 'id', value: 'exp_per_level' },
          value: { tableId: '', columnKey: 'value', value: '999' },
        },
      }]),
    ])

    expect(skills.drafts[0]?.invalidReason).toMatch(/Studio.*binding/i)
    expect(jobs.drafts[0]?.invalidReason).toMatch(/Studio.*binding/i)
    expect(config.drafts[0]?.invalidReason).toMatch(/Studio.*binding/i)
  })

  it('rejects normalized id collisions introduced in complete live Studio tables', async () => {
    const skillRows = [
      { id: 'skill-row-1', values: { id: 'Arc Spark', name: 'Arc Spark' } },
      { id: 'skill-row-2', values: { id: 'Arc_Spark', name: 'Collision' } },
    ]
    const jobRows = [
      { id: 'job-row-1', values: { id: 'Dark Mage', name: 'Dark Mage' } },
      { id: 'job-row-2', values: { id: 'dark_mage', name: 'Collision' } },
    ]
    const configRows = [
      { id: 'config-row-1', values: { id: 'enemy_base_hp', value: '100' } },
      { id: 'config-row-2', values: { id: 'enemy_base_atk', value: '10' } },
      { id: 'config-row-3', values: { id: ' ENEMY_BASE_ATK ', value: '20' } },
    ]
    const [skills, jobs, config, simulation] = await Promise.all([
      refreshPocSkillDraftsFromLiveTables([{
        draftId: 'skill-collision',
        sourceRowId: 'skill-row-1',
        fields: {
          id: { tableId: 'skills', columnKey: 'id', value: 'Arc Spark' },
          name: { tableId: 'skills', columnKey: 'name', value: 'Arc Spark' },
        },
      }], async () => skillRows),
      refreshPocJobDraftsFromLiveTables([{
        draftId: 'job-collision',
        sourceRowId: 'job-row-1',
        fields: {
          id: { tableId: 'jobs', columnKey: 'id', value: 'Dark Mage' },
          name: { tableId: 'jobs', columnKey: 'name', value: 'Dark Mage' },
        },
      }], async () => jobRows),
      refreshPocGameConfigDraftsFromLiveTables({} as never, [{
        draftId: 'config-collision',
        sourceRowId: 'config-row-1',
        kind: 'balance_scalar',
        fields: {
          id: { tableId: 'config', columnKey: 'id', value: 'enemy_base_hp' },
          value: { tableId: 'config', columnKey: 'value', value: '100' },
        },
      }], async () => ({ columns: [], rows: configRows })),
      refreshSimulationSkillDraftsFromLiveTables([{
        draftId: 'simulation-collision',
        sourceRowId: 'skill-row-1',
        fields: {
          id: { tableId: 'skills', columnKey: 'id', value: 'Arc Spark' },
          name: { tableId: 'skills', columnKey: 'name', value: 'Arc Spark' },
        },
      }], async () => ({
        columns: [{ key: 'id', label: 'id' }, { key: 'name', label: 'name' }],
        rows: skillRows,
      })),
    ])

    expect(skills.drafts[0]?.invalidReason).toMatch(/duplicate/i)
    expect(jobs.drafts[0]?.invalidReason).toMatch(/duplicate/i)
    expect(config.drafts[0]?.invalidReason).toMatch(/duplicate/i)
    expect(simulation.drafts[0]?.invalidReason).toMatch(/duplicate/i)
  })
})
