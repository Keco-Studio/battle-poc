import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

type Manifest = {
  version: string
  styleFormula: string
  assets: Array<{
    id: string
    path: string
    dimensions: { width: number; height: number }
    transparent: boolean
    seed: number
    prompt: string
    frameCount: number
    directions: string[]
    sourceType: 'PixelLab' | 'PixelLab mirror'
  }>
  maps: Array<{ id: string; path: string; width: number; height: number }>
  characters: Array<{
    id: string
    referencePath: string
    directions: Record<string, { sheetPath: string; frames: string[]; fps: number }>
  }>
  skills: Array<{ id: string; iconPath: string; fxSheetPath: string; fxFrames: string[]; fps: number }>
}

async function manifest(): Promise<Manifest> {
  return JSON.parse(await readFile(path.resolve('public/assets/v3/manifest.json'), 'utf8')) as Manifest
}

async function expectPng(relativePath: string, width: number, height: number) {
  const absolute = path.resolve('public', relativePath.replace(/^\//, ''))
  await access(absolute)
  const metadata = await sharp(absolute).metadata()
  expect(metadata.format).toBe('png')
  expect(metadata.width).toBe(width)
  expect(metadata.height).toBe(height)
}

describe('V3 PixelLab assets', () => {
  it('ships the three required map images at authored dimensions', async () => {
    const data = await manifest()
    expect(data.version).toBe('v3-pixellab-1')
    expect(data.maps).toHaveLength(3)
    for (const map of data.maps) await expectPng(map.path, map.width, map.height)
  })

  it('ships complete eight-frame directional animation assets', async () => {
    const data = await manifest()
    expect(data.characters).toHaveLength(5)
    for (const character of data.characters) {
      expect(Object.keys(character.directions).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'])
      await expectPng(character.referencePath, character.id === 'eclipse_marshal' ? 128 : 96, character.id === 'eclipse_marshal' ? 128 : 96)
      for (const direction of Object.values(character.directions)) {
        expect(direction.frames).toHaveLength(8)
        expect(direction.fps).toBe(10)
        await expectPng(direction.sheetPath, 512, 64)
        for (const frame of direction.frames) await expectPng(frame, 64, 64)
      }
    }
  })

  it('ships a readable icon and eight-frame effect for every skill', async () => {
    const data = await manifest()
    expect(data.skills).toHaveLength(8)
    for (const skill of data.skills) {
      expect(skill.fxFrames).toHaveLength(8)
      expect(skill.fps).toBe(14)
      await expectPng(skill.iconPath, 64, 64)
      await expectPng(skill.fxSheetPath, 512, 64)
      for (const frame of skill.fxFrames) await expectPng(frame, 64, 64)
    }
  })

  it('uses the approved optimistic pixel style formula verbatim', async () => {
    const data = await manifest()
    const formula = (await readFile(path.resolve('design/STYLE_FORMULA.txt'), 'utf8')).trim()
    expect(data.styleFormula).toBe(formula)
  })

  it('maps every authored asset row to complete PixelLab provenance', async () => {
    const data = await manifest()
    const [, ...rows] = (await readFile(path.resolve('design/assets.csv'), 'utf8')).trim().split('\n')
    const expectedIds = rows.map((row) => row.split(',')[0]).sort()
    expect(data.assets.map((asset) => asset.id).sort()).toEqual(expectedIds)

    for (const asset of data.assets) {
      expect(asset.path).toMatch(/^\/assets\/v3\//)
      expect(asset.dimensions.width).toBeGreaterThan(0)
      expect(asset.dimensions.height).toBeGreaterThan(0)
      expect(typeof asset.transparent).toBe('boolean')
      expect(asset.seed).toBeGreaterThan(0)
      expect(asset.prompt).toContain(data.styleFormula)
      expect(asset.frameCount).toBe(asset.directions.length === 0 ? 1 : 8)
      expect(['PixelLab', 'PixelLab mirror']).toContain(asset.sourceType)
    }
  })
})
