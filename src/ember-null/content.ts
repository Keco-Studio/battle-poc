import type { EnemyKind } from './types'

export const VIEW = { width: 1600, height: 900 }
export const WORLD = { width: 2400, height: 1350 }

export const ASSETS = {
  arena: '/assets/ember-null/runtime/ember-null-arena.png',
  hero: '/assets/ember-null/runtime/relay-warden-idle.png',
  heroMove: '/assets/ember-null/runtime/relay-warden-pixellab-walk-f8.png',
  cinder: '/assets/ember-null/runtime/cinder-wisp-idle.png',
  cinderMove: '/assets/ember-null/runtime/cinder-wisp-pixellab-move-f8.png',
  husk: '/assets/ember-null/runtime/iron-husk-idle.png',
  huskMove: '/assets/ember-null/runtime/iron-husk-pixellab-walk-f8.png',
  revenant: '/assets/ember-null/runtime/frost-revenant-idle.png',
  revenantMove: '/assets/ember-null/runtime/frost-revenant-pixellab-move-f8.png',
  boss: '/assets/ember-null/runtime/null-custodian-idle.png',
  bossMove: '/assets/ember-null/runtime/null-custodian-pixellab-move-f8.png',
  boltFx: '/assets/ember-null/runtime/relay-bolt-fx.png',
  cinderFx: '/assets/ember-null/runtime/cinder-chain-fx.png',
  frostFx: '/assets/ember-null/runtime/frost-break-fx.png',
  overloadFx: '/assets/ember-null/runtime/overload-crown-fx.png',
  music: '/assets/ember-null/audio/combat-loop.wav',
  boltSfx: '/assets/ember-null/audio/relay-shot.wav',
  dashSfx: '/assets/ember-null/audio/phase-dash.wav',
  shockSfx: '/assets/ember-null/audio/thermal-shock.wav',
  impactSfx: '/assets/ember-null/audio/enemy-impact.wav',
  bossSfx: '/assets/ember-null/audio/boss-warning.wav',
} as const

export const ENEMIES: Record<EnemyKind, {
  hp: number
  speed: number
  damage: number
  scale: number
  label: string
}> = {
  cinder: { hp: 42, speed: 135, damage: 8, scale: 0.34, label: 'CINDER WISP' },
  husk: { hp: 95, speed: 72, damage: 15, scale: 0.43, label: 'IRON HUSK' },
  revenant: { hp: 68, speed: 92, damage: 11, scale: 0.38, label: 'FROST REVENANT' },
  boss: { hp: 720, speed: 80, damage: 20, scale: 0.7, label: 'NULL CUSTODIAN' },
}

export const WAVE_LABELS = ['SIGNAL ACQUIRED', 'ARMOR PROTOCOL', 'ZERO TEMPERATURE', 'NULL CUSTODIAN']

export const TACTIC_LABELS = {
  pressure: 'DIRECT PRESSURE',
  flank: 'SPLIT FLANK',
  zone: 'DENIAL GRID',
  recover: 'REPAIR WINDOW',
} as const
