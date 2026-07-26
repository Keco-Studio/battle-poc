import type { StudioTableColumn } from '@/src/lib/studio/studioLibraryService'
import { normalizeHeaderToken } from '@/src/lib/jobs/pocJobFieldMapping'
import { planImportColumnMapping as planSkillColumns } from '@/src/lib/skills/importPocSkillFromTable'
import { POC_SKILL_MAPPING_FIELDS } from '@/src/lib/skills/pocSkillFieldMapping'
import { planImportColumnMapping as planJobColumns } from '@/src/lib/jobs/importPocJobFromTable'
import { POC_JOB_MAPPING_FIELDS } from '@/src/lib/jobs/pocJobFieldMapping'
import { detectIdColumnKey as detectSkillIdColumn } from '@/src/lib/skills/importPocSkillFromTable'
import { detectIdColumnKey as detectJobIdColumn } from '@/src/lib/jobs/importPocJobFromTable'
import { detectIdColumnKey as detectGameConfigIdColumn } from '@/src/lib/gameConfig/importPocGameConfig'
import type { GameConfigImportKind } from '@/src/lib/gameConfig/gameConfigTypes'
import type { PocSkillColumnMappingKey } from '@/src/lib/skills/pocSkillFieldMapping'
import type { PocJobColumnMappingKey } from '@/src/lib/jobs/pocJobFieldMapping'

export type StudioImportKind =
  | 'skills'
  | 'job_classes'
  | 'equipment'
  | 'loadout'
  | 'basic_attack'
  | 'balance_scalar'

export type StudioTableValidation = {
  ok: boolean
  errors: string[]
  warnings: string[]
  /** Human-readable mapped field labels for the current import kind. */
  matchedFields: string[]
  /** When headers look like another import type. */
  suspectedKind?: StudioImportKind
}

const JOB_HEADER_TOKENS = new Set([
  'hp',
  'basehp',
  'atk',
  'baseatk',
  'def',
  'basedef',
  'spd',
  'basespd',
  'growthhp',
  'hpmult',
  'hpgrowth',
  'growthatk',
  'atkgrowth',
  'growthdef',
  'defgrowth',
  'growthspd',
  'spdgrowth',
  'preferredrange',
  'hpmultiplier',
])

const SKILL_HEADER_TOKENS = new Set([
  'ratio',
  'power',
  'damage',
  'multiplier',
  'mpcost',
  'mp',
  'manacost',
  'cooldownticks',
  'cooldown',
  'cd',
  'maxcd',
  'skillcategory',
  'skilltype',
  'category',
  'applyfreezeticks',
  'freezeticks',
  'freezeduration',
  'shatterbonusratio',
  'shatterbonus',
  'attachelement',
  'dotdamage',
])

const LOADOUT_HEADER_TOKENS = new Set(['skillids', 'skills', 'defaultskills', 'loadout'])
const BALANCE_HEADER_TOKENS = new Set(['value', 'amount'])
const EQUIPMENT_HEADER_TOKENS = new Set(['stat', 'bonus', 'icon'])
const BASIC_ATTACK_HEADER_TOKENS = new Set(['multiplier', 'ratio'])

function columnTokens(col: StudioTableColumn): string[] {
  const label = normalizeHeaderToken(col.label)
  const key = normalizeHeaderToken(col.key)
  return [label, key].filter(Boolean)
}

function countHeaderSignature(columns: StudioTableColumn[], tokens: Set<string>): number {
  let n = 0
  for (const col of columns) {
    if (columnTokens(col).some((t) => tokens.has(t))) n++
  }
  return n
}

function colMatchesAny(col: StudioTableColumn, tokens: Set<string>): boolean {
  return columnTokens(col).some((t) => tokens.has(t))
}

function labelForSkillKey(key: PocSkillColumnMappingKey): string {
  return POC_SKILL_MAPPING_FIELDS.find((f) => f.key === key)?.label ?? key
}

