import { loadPocGameConfigDrafts } from '@/src/lib/gameConfig/pocGameConfigDrafts'
import type { GameConfigImportKind } from '@/src/lib/gameConfig/gameConfigTypes'
import { loadPocJobDrafts } from '@/src/lib/jobs/pocJobDrafts'
import { loadPocSkillDrafts } from '@/src/lib/skills/pocSkillDrafts'

export type StudioImportCategoryId =
  | 'skills'
  | 'job_classes'
  | 'equipment'
  | 'loadout'
  | 'basic_attack'
  | 'balance_scalar'

export type StudioImportCatalogEntry = {
  id: StudioImportCategoryId
  title: string
  description: string
  gameConfigKind?: GameConfigImportKind
}

export const STUDIO_IMPORT_CATALOG: StudioImportCatalogEntry[] = [
  {
    id: 'skills',
    title: '技能',
    description: '从 Studio 表按 id 导入技能（伤害、CD、元素等）',
  },
  {
    id: 'job_classes',
    title: '职业属性',
    description: '基础/成长 HP、ATK、DEF、SPD、hpMult',
  },
  {
    id: 'equipment',
    title: '装备槽',
    description: 'weapon / ring / armor / shoes',
    gameConfigKind: 'equipment',
  },
  {
    id: 'loadout',
    title: '职业默认技能',
    description: '各职业携带技能列表（逗号分隔 skill id）',
    gameConfigKind: 'loadout',
  },
  {
    id: 'basic_attack',
    title: '普攻',
    description: 'basic_attack 行：倍率、图标、描述',
    gameConfigKind: 'basic_attack',
  },
  {
    id: 'balance_scalar',
    title: '战斗数值',
    description: '经验、敌人成长、伤害公式等标量 key',
    gameConfigKind: 'balance_scalar',
  },
]

export function draftCountForCategory(id: StudioImportCategoryId): number {
  if (id === 'skills') return loadPocSkillDrafts().length
  if (id === 'job_classes') return loadPocJobDrafts().length
  const kind = STUDIO_IMPORT_CATALOG.find((e) => e.id === id)?.gameConfigKind
  if (!kind) return 0
  return loadPocGameConfigDrafts().filter((d) => d.kind === kind).length
}

export function totalGameConfigDraftCount(): number {
  return loadPocGameConfigDrafts().length
}
