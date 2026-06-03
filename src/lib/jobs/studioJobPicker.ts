/** Reuses Studio library listing from skill picker (same libraries / tables). */

export {
  listSelectableStudioTables,
  loadStudioTableRows,
  loadStudioTableColumns,
  studioSkillSourceTableId as studioJobSourceTableId,
  parseStudioSkillSourceLibraryId as parseStudioJobSourceLibraryId,
  type SelectableStudioTable,
} from '@/src/lib/skills/studioSkillPicker'
