export type Vs01Asset = {
  id: string
  kind: 'character' | 'map' | 'skill_fx'
  ownerId: string
  path: string
  width: number
  height: number
  transparent: boolean
  seed: number
}

export const VS01_ASSETS = [
  { id: 'character_relay_warden', kind: 'character', ownerId: 'relay_warden', path: '/assets/generated/vs01/characters/relay-warden.png', width: 128, height: 128, transparent: true, seed: 6101 },
  { id: 'character_cinder_wisp', kind: 'character', ownerId: 'cinder_wisp', path: '/assets/generated/vs01/characters/cinder-wisp.png', width: 128, height: 128, transparent: true, seed: 6102 },
  { id: 'character_iron_husk', kind: 'character', ownerId: 'iron_husk', path: '/assets/generated/vs01/characters/iron-husk.png', width: 128, height: 128, transparent: true, seed: 6103 },
  { id: 'character_frost_revenant', kind: 'character', ownerId: 'frost_revenant', path: '/assets/generated/vs01/characters/frost-revenant.png', width: 128, height: 128, transparent: true, seed: 6104 },
  { id: 'character_null_custodian', kind: 'character', ownerId: 'null_custodian', path: '/assets/generated/vs01/characters/null-custodian.png', width: 128, height: 128, transparent: true, seed: 6105 },
  { id: 'map_emberwatch_causeway', kind: 'map', ownerId: 'emberwatch_causeway', path: '/assets/generated/vs01/maps/emberwatch-causeway.png', width: 400, height: 256, transparent: false, seed: 6201 },
  { id: 'map_ashen_relay_core', kind: 'map', ownerId: 'ashen_relay_core', path: '/assets/generated/vs01/maps/ashen-relay-core.png', width: 400, height: 256, transparent: false, seed: 6202 },
  { id: 'fx_relay_bolt', kind: 'skill_fx', ownerId: 'relay_bolt', path: '/assets/generated/vs01/skill-fx/relay-bolt.png', width: 96, height: 96, transparent: true, seed: 6301 },
  { id: 'fx_cinder_mark', kind: 'skill_fx', ownerId: 'cinder_mark', path: '/assets/generated/vs01/skill-fx/cinder-mark.png', width: 96, height: 96, transparent: true, seed: 6302 },
  { id: 'fx_frost_lattice', kind: 'skill_fx', ownerId: 'frost_lattice', path: '/assets/generated/vs01/skill-fx/frost-lattice.png', width: 96, height: 96, transparent: true, seed: 6303 },
  { id: 'fx_shatter_lance', kind: 'skill_fx', ownerId: 'shatter_lance', path: '/assets/generated/vs01/skill-fx/shatter-lance.png', width: 96, height: 96, transparent: true, seed: 6304 },
  { id: 'fx_sunder_arc', kind: 'skill_fx', ownerId: 'sunder_arc', path: '/assets/generated/vs01/skill-fx/sunder-arc.png', width: 96, height: 96, transparent: true, seed: 6305 },
  { id: 'fx_mending_spark', kind: 'skill_fx', ownerId: 'mending_spark', path: '/assets/generated/vs01/skill-fx/mending-spark.png', width: 96, height: 96, transparent: true, seed: 6306 },
  { id: 'fx_phase_needle', kind: 'skill_fx', ownerId: 'phase_needle', path: '/assets/generated/vs01/skill-fx/phase-needle.png', width: 96, height: 96, transparent: true, seed: 6307 },
  { id: 'fx_overload_crown', kind: 'skill_fx', ownerId: 'overload_crown', path: '/assets/generated/vs01/skill-fx/overload-crown.png', width: 96, height: 96, transparent: true, seed: 6308 },
] as const satisfies readonly Vs01Asset[]

export const VS01_ASSET_BY_ID = new Map(VS01_ASSETS.map((asset) => [asset.id, asset]))

export function getVs01SkillFxPath(skillId: string): string | null {
  return VS01_ASSETS.find((asset) => asset.kind === 'skill_fx' && asset.ownerId === skillId)?.path ?? null
}

