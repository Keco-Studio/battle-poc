import manifestJson from '@/public/assets/v3/manifest.json'
import type * as Phaser from 'phaser'

import { V3_DIRECTIONS, animationKeyFor, type V3Direction } from './viewModel'

const PIXELLAB_CAMERA_BEARING_BY_FACING: Record<V3Direction, V3Direction> = {
  n: 's',
  ne: 'sw',
  e: 'w',
  se: 'nw',
  s: 'n',
  sw: 'ne',
  w: 'e',
  nw: 'se',
}

type V3AssetManifest = typeof manifestJson

export type V3AssetCatalog = {
  maps: Array<{ id: string; key: string; path: string }>
  characters: Array<{
    id: string
    directions: Array<{
      direction: V3Direction
      textureKey: string
      animationKey: string
      path: string
      frameCount: number
      fps: number
    }>
  }>
  skills: Array<{
    id: string
    iconKey: string
    iconPath: string
    fxTextureKey: string
    fxAnimationKey: string
    fxPath: string
    frameCount: number
    fps: number
  }>
}

export type V3LoaderLike = {
  image: (key: string, path: string) => unknown
  spritesheet: (
    key: string,
    path: string,
    config: { frameWidth: number; frameHeight: number; endFrame: number },
  ) => unknown
}

export type V3AnimationManagerLike = {
  exists: (key: string) => boolean
  create: (config: Phaser.Types.Animations.Animation) => unknown
  generateFrameNumbers: (
    textureKey: string,
    config: { start: number; end: number },
  ) => Phaser.Types.Animations.AnimationFrame[]
}

export function mapTextureKey(id: string): string {
  return `v3-map-${id}`
}

export function characterTextureKey(id: string, direction: V3Direction): string {
  return `v3-character-${id}-${direction}`
}

export function skillFxTextureKey(id: string): string {
  return `v3-fx-${id}`
}

export function skillFxAnimationKey(id: string): string {
  return `v3-fx-${id}-play`
}

export function buildV3AssetCatalog(manifest: V3AssetManifest = manifestJson): V3AssetCatalog {
  return {
    maps: manifest.maps.map((map) => ({ id: map.id, key: mapTextureKey(map.id), path: map.path })),
    characters: manifest.characters.map((character) => ({
      id: character.id,
      directions: V3_DIRECTIONS.map((direction) => {
        // PixelLab names the camera bearing; gameplay names where the actor faces.
        const source = character.directions[PIXELLAB_CAMERA_BEARING_BY_FACING[direction]]
        return {
          direction,
          textureKey: characterTextureKey(character.id, direction),
          animationKey: animationKeyFor(character.id, direction),
          path: source.sheetPath,
          frameCount: source.frames.length,
          fps: source.fps,
        }
      }),
    })),
    skills: manifest.skills.map((skill) => ({
      id: skill.id,
      iconKey: `v3-icon-${skill.id}`,
      iconPath: skill.iconPath,
      fxTextureKey: skillFxTextureKey(skill.id),
      fxAnimationKey: skillFxAnimationKey(skill.id),
      fxPath: skill.fxSheetPath,
      frameCount: skill.fxFrames.length,
      fps: skill.fps,
    })),
  }
}

export function queueV3Assets(loader: V3LoaderLike, catalog = buildV3AssetCatalog()): void {
  for (const map of catalog.maps) loader.image(map.key, map.path)
  for (const character of catalog.characters) {
    for (const direction of character.directions) {
      loader.spritesheet(direction.textureKey, direction.path, {
        frameWidth: 64,
        frameHeight: 64,
        endFrame: direction.frameCount - 1,
      })
    }
  }
  for (const skill of catalog.skills) {
    loader.image(skill.iconKey, skill.iconPath)
    loader.spritesheet(skill.fxTextureKey, skill.fxPath, {
      frameWidth: 64,
      frameHeight: 64,
      endFrame: skill.frameCount - 1,
    })
  }
}

export function registerV3Animations(
  animations: V3AnimationManagerLike,
  catalog = buildV3AssetCatalog(),
): void {
  for (const character of catalog.characters) {
    for (const direction of character.directions) {
      if (animations.exists(direction.animationKey)) continue
      animations.create({
        key: direction.animationKey,
        frames: animations.generateFrameNumbers(direction.textureKey, { start: 0, end: 7 }),
        frameRate: direction.fps,
        repeat: -1,
        skipMissedFrames: false,
      })
    }
  }
  for (const skill of catalog.skills) {
    if (animations.exists(skill.fxAnimationKey)) continue
    animations.create({
      key: skill.fxAnimationKey,
      frames: animations.generateFrameNumbers(skill.fxTextureKey, { start: 0, end: 7 }),
      frameRate: skill.fps,
      repeat: 0,
      skipMissedFrames: false,
    })
  }
}
