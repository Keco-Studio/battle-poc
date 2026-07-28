export const VS01_CONTENT_VERSION = 'vs01'

export const VS01_GAME = {
  id: 'ember_relay_vs01',
  name: 'Ember Relay',
  theme: 'A basalt relay outpost where teal signal craft contains ember and frost corruption.',
  contentVersion: VS01_CONTENT_VERSION,
  defaultMapId: 'emberwatch_causeway',
  playerJobId: 'relay_warden',
  playerSkillIds: [
    'relay_bolt',
    'cinder_mark',
    'frost_lattice',
    'shatter_lance',
    'sunder_arc',
    'mending_spark',
    'phase_needle',
    'overload_crown',
  ],
  targetMinutes: 18,
} as const

