import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { config as loadEnv } from 'dotenv'
import sharp from 'sharp'

loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const token = process.env.PIXELLAB_API_TOKEN
if (!token) throw new Error('PIXELLAB_API_TOKEN is not configured')

const runtimeRoot = path.join(process.cwd(), 'public', 'assets', 'ember-null', 'runtime')
const frameSize = 64
const outputFrameSize = 256
const frameCount = 8

const motions = [
  {
    id: 'hero',
    reference: 'relay-warden-idle.png',
    output: 'relay-warden-pixellab-walk-f8.png',
    seed: 8101,
    description: 'Pale ceramic armored Relay Warden carrying one cyan energy glaive, full body game character, identical armor and weapon in every frame',
    action: 'seamless walk cycle toward the east with alternating planted left and right footsteps, clear heel lift, knee bend, opposite arm swing, stable torso, weapon held low, no sliding',
    negative: 'static pose, hovering, swaying in place, platformer side view, changing armor, extra weapon, extra limbs, cropped body',
  },
  {
    id: 'cinder',
    reference: 'cinder-wisp-idle.png',
    output: 'cinder-wisp-pixellab-move-f8.png',
    seed: 8110,
    description: 'Charcoal Cinder Wisp with one orange furnace core and three black blade fragments, identical creature in every frame',
    action: 'seamless fast hover locomotion cycle toward the east, blade fragments rotate in sequence around the core, flame trail stretches and contracts with forward thrust, no random shaking',
    negative: 'humanoid legs, changing number of fragments, static pose, platformer background, cropped creature',
  },
  {
    id: 'husk',
    reference: 'iron-husk-idle.png',
    output: 'iron-husk-pixellab-walk-f8.png',
    seed: 8120,
    description: 'Broad volcanic Iron Husk construct with heavy dark armor, shield shoulder, magenta heat seams and teal core, identical construct in every frame',
    action: 'seamless heavy walk cycle toward the east with alternating planted stomps, clearly different left and right leg poses, weight transfer through hips and shoulders, no foot sliding',
    negative: 'static pose, hovering, swaying in place, changing armor, extra limbs, cropped body, platformer background',
  },
  {
    id: 'revenant',
    reference: 'frost-revenant-idle.png',
    output: 'frost-revenant-pixellab-move-f8.png',
    seed: 8130,
    description: 'Tall pale Frost Revenant with cyan veil and one fractured tuning-fork staff, identical revenant in every frame',
    action: 'seamless controlled spectral glide toward the east, robe and veil trail backward through eight progressive poses, staff remains stable, smooth propulsion without left-right jitter',
    negative: 'walking legs, changing staff, static pose, random swaying, extra limbs, cropped body, platformer background',
  },
  {
    id: 'boss',
    reference: 'null-custodian-idle.png',
    output: 'null-custodian-pixellab-move-f8.png',
    seed: 8140,
    description: 'Monumental charcoal Null Custodian with four arms and one broken magenta-orange halo, identical boss in every frame',
    action: 'seamless monumental hover locomotion toward the east, halo rotates progressively while four arms counterbalance forward momentum, smooth deliberate propulsion without random shaking',
    negative: 'walking legs, changing arm count, changing halo, static pose, random swaying, cropped body, platformer background',
  },
]

function decodeBase64Png(value) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(value)
  return Buffer.from(match?.[1] ?? value, 'base64')
}

async function referenceImage(fileName) {
  const buffer = await sharp(path.join(runtimeRoot, fileName))
    .resize(frameSize, frameSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return { type: 'base64', base64: buffer.toString('base64') }
}

async function generateChunk(motion, reference, startFrameIndex) {
  const response = await fetch('https://api.pixellab.ai/v1/animate-with-text', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_size: { width: frameSize, height: frameSize },
      description: motion.description,
      negative_description: motion.negative,
      action: motion.action,
      text_guidance_scale: 9,
      image_guidance_scale: 1.7,
      n_frames: frameCount,
      start_frame_index: startFrameIndex,
      view: 'low top-down',
      direction: 'east',
      reference_image: reference,
      seed: motion.seed,
    }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${motion.id} frames ${startFrameIndex}-${startFrameIndex + 3}: PixelLab ${response.status} ${JSON.stringify(json?.detail ?? json?.error ?? 'request failed')}`)
  }
  if (!Array.isArray(json?.images) || json.images.length !== 4) {
    throw new Error(`${motion.id}: expected four PixelLab frames, received ${json?.images?.length ?? 0}`)
  }
  return json.images.map((image) => decodeBase64Png(image.base64))
}

async function normalizeFrame(frame, motion, index) {
  const metadata = await sharp(frame).metadata()
  if (metadata.format !== 'png' || metadata.width !== frameSize || metadata.height !== frameSize) {
    throw new Error(`${motion.id} frame ${index}: expected 64x64 PNG, received ${metadata.width}x${metadata.height} ${metadata.format}`)
  }
  return sharp(frame)
    .resize(outputFrameSize, outputFrameSize, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer()
}

await mkdir(runtimeRoot, { recursive: true })
const requested = new Set(process.argv.slice(2))
const selected = requested.size > 0 ? motions.filter((motion) => requested.has(motion.id)) : motions
if (selected.length === 0) throw new Error(`No matching motion ids. Available: ${motions.map((motion) => motion.id).join(', ')}`)

for (const motion of selected) {
  process.stdout.write(`PixelLab ${motion.id}: generating walk cycle 0-3...\n`)
  const reference = await referenceImage(motion.reference)
  const first = await generateChunk(motion, reference, 0)
  process.stdout.write(`PixelLab ${motion.id}: generating walk cycle 4-7...\n`)
  const second = await generateChunk(motion, reference, 4)
  const frames = await Promise.all([...first, ...second].map((frame, index) => normalizeFrame(frame, motion, index)))
  await sharp({
    create: {
      width: outputFrameSize * frameCount,
      height: outputFrameSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(frames.map((frame, index) => ({ input: frame, left: index * outputFrameSize, top: 0 })))
    .png()
    .toFile(path.join(runtimeRoot, motion.output))
  process.stdout.write(`PixelLab ${motion.id}: wrote ${motion.output}\n`)
}
