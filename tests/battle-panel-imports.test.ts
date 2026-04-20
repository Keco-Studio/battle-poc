import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

describe('Map battle core integration', () => {
  it('drives combat via MapBattleController on the map (no Phaser overlay)', async () => {
    const sourcePath = path.resolve(process.cwd(), 'app/components/GameMap.tsx')
    const source = await readFile(sourcePath, 'utf8')

    expect(source).toContain('MapBattleController')
    expect(source).toContain('disengageGridPositions')
    expect(source).not.toContain('MapBattlePhaserCanvas')
  })
})

describe('battle demo page imports', () => {
  it('keeps ssr:false dynamic imports out of the server page entry', async () => {
    const sourcePath = path.resolve(process.cwd(), 'app/battle/page.tsx')
    const source = await readFile(sourcePath, 'utf8')

    expect(source).toContain("import BattleDemoClient from './BattleDemoClient'")
    expect(source).not.toContain("dynamic(")
    expect(source).not.toContain('ssr: false')
  })
})

describe('battle demo client wrapper', () => {
  it('contains the client-only dynamic PhaserGame import', async () => {
    const sourcePath = path.resolve(process.cwd(), 'app/battle/BattleDemoClient.tsx')
    const source = await readFile(sourcePath, 'utf8')

    expect(source).toContain("'use client'")
    expect(source).toContain("import dynamic from 'next/dynamic'")
    expect(source).toContain("import('@/src/renderer/PhaserGame')")
    expect(source).toContain('ssr: false')
  })
})

describe('BattleScene presentation', () => {
  it('removes arena title and center line, and uses randomized impact positions', async () => {
    const sourcePath = path.resolve(process.cwd(), 'src/renderer/phaser/BattleScene.ts')
    const source = await readFile(sourcePath, 'utf8')

    expect(source).not.toContain('Battle Arena')
    expect(source).not.toContain('.rectangle(MID_X, H / 2, 4, H - 40')
    expect(source).toContain('pickImpactPoint(')
  })

  it('resets scene state on create and keeps lose-state player visible', async () => {
    const sourcePath = path.resolve(process.cwd(), 'src/renderer/phaser/BattleScene.ts')
    const source = await readFile(sourcePath, 'utf8')

    expect(source).toContain('this.resetSceneState()')
    expect(source).toContain('alpha: 0.35')
  })
})
