import type { V3Point } from '@/src/content/generated/v3'
import type { V3Phase } from '@/src/v3/runtime/campaign'
import type { V3ActorId, V3BattleEvent, V3PatchRecord } from '@/src/v3/runtime/types'

export const V3_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const

export type V3Direction = (typeof V3_DIRECTIONS)[number]

export type V3StageLayout = {
  width: number
  height: number
  columns: number
  rows: number
  offsetX: number
  offsetY: number
}

export const V3_STAGE_WIDTH = 1280
export const V3_STAGE_HEIGHT = 720

export const V3_EXPLORE_LAYOUT: V3StageLayout = {
  width: 1280,
  height: 720,
  columns: 32,
  rows: 20,
  offsetX: 0,
  offsetY: 0,
}

export const V3_BATTLE_LAYOUT: V3StageLayout = {
  width: 720,
  height: 720,
  columns: 16,
  rows: 16,
  offsetX: 280,
  offsetY: 0,
}

export type V3MoveIntent =
  | { kind: 'direction'; direction: V3Direction }
  | { kind: 'target'; to: V3Point }

export type V3EncounterMarker = {
  id: string
  name: string
  position: V3Point
  unlocked: boolean
  cleared: boolean
  boss: boolean
}

export type V3PickupMarker = {
  id: string
  position: V3Point
  collected: boolean
}

export type V3ExploreViewModel = {
  mapId: string
  playerPosition: V3Point
  playerVisualAssetId: string
  playerFacing: V3Direction
  safeBeacon: V3Point
  encounters: V3EncounterMarker[]
  pickups: V3PickupMarker[]
}

export type V3BattleActorViewModel = {
  id: V3ActorId
  name: string
  visualAssetId: string
  position: V3Point
  facing: V3Direction
  hp: number
  maxHp: number
  shield: number
  path: V3Point[]
}

export type V3BattleViewModel = {
  mapId: string
  obstacles: V3Point[]
  actors: Record<V3ActorId, V3BattleActorViewModel>
  activeEvent: V3BattleEvent | null
  activeActionLabel: string
  activeNodeLabel: string
  latestPatch: V3PatchRecord | null
  paused: boolean
  speed: 0.5 | 1 | 2 | 4
}

export type V3ViewModel = {
  phase: V3Phase
  exploration: V3ExploreViewModel
  battle: V3BattleViewModel | null
}

export function animationKeyFor(actorKey: string, direction: V3Direction): string {
  return `${actorKey}-move-${direction}`
}

export function animationKeysFor(actorKey: string): string[] {
  return V3_DIRECTIONS.map((direction) => animationKeyFor(actorKey, direction))
}

export function directionFromDelta(
  deltaX: number,
  deltaY: number,
  fallback: V3Direction = 's',
): V3Direction {
  const x = Math.sign(deltaX)
  const y = Math.sign(deltaY)
  if (x === 0 && y === 0) return fallback
  if (y < 0) return x < 0 ? 'nw' : x > 0 ? 'ne' : 'n'
  if (y > 0) return x < 0 ? 'sw' : x > 0 ? 'se' : 's'
  return x < 0 ? 'w' : 'e'
}

export function directionFromPath(path: V3Point[], fallback: V3Direction = 's'): V3Direction {
  if (path.length < 2) return fallback
  const previous = path[path.length - 2]
  const current = path[path.length - 1]
  return directionFromDelta(current.x - previous.x, current.y - previous.y, fallback)
}

export function gridPointToWorld(point: V3Point, layout: V3StageLayout): V3Point {
  const cellWidth = layout.width / layout.columns
  const cellHeight = layout.height / layout.rows
  return {
    x: layout.offsetX + (point.x + 0.5) * cellWidth,
    y: layout.offsetY + (point.y + 0.5) * cellHeight,
  }
}

export function worldPointToGrid(point: V3Point, layout: V3StageLayout): V3Point {
  const cellWidth = layout.width / layout.columns
  const cellHeight = layout.height / layout.rows
  return {
    x: Math.max(0, Math.min(layout.columns - 1, Math.floor((point.x - layout.offsetX) / cellWidth))),
    y: Math.max(0, Math.min(layout.rows - 1, Math.floor((point.y - layout.offsetY) / cellHeight))),
  }
}

export function cameraFrameFor(
  layout: V3StageLayout,
  viewport: { width: number; height: number },
  fit: 'contain' | 'cover',
): { centerX: number; centerY: number; zoom: number } {
  const horizontal = viewport.width / layout.width
  const vertical = viewport.height / layout.height
  return {
    centerX: layout.offsetX + layout.width / 2,
    centerY: layout.offsetY + layout.height / 2,
    zoom: fit === 'contain' ? Math.min(horizontal, vertical) : Math.max(horizontal, vertical),
  }
}

export function characterIdFromVisualAsset(assetId: string): string {
  return assetId.replace(/^character_/, '')
}
