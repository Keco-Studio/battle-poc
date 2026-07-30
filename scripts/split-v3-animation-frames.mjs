import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const projectRoot = process.cwd()
const publicRoot = path.join(projectRoot, 'public')
const manifest = JSON.parse(await readFile(path.join(publicRoot, 'assets', 'v3', 'manifest.json'), 'utf8'))
const animations = [
  ...manifest.characters.flatMap((character) => Object.values(character.directions).map((direction) => ({ sheet: direction.sheetPath, frames: direction.frames }))),
  ...manifest.skills.map((skill) => ({ sheet: skill.fxSheetPath, frames: skill.fxFrames })),
]

for (const animation of animations) {
  const sheetPath = path.join(publicRoot, animation.sheet.replace(/^\//, ''))
  const metadata = await sharp(sheetPath).metadata()
  if (metadata.width !== 512 || metadata.height !== 64) throw new Error(`${animation.sheet}: expected 512x64 sheet`)
  for (let index = 0; index < 8; index += 1) {
    const outputPath = path.join(publicRoot, animation.frames[index].replace(/^\//, ''))
    await mkdir(path.dirname(outputPath), { recursive: true })
    await sharp(sheetPath).extract({ left: index * 64, top: 0, width: 64, height: 64 }).png().toFile(outputPath)
  }
}

process.stdout.write(`V3 animation frames verified: ${animations.length} sheets, ${animations.length * 8} frames\n`)
