import type { CSSProperties } from 'react'

export const ROTATION_KEYS = [
  'north',
  'south',
  'east',
  'west',
  'north-east',
  'north-west',
  'south-east',
  'south-west',
] as const

export type RotationKey = (typeof ROTATION_KEYS)[number]

export const DEFAULT_DIRECTION: RotationKey = 'south'
export const HOME_DEFAULT_MAP_ID = 'top-down-pixel-art-rpg-battle-arena-map-wide-ope-1777006352683'

const ENEMY_WALK_FRAMES_BY_FACING: Record<RotationKey, number> = {
  north: 8,
  south: 8,
  east: 8,
  west: 8,
  'north-east': 8,
  'north-west': 8,
  'south-east': 8,
  'south-west': 8,
}

const PLAYER_WALK_DIR_BY_FACING: Record<RotationKey, string> = {
  north: 'north',
  south: 'south',
  east: 'east-9b803dd5',
  west: 'west-44afc449',
  'north-east': 'north-east-76d09498',
  'north-west': 'north-west-6213b10b',
  'south-east': 'south-east-b3963b75',
  'south-west': 'south-west-326192d3',
}

const PIXELLAB_ROW_BY_FACING: Record<RotationKey, number> = {
  south: 0,
  'south-west': 1,
  west: 2,
  'north-west': 3,
  north: 4,
  'north-east': 5,
  east: 6,
  'south-east': 7,
}

export const MAP_DISPLAY_ORDER = [
  HOME_DEFAULT_MAP_ID,
  'bottom-up-map',
]

export function getMapDisplayName(mapId: string): string {
  if (mapId === HOME_DEFAULT_MAP_ID) return 'Battle Arena'
  if (mapId === 'bottom-up-map') return 'Bottom-up Arena'
  if (mapId === 'demo-project') return 'Demo Map'
  if (mapId === 'pixel-npc') return 'Pixel NPC Town'
  if (mapId === 'top-down-pixel-art-village-map-houses-paths-tree-1776773208725') return 'Village'
  return mapId
}

export type PixelLabPackMeta = {
  id: string
  imageSize: { width: number; height: number }
  framesPerDirection: number
  layout: { rows: number; cols: number }
  files: { previewPng: string; sheetPng: string }
}

function framePath(baseDir: string, frames: number, tick: number): string {
  const safeFrames = Math.max(1, Math.floor(frames))
  const frame = ((tick % safeFrames) + safeFrames) % safeFrames
  const name = `frame_${String(frame).padStart(3, '0')}.png`
  return `${baseDir}/${name}`
}

export function toEnemyIdlePngPath(direction: RotationKey): string {
  return `/enemy/idle/${direction}.png`
}

export function toPlayerIdlePngPath(direction: RotationKey): string {
  return `/player/idle/${direction}.png`
}

export function toEnemyWalkFramePath(direction: RotationKey, tick: number): string {
  return framePath(`/enemy/walk/${direction}`, ENEMY_WALK_FRAMES_BY_FACING[direction] ?? 8, tick)
}

export function toEnemyRunningFramePath(direction: RotationKey, tick: number): string {
  return framePath(`/enemy/running/${direction}`, 8, tick)
}

export function toPlayerWalkFramePath(direction: RotationKey, tick: number): string {
  const dir = PLAYER_WALK_DIR_BY_FACING[direction] ?? direction
  return framePath(`/player/walk/${dir}`, 8, tick)
}

export function toPlayerRunningFramePath(direction: RotationKey, tick: number): string {
  return framePath(`/player/running/${direction}`, 8, tick)
}

export function pixelLabSheetActorStyle(
  meta: PixelLabPackMeta,
  facing: RotationKey,
  isWalking: boolean,
  tick: number,
  displaySize: number,
): CSSProperties {
  const fw = meta.imageSize.width
  const fh = meta.imageSize.height
  const cols = meta.layout?.cols ?? meta.framesPerDirection ?? 1
  const rows = meta.layout?.rows ?? 8
  const row = PIXELLAB_ROW_BY_FACING[facing] ?? 0
  const frames = Math.max(1, meta.framesPerDirection)
  const frame = isWalking ? tick % frames : 0
  const rel = meta.files.sheetPng
  const sheetUrl = rel.startsWith('/') ? rel : `/${rel.replace(/^\/+/, '')}`
  return {
    width: displaySize,
    height: displaySize,
    backgroundImage: `url("${sheetUrl}")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${fw * cols}px ${fh * rows}px`,
    backgroundPosition: `${-frame * fw}px ${-row * fh}px`,
    imageRendering: 'pixelated',
  }
}

export function resolveDirectionByDelta(dx: number, dy: number): RotationKey {
  if (dx === 0 && dy === 0) return DEFAULT_DIRECTION
  if (dx > 0 && dy < 0) return 'north-east'
  if (dx < 0 && dy < 0) return 'north-west'
  if (dx > 0 && dy > 0) return 'south-east'
  if (dx < 0 && dy > 0) return 'south-west'
  if (dx > 0) return 'east'
  if (dx < 0) return 'west'
  if (dy < 0) return 'north'
  return 'south'
}

export function snapToGrid(pos: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(pos.x), y: Math.round(pos.y) }
}

export function disengageGridPositions(
  player: { x: number; y: number },
  enemy: { x: number; y: number },
  mapW: number,
  mapH: number,
  isWalkable: (x: number, y: number, role: 'playerStep' | 'enemyStep') => boolean,
): { player: { x: number; y: number }; enemy: { x: number; y: number } } {
  let dx = player.x - enemy.x
  let dy = player.y - enemy.y
  if (dx === 0 && dy === 0) {
    dx = 1
    dy = 0
  }
  const len = Math.hypot(dx, dy) || 1
  const nx = dx / len
  const ny = dy / len
  const step = 2
  let px = Math.round(player.x + nx * step)
  let py = Math.round(player.y + ny * step)
  let ex = Math.round(enemy.x - nx * step)
  let ey = Math.round(enemy.y - ny * step)
  px = Math.max(0, Math.min(mapW - 1, px))
  py = Math.max(0, Math.min(mapH - 1, py))
  ex = Math.max(0, Math.min(mapW - 1, ex))
  ey = Math.max(0, Math.min(mapH - 1, ey))
  if (!isWalkable(px, py, 'playerStep')) {
    px = player.x
    py = player.y
  }
  if (!isWalkable(ex, ey, 'enemyStep')) {
    ex = enemy.x
    ey = enemy.y
  }
  return { player: { x: px, y: py }, enemy: { x: ex, y: ey } }
}
