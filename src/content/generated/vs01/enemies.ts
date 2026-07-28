export type Vs01Enemy = {
  id: string
  name: string
  description: string
  kind: 'standard' | 'boss'
  level: number
  stats: { maxHp: number; atk: number; def: number; spd: number }
  skillIds: readonly string[]
  visualId: `pixellab:${string}`
  visualAssetId: string
}

export const VS01_ENEMIES = [
  { id: 'cinder_wisp', name: 'Cinder Wisp', description: 'Fast ember remnant that layers burn pressure.', kind: 'standard', level: 2, stats: { maxHp: 120, atk: 16, def: 3, spd: 8 }, skillIds: ['cinder_mark', 'phase_needle'], visualId: 'pixellab:vs01-cinder-wisp', visualAssetId: 'character_cinder_wisp' },
  { id: 'iron_husk', name: 'Iron Husk', description: 'Armored relay shell that weakens defenses before striking.', kind: 'standard', level: 3, stats: { maxHp: 210, atk: 14, def: 9, spd: 3 }, skillIds: ['sunder_arc', 'relay_bolt'], visualId: 'pixellab:vs01-iron-husk', visualAssetId: 'character_iron_husk' },
  { id: 'frost_revenant', name: 'Frost Revenant', description: 'Control specialist that creates and cashes in freeze windows.', kind: 'standard', level: 4, stats: { maxHp: 165, atk: 17, def: 5, spd: 6 }, skillIds: ['frost_lattice', 'shatter_lance'], visualId: 'pixellab:vs01-frost-revenant', visualAssetId: 'character_frost_revenant' },
  { id: 'null_custodian', name: 'Null Custodian', description: 'The corrupted station keeper cycles control, burn, repair, and overload patterns.', kind: 'boss', level: 6, stats: { maxHp: 430, atk: 22, def: 9, spd: 7 }, skillIds: ['overload_crown', 'frost_lattice', 'cinder_mark', 'mending_spark'], visualId: 'pixellab:vs01-null-custodian', visualAssetId: 'character_null_custodian' },
] as const satisfies readonly Vs01Enemy[]

export const VS01_ENEMY_BY_ID = new Map(VS01_ENEMIES.map((enemy) => [enemy.id, enemy]))

