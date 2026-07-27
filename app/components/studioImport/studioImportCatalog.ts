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
    title: 'Skills',
    description: 'Import skill rows from Studio libraries (damage, CD, elements).',
  },
  {
    id: 'job_classes',
    title: 'Class stats',
    description: 'Lv.1 HP, ATK, DEF, SPD, growth, hpMult.',
  },
  {
    id: 'equipment',
    title: 'Equipment slots',
    description: 'weapon / ring / armor / shoes',
    gameConfigKind: 'equipment',
  },
  {
    id: 'loadout',
    title: 'Class loadouts',
    description: 'Default skill ids per class (comma-separated)',
    gameConfigKind: 'loadout',
  },
  {
    id: 'basic_attack',
    title: 'Basic attack',
    description: 'basic_attack row: multiplier, icon, description',
    gameConfigKind: 'basic_attack',
  },
  {
    id: 'balance_scalar',
    title: 'Battle formulas',
    description: 'EXP, enemy growth, damage scalars, and other keys',
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
