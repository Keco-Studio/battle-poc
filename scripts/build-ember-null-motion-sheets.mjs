import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.join(process.cwd(), 'public', 'assets', 'ember-null', 'runtime')
const frameSize = 256
const frameCount = 8

const sheets = [
  { source: 'relay-warden-idle.png', output: 'relay-warden-move-f8.png', angle: 2.8, bob: 8, stride: 4, weightShift: 3.2, squash: 0.034 },
  { source: 'cinder-wisp-idle.png', output: 'cinder-wisp-move-f8.png', angle: 7, bob: 11, stride: 3, weightShift: 2.5, squash: 0.055, spin: true },
  { source: 'iron-husk-idle.png', output: 'iron-husk-move-f8.png', angle: 2.1, bob: 5, stride: 5, weightShift: 3.8, squash: 0.026 },
  { source: 'frost-revenant-idle.png', output: 'frost-revenant-move-f8.png', angle: 3.8, bob: 10, stride: 4, weightShift: 3, squash: 0.038 },
  { source: 'null-custodian-idle.png', output: 'null-custodian-move-f8.png', angle: 1.8, bob: 7, stride: 2, weightShift: 2.4, squash: 0.025 },
]

async function buildFrame(input, config, index) {
  const phase = index / frameCount * Math.PI * 2
  const stridePhase = Math.sin(phase)
  const weightPhase = Math.cos(phase)
  const contactPhase = Math.cos(phase * 2)
  const scaleX = 1 + contactPhase * config.squash
  const scaleY = 1 - contactPhase * config.squash * 0.72
  const width = Math.round(frameSize * scaleX)
  const height = Math.round(frameSize * scaleY)
  const angle = config.spin ? index * 4.5 : stridePhase * config.angle
  const transformed = await sharp(input)
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const metadata = await sharp(transformed).metadata()
  const safeSize = 384
  const x = Math.round((safeSize - (metadata.width ?? width)) / 2 + stridePhase * config.stride + weightPhase * config.weightShift)
  const y = Math.round(safeSize - 64 - (metadata.height ?? height) - Math.abs(stridePhase) * config.bob - weightPhase * 1.4)
  const safeFrame = await sharp({
    create: { width: safeSize, height: safeSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: transformed, left: x, top: y }]).png().toBuffer()
  return sharp(safeFrame).extract({ left: 64, top: 64, width: frameSize, height: frameSize }).png().toBuffer()
}

await mkdir(root, { recursive: true })
for (const config of sheets) {
  const input = path.join(root, config.source)
  const frames = await Promise.all(Array.from({ length: frameCount }, (_, index) => buildFrame(input, config, index)))
  await sharp({
    create: {
      width: frameSize * frameCount,
      height: frameSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(frames.map((frame, index) => ({ input: frame, left: index * frameSize, top: 0 })))
    .png()
    .toFile(path.join(root, config.output))
  process.stdout.write(`built ${config.output}\n`)
}