function labelForJobKey(key: PocJobColumnMappingKey): string {
  return POC_JOB_MAPPING_FIELDS.find((f) => f.key === key)?.label ?? key
}

function hasColumnAlias(columns: StudioTableColumn[], aliases: string[]): boolean {
  return columns.some((col) => {
    const tokens = columnTokens(col)
    return aliases.some((a) => tokens.includes(normalizeHeaderToken(a)))
  })
}

export function validateStudioTableForImport(
  columns: StudioTableColumn[],
  kind: StudioImportKind,
): StudioTableValidation {
  if (columns.length === 0) {
    return {
      ok: false,
      errors: ['表没有列，无法在 Studio 中导入。'],
      warnings: [],
      matchedFields: [],
    }
  }

  if (kind === 'skills') return validateSkillTable(columns)
  if (kind === 'job_classes') return validateJobTable(columns)
  return validateGameConfigTable(columns, kind)
}

function validateSkillTable(columns: StudioTableColumn[]): StudioTableValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const jobSig = countHeaderSignature(columns, JOB_HEADER_TOKENS)
  const skillSig = countHeaderSignature(columns, SKILL_HEADER_TOKENS)

  const plan = planSkillColumns(columns, {})
  const mapped = new Set(plan.columnToField.values())
  const matchedFields = [...mapped].map(labelForSkillKey)

  if (!detectSkillIdColumn(columns)) {
    errors.push('缺少 id / skill_id 列，无法按技能 id 导入。')
  }

  const hasCombatField =
    mapped.has('power') ||
    mapped.has('mpCost') ||
    mapped.has('maxCooldown') ||
    mapped.has('category')

  if (!hasCombatField && skillSig === 0) {
    errors.push(
      '缺少技能战斗相关列（如 power/ratio、mp_cost、max_cooldown、category）。仅导入 id/名称会导致伤害与冷却使用错误默认值。',
    )
  } else if (!hasCombatField && skillSig > 0) {
    warnings.push('部分技能列未被识别，请检查表头拼写或在映射弹窗中手动指定。')
  }

  if (jobSig >= 2 && skillSig === 0) {
    errors.push(
      '该表更像「职业属性」表（含 hp、growth_hp 等），不能用于导入技能。请在导入中心选择「职业属性」。',
    )
    return {
      ok: false,
      errors,
      warnings,
      matchedFields,
      suspectedKind: 'job_classes',
    }
  }

  if (jobSig >= 3 && skillSig < 2) {
    errors.push(
      '表头以成长属性为主，与技能表不匹配。请换用 battle_skills 模板表，或改选「职业属性」导入。',
    )
    return {
      ok: false,
      errors,
      warnings,
      matchedFields,
      suspectedKind: 'job_classes',
    }
  }

  if (plan.ambiguities.length > 0) {
    warnings.push(
      `有 ${plan.ambiguities.length} 个表头需要确认映射（点击导入时会弹出）。`,
    )
  }

  const ok = errors.length === 0 && Boolean(detectSkillIdColumn(columns))
  return { ok, errors, warnings, matchedFields }
}

function validateJobTable(columns: StudioTableColumn[]): StudioTableValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const jobSig = countHeaderSignature(columns, JOB_HEADER_TOKENS)
  const skillSig = countHeaderSignature(columns, SKILL_HEADER_TOKENS)

  const plan = planJobColumns(columns, {})
  const mapped = new Set(plan.columnToField.values())
  const matchedFields = [...mapped].map(labelForJobKey)

  if (!detectJobIdColumn(columns)) {
    errors.push('缺少 id / class_id / job_id 列，无法按职业 id 导入。')
  }

  const hasStatField =
    mapped.has('hp') ||
    mapped.has('growthHp') ||
    mapped.has('hpMult') ||
    mapped.has('atk') ||
    mapped.has('growthAtk')

  if (!hasStatField && jobSig === 0) {
    errors.push(
      '缺少职业成长列（如 hp、growth_hp、hp_mult）。该表无法正确导入职业属性。',
    )
  }

  if (skillSig >= 3 && jobSig === 0) {
    errors.push(
      '该表更像「技能」表（含 ratio、mp_cost、cooldown 等），不能用于导入职业属性。请在导入中心选择「技能」。',
    )
    return {
      ok: false,
      errors,
      warnings,
      matchedFields,
      suspectedKind: 'skills',
    }
  }

  if (skillSig >= 2 && jobSig < 2 && !hasStatField) {
    errors.push('表头以技能列为主，与职业属性表不匹配。请换用 job_classes 模板表。')
    return {
      ok: false,
      errors,
      warnings,
      matchedFields,
      suspectedKind: 'skills',
    }
  }

  if (plan.ambiguities.length > 0) {
    warnings.push(
      `有 ${plan.ambiguities.length} 个表头需要确认映射（点击导入时会弹出）。`,
    )
  }

  const ok = errors.length === 0 && Boolean(detectJobIdColumn(columns))
  return { ok, errors, warnings, matchedFields }
}

function validateGameConfigTable(
  columns: StudioTableColumn[],
  kind: GameConfigImportKind,
): StudioTableValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const matchedFields: string[] = []
  const jobSig = countHeaderSignature(columns, JOB_HEADER_TOKENS)
  const skillSig = countHeaderSignature(columns, SKILL_HEADER_TOKENS)

  if (!detectGameConfigIdColumn(columns, kind)) {
    errors.push(
      kind === 'balance_scalar'
        ? '缺少 key / id 列，无法导入战斗数值标量。'
        : '缺少 id 列，无法按行 id 导入。',
    )
  }

  if (kind === 'equipment') {
    if (hasColumnAlias(columns, ['stat'])) matchedFields.push('stat')
    if (hasColumnAlias(columns, ['bonus'])) matchedFields.push('bonus')
    if (hasColumnAlias(columns, ['name', 'displayname'])) matchedFields.push('name')
    if (!hasColumnAlias(columns, ['stat', 'bonus'])) {
      errors.push('缺少 stat 或 bonus 列，无法导入装备槽配置。')
    }
    if (skillSig >= 2) {
      errors.push('表头像技能表，请选择「技能」导入，而非装备槽。')
      return { ok: false, errors, warnings, matchedFields, suspectedKind: 'skills' }
    }
  } else if (kind === 'loadout') {
    if (columns.some((c) => colMatchesAny(c, LOADOUT_HEADER_TOKENS))) {
      matchedFields.push('skill_ids')
    } else {
      errors.push('缺少 skill_ids / skills / loadout 列，无法导入职业默认技能列表。')
    }
    if (jobSig >= 2 && !columns.some((c) => colMatchesAny(c, LOADOUT_HEADER_TOKENS))) {
      warnings.push('表头含职业成长列但未见技能列表列，请确认选对了表。')
    }
  } else if (kind === 'balance_scalar') {
    if (columns.some((c) => colMatchesAny(c, BALANCE_HEADER_TOKENS))) {
      matchedFields.push('value')
    } else {
      errors.push('缺少 value / amount 列，无法导入标量数值。')
    }
    if (jobSig >= 3 && !columns.some((c) => colMatchesAny(c, BALANCE_HEADER_TOKENS))) {
      errors.push('该表更像职业属性表，不能用于战斗数值标量。')
      return { ok: false, errors, warnings, matchedFields, suspectedKind: 'job_classes' }
    }
  } else if (kind === 'basic_attack') {
    if (columns.some((c) => colMatchesAny(c, BASIC_ATTACK_HEADER_TOKENS))) {
      matchedFields.push('multiplier')
    } else {
      errors.push('缺少 multiplier / ratio 列，无法导入普攻倍率。')
    }
  }

  const ok = errors.length === 0
  return { ok, errors, warnings, matchedFields }
}
