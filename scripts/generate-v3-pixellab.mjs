import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { config as loadEnv } from 'dotenv'
import sharp from 'sharp'

loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const token = process.env.PIXELLAB_API_TOKEN
if (!token) throw new Error('PIXELLAB_API_TOKEN is not configured')

const root = path.join(process.cwd(), 'public', 'assets', 'v3')
const styleFormula = (await readFile(path.join(process.cwd(), 'design', 'STYLE_FORMULA.txt'), 'utf8')).trim()
const generatedAt = '2026-07-29T00:00:00.000Z'
const frameSize = 64
const frameCount = 8
const forceCharacterAnimations = process.env.V3_FORCE_CHARACTER_ANIMATIONS ?? ''
const forceCharacterAnimationTargets = new Set(forceCharacterAnimations.split(',').map((value) => value.trim()).filter(Boolean))
const walkCycleFirstHalfGuide = [
  'the first half of one seamless eight-pose walk loop',
  'frame 1 left foot contact',
  'frame 2 left leg weight down',
  'frame 3 left foot passing under the body',
  'frame 4 left foot lifted behind',
  'each frame must advance the legs and opposite arm swing',
].join(', ')
const walkCycleSecondHalfGuide = [
  'continue seamlessly from the supplied previous pose to finish the same walk loop',
  'frame 5 right foot contact',
  'frame 6 right leg weight down',
  'frame 7 right foot passing under the body',
  'frame 8 right foot lifted behind',
  'feet and knees must visibly change silhouette in every pose',
  'opposite arm swing follows the planted foot',
].join(', ')
const walkCycleGuide = `${walkCycleFirstHalfGuide}, ${walkCycleSecondHalfGuide}`
const generatedDirections = ['n', 'ne', 'e', 'se', 's']
const allDirections = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const mirrorSource = { sw: 'se', w: 'e', nw: 'ne' }
const directionNames = { n: 'north', ne: 'north-east', e: 'east', se: 'south-east', s: 'south' }
const characterAnimationPrefixes = {
  astra_vanguard: 'astra',
  briar_sentinel: 'briar',
  sunforge_striker: 'sunforge',
  prism_adept: 'prism',
  eclipse_marshal: 'marshal',
}

const maps = [
  {
    id: 'starbright_meadow', file: 'maps/starbright-meadow.png', width: 1280, height: 720, seed: 9101,
    description: 'Top-down colorful signal meadow for a pixel RPG, a bright safe beacon in the lower-left, curved garden paths, sunny ruins, flower beds, shallow cyan streams, four clearly separated encounter clearings, readable open movement lanes, no characters, no labels',
  },
  {
    id: 'sunlit_circuit', file: 'maps/sunlit-circuit.png', width: 1024, height: 1024, seed: 9102,
    description: 'Square top-down 16 by 16 tactical garden circuit arena, bright gold lane markings, leaf-green platforms, low coral and cyan obstacles, open readable center and side paths, exact square composition, no characters, no labels',
  },
  {
    id: 'prism_gate', file: 'maps/prism-gate.png', width: 1024, height: 1024, seed: 9103,
    description: 'Square top-down 16 by 16 celebratory prism gate boss arena, clean violet and gold geometric floor, cyan light channels, symmetrical low obstacles, readable battle lanes, exact square composition, no characters, no labels',
  },
]

const characters = [
  {
    id: 'astra_vanguard', slug: 'astra-vanguard', referenceSize: 96, seed: 9201,
    description: 'Full body Astra Vanguard, optimistic young tactical hero, sky-blue mantle, gold signal blade, leaf-green relay pack, coral scarf, strong readable silhouette, identical equipment in every frame',
    action: 'a seamless energetic walk cycle with alternating planted footsteps, clear knee bend, opposite arm swing, stable torso and the gold blade held safely low',
  },
  {
    id: 'briar_sentinel', slug: 'briar-sentinel', referenceSize: 96, seed: 9202,
    description: 'Full body Briar Sentinel, friendly-shaped green plated guardian, coral spear, bright flower crest, gold joint details, strong readable silhouette, identical armor and spear in every frame',
    action: 'a seamless measured patrol walk cycle with alternating planted footsteps, visible weight transfer, spear held upright and stable',
  },
  {
    id: 'sunforge_striker', slug: 'sunforge-striker', referenceSize: 96, seed: 9203,
    description: 'Full body Sunforge Striker, compact athletic fighter, warm gold gauntlets, coral scarf, orange furnace core, cyan boots, strong readable silhouette, identical equipment in every frame',
    action: 'a seamless quick combat walk cycle with alternating planted footsteps, springy knees, balanced gauntlet swing and no foot sliding',
  },
  {
    id: 'prism_adept', slug: 'prism-adept', referenceSize: 96, seed: 9204,
    description: 'Full body Prism Adept, bright violet coat, cyan crystal focus, geometric multicolor cape, gold boots, strong readable silhouette, identical focus and clothing in every frame',
    action: 'a seamless light-footed walk cycle with alternating steps, cape following the motion in progressive poses and the crystal focus kept stable',
  },
  {
    id: 'eclipse_marshal', slug: 'eclipse-marshal', referenceSize: 128, seed: 9205,
    description: 'Full body Eclipse Marshal boss, deep-ink ceremonial armor, large gold crown ring, multicolor prism blade, coral and cyan accents, imposing readable silhouette, identical armor ring and blade in every frame',
    action: 'a seamless deliberate commander walk cycle with alternating heavy planted steps, clear weight transfer, stable crown ring and prism blade held low',
  },
]

const skills = [
  { id: 'solar_lance', label: 'gold and cyan solar energy lance', action: 'the lance ignites, extends forward into one clean piercing strike and resolves as a bright impact' },
  { id: 'bloom_guard', label: 'leaf-green and gold flower shield', action: 'the shield blooms outward once from a compact bud into a complete protective ring and settles' },
  { id: 'gale_step', label: 'sky-cyan wind step trail', action: 'one compact wind streak accelerates forward, curls behind the traveler path and fades cleanly' },
  { id: 'prism_snare', label: 'violet and cyan geometric prism snare', action: 'the lattice closes once from four bright corners into a centered binding grid and flashes' },
  { id: 'meteor_arc', label: 'coral and gold falling meteor arc', action: 'one arcing star descends into a compact circular burst and resolves as small golden sparks' },
  { id: 'radiant_mend', label: 'green and gold healing star spiral', action: 'one warm star spiral rises, closes into a bright repair emblem and softly resolves' },
  { id: 'echo_bolt', label: 'cyan and violet ricochet energy bolt', action: 'one compact bolt launches forward with two crisp echo afterimages and ends in a small flash' },
  { id: 'comet_break', label: 'white and gold finishing comet impact', action: 'one white-gold comet crashes forward into a bold breaker impact and resolves into angular sparks' },
]

function publicPath(relativePath) {
  return `/assets/v3/${relativePath.replaceAll(path.sep, '/')}`
}

function decodeBase64Png(value) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(value)
  return Buffer.from(match?.[1] ?? value, 'base64')
}

async function isValidPng(filePath, width, height) {
  try {
    const metadata = await sharp(filePath).metadata()
    return metadata.format === 'png' && metadata.width === width && metadata.height === height
  } catch {
    return false
  }
}

async function pixellabRequest(endpoint, body, label) {
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 180000)
      const response = await fetch(`https://api.pixellab.ai/v1/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(`PixelLab ${response.status}: ${JSON.stringify(json?.detail ?? json?.error ?? 'request failed')}`)
      return json
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1200))
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

async function generateStatic({ file, width, height, seed, description, transparent = false }) {
  const outputPath = path.join(root, file)
  if (await isValidPng(outputPath, width, height)) return outputPath
  const prompt = `${description}. ${styleFormula}`
  const sourceScale = Math.min(1, 400 / width, 400 / height)
  const sourceWidth = Math.max(1, Math.round(width * sourceScale))
  const sourceHeight = Math.max(1, Math.round(height * sourceScale))
  const json = await pixellabRequest('generate-image-pixflux', {
    description: prompt,
    image_size: { width: sourceWidth, height: sourceHeight },
    seed,
    no_background: transparent,
    outline: transparent ? 'single color black outline' : undefined,
    detail: width >= 720 ? 'highly detailed' : 'medium detail',
  }, file)
  if (!json?.image?.base64) throw new Error(`${file}: PixelLab response has no image.base64`)
  const png = decodeBase64Png(json.image.base64)
  const metadata = await sharp(png).metadata()
  if (
    metadata.format !== 'png' ||
    !metadata.width || !metadata.height ||
    metadata.width > 400 || metadata.height > 400
  ) {
    throw new Error(`${file}: invalid PixelLab source ${metadata.width}x${metadata.height} ${metadata.format}`)
  }
  await mkdir(path.dirname(outputPath), { recursive: true })
  const output = metadata.width === width && metadata.height === height
    ? png
    : await sharp(png).resize(width, height, { kernel: sharp.kernel.nearest }).png().toBuffer()
  await writeFile(outputPath, output)
  return outputPath
}

async function referenceImage(source) {
  const buffer = await sharp(source)
    .resize(frameSize, frameSize, { fit: 'contain', kernel: sharp.kernel.nearest, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return { type: 'base64', base64: buffer.toString('base64') }
}

async function generateAnimationChunk({ label, reference, description, action, animationGuide = '', inpaintingFrames = [], direction, seed, startFrameIndex }) {
  const negative = [
    'static pose', 'foot sliding', 'random shaking', 'changing costume', 'changing weapon', 'extra limbs', 'cropped body',
    'camera movement', 'zoom', 'turning around', 'facing a different direction', 'background scenery', 'text',
  ].join(', ')
  const json = await pixellabRequest('animate-with-text', {
    image_size: { width: frameSize, height: frameSize },
    description: `${description}. ${styleFormula}`,
    negative_description: negative,
    action: `${action}. ${animationGuide} Camera locked, no camera movement, no zoom, subject stays fully in frame, plain transparent background. The character performs only this action; nothing else happens. The subject keeps facing the same direction for the entire animation and never turns around. ${styleFormula}`,
    text_guidance_scale: 10,
    image_guidance_scale: animationGuide ? 1.4 : 1.5,
    n_frames: frameCount,
    start_frame_index: startFrameIndex,
    view: 'low top-down',
    direction,
    reference_image: reference,
    inpainting_images: inpaintingFrames.length > 0
      ? inpaintingFrames.map((frame) => ({ type: 'base64', base64: frame.toString('base64') }))
      : undefined,
    seed,
  }, `${label}:${startFrameIndex}`)
  if (!Array.isArray(json?.images) || json.images.length !== 4) {
    throw new Error(`${label}: expected four PixelLab frames, received ${json?.images?.length ?? 0}`)
  }
  return json.images.map((image) => decodeBase64Png(image.base64))
}

async function estimateCharacterSkeleton(reference, label) {
  const json = await pixellabRequest('estimate-skeleton', { image: reference }, `${label}:skeleton`)
  if (!Array.isArray(json?.keypoints) || json.keypoints.length < 14) {
    throw new Error(`${label}: PixelLab returned an incomplete skeleton`)
  }
  return json.keypoints
}

function walkPoseSkeleton(keypoints, phase) {
  const pose = keypoints.map((keypoint) => ({ ...keypoint }))
  const byLabel = Object.fromEntries(pose.map((keypoint) => [keypoint.label, keypoint]))
  const move = (label, x, y) => {
    const point = byLabel[label]
    if (!point) return
    point.x += x
    point.y += y
  }
  const lowerBody = {
    0: { leftKnee: [0.05, -0.02], leftLeg: [0.09, 0.01], rightKnee: [-0.025, 0.015], rightLeg: [-0.05, -0.055], hipY: 0 },
    1: { leftKnee: [0.035, 0.005], leftLeg: [0.065, 0.015], rightKnee: [-0.02, -0.035], rightLeg: [-0.035, -0.085], hipY: 0.018 },
    2: { leftKnee: [0.015, 0.01], leftLeg: [0.03, 0.012], rightKnee: [-0.015, -0.07], rightLeg: [-0.02, -0.12], hipY: 0 },
    3: { leftKnee: [-0.02, -0.035], leftLeg: [-0.04, -0.085], rightKnee: [-0.035, 0.005], rightLeg: [-0.065, 0.015], hipY: -0.006 },
    4: { leftKnee: [0.025, 0.015], leftLeg: [0.05, -0.055], rightKnee: [-0.05, -0.02], rightLeg: [-0.09, 0.01], hipY: 0 },
    5: { leftKnee: [0.02, -0.035], leftLeg: [0.035, -0.085], rightKnee: [-0.035, 0.005], rightLeg: [-0.065, 0.015], hipY: 0.018 },
    6: { leftKnee: [0.015, -0.07], leftLeg: [0.02, -0.12], rightKnee: [-0.015, 0.01], rightLeg: [-0.03, 0.012], hipY: 0 },
    7: { leftKnee: [0.035, 0.005], leftLeg: [0.065, 0.015], rightKnee: [0.02, -0.035], rightLeg: [0.04, -0.085], hipY: -0.006 },
  }[phase]
  const armSwing = [1, 0.65, 0.25, -0.55, -1, -0.65, -0.25, 0.55][phase]
  move('LEFT KNEE', ...lowerBody.leftKnee)
  move('LEFT LEG', ...lowerBody.leftLeg)
  move('RIGHT KNEE', ...lowerBody.rightKnee)
  move('RIGHT LEG', ...lowerBody.rightLeg)
  move('LEFT HIP', 0, lowerBody.hipY)
  move('RIGHT HIP', 0, lowerBody.hipY)
  move('LEFT ELBOW', -0.025 * armSwing, 0)
  move('LEFT ARM', -0.045 * armSwing, 0.015 * armSwing)
  move('RIGHT ELBOW', 0.025 * armSwing, 0)
  move('RIGHT ARM', 0.045 * armSwing, -0.015 * armSwing)
  return pose
}

async function generateSkeletonChunk({ label, reference, skeletons, direction, seed }) {
  const json = await pixellabRequest('animate-with-skeleton', {
    image_size: { width: frameSize, height: frameSize },
    guidance_scale: 5,
    view: 'low top-down',
    direction,
    reference_image: reference,
    skeleton_keypoints: skeletons,
    seed,
  }, label)
  if (!Array.isArray(json?.images) || json.images.length !== 3) {
    throw new Error(`${label}: expected three PixelLab skeleton frames, received ${json?.images?.length ?? 0}`)
  }
  return json.images.map((image) => decodeBase64Png(image.base64))
}

async function alphaBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 8) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('PixelLab returned a fully transparent animation frame')
  return { minX, minY, maxX, maxY }
}

async function normalizeFrames(frames) {
  const bounds = await Promise.all(frames.map(alphaBounds))
  const union = bounds.reduce((acc, box) => ({
    minX: Math.min(acc.minX, box.minX), minY: Math.min(acc.minY, box.minY),
    maxX: Math.max(acc.maxX, box.maxX), maxY: Math.max(acc.maxY, box.maxY),
  }), { minX: frameSize, minY: frameSize, maxX: -1, maxY: -1 })
  const width = union.maxX - union.minX + 1
  const height = union.maxY - union.minY + 1
  return await Promise.all(frames.map(async (frame) => {
    const sprite = await sharp(frame)
      .extract({ left: union.minX, top: union.minY, width, height })
      .resize(58, 58, { fit: 'inside', kernel: sharp.kernel.nearest, withoutEnlargement: false })
      .png()
      .toBuffer()
    const metadata = await sharp(sprite).metadata()
    return await sharp({ create: { width: frameSize, height: frameSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: sprite, left: Math.round((frameSize - (metadata.width ?? 0)) / 2), top: frameSize - (metadata.height ?? 0) - 2 }])
      .png()
      .toBuffer()
  }))
}

async function writeAnimation(relativeRoot, frames) {
  const framePaths = []
  await mkdir(path.join(root, relativeRoot), { recursive: true })
  for (let index = 0; index < frames.length; index += 1) {
    const file = path.join(relativeRoot, `frame_${String(index).padStart(3, '0')}.png`)
    await writeFile(path.join(root, file), frames[index])
    framePaths.push(publicPath(file))
  }
  const sheetFile = path.join(relativeRoot, 'sheet.png')
  await sharp({ create: { width: frameSize * frameCount, height: frameSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((frame, index) => ({ input: frame, left: index * frameSize, top: 0 })))
    .png()
    .toFile(path.join(root, sheetFile))
  return { sheetPath: publicPath(sheetFile), frames: framePaths }
}

async function validAnimation(relativeRoot) {
  if (!await isValidPng(path.join(root, relativeRoot, 'sheet.png'), 512, 64)) return false
  for (let index = 0; index < frameCount; index += 1) {
    if (!await isValidPng(path.join(root, relativeRoot, `frame_${String(index).padStart(3, '0')}.png`), 64, 64)) return false
  }
  return true
}

async function characterAnimation(character, direction, reference, skeleton) {
  const relativeRoot = path.join('characters', character.slug, 'move', direction)
  const animationId = `${character.id}:${direction}`
  const forceThisAnimation = forceCharacterAnimations === '1'
    || forceCharacterAnimationTargets.has(animationId)
  if (!forceThisAnimation && await validAnimation(relativeRoot)) {
    return {
      sheetPath: publicPath(path.join(relativeRoot, 'sheet.png')),
      frames: Array.from({ length: 8 }, (_, index) => publicPath(path.join(relativeRoot, `frame_${String(index).padStart(3, '0')}.png`))),
    }
  }
  if (!reference || !skeleton) throw new Error(`${animationId}: skeleton context is unavailable`)
  const directionName = directionNames[direction]
  const poses = Array.from({ length: frameCount }, (_, phase) => walkPoseSkeleton(skeleton, phase))
  const seed = character.seed + generatedDirections.indexOf(direction) * 20
  const first = await generateSkeletonChunk({
    label: `${animationId}:0-2`, reference, skeletons: poses.slice(0, 3), direction: directionName, seed,
  })
  const second = await generateSkeletonChunk({
    label: `${animationId}:3-5`, reference, skeletons: poses.slice(3, 6), direction: directionName, seed,
  })
  const third = await generateSkeletonChunk({
    label: `${animationId}:6-0`, reference, skeletons: [poses[6], poses[7], poses[0]], direction: directionName, seed,
  })
  return await writeAnimation(relativeRoot, await normalizeFrames([...first, ...second, ...third.slice(0, 2)]))
}

async function mirrorAnimation(character, targetDirection) {
  const sourceDirection = mirrorSource[targetDirection]
  const sourceRoot = path.join(root, 'characters', character.slug, 'move', sourceDirection)
  const frames = []
  for (let index = 0; index < frameCount; index += 1) {
    frames.push(await sharp(path.join(sourceRoot, `frame_${String(index).padStart(3, '0')}.png`)).flop().png().toBuffer())
  }
  return await writeAnimation(path.join('characters', character.slug, 'move', targetDirection), frames)
}

async function skillAnimation(skill, iconPath, seed) {
  const relativeRoot = path.join('skills', 'fx', skill.id)
  if (await validAnimation(relativeRoot)) {
    return {
      sheetPath: publicPath(path.join(relativeRoot, 'sheet.png')),
      frames: Array.from({ length: 8 }, (_, index) => publicPath(path.join(relativeRoot, `frame_${String(index).padStart(3, '0')}.png`))),
    }
  }
  const reference = await referenceImage(iconPath)
  const description = `Centered isolated pixel game skill effect, ${skill.label}, high contrast readable silhouette`
  const first = await generateAnimationChunk({ label: `fx:${skill.id}`, reference, description, action: skill.action, direction: 'east', seed, startFrameIndex: 0 })
  const second = await generateAnimationChunk({ label: `fx:${skill.id}`, reference, description, action: skill.action, direction: 'east', seed, startFrameIndex: 4 })
  return await writeAnimation(relativeRoot, await normalizeFrames([...first, ...second]))
}

await mkdir(root, { recursive: true })
const manifest = { version: 'v3-pixellab-1', generatedAt, styleFormula, assets: [], maps: [], characters: [], skills: [] }

function addAsset({ id, path: assetPath, width, height, transparent, seed, visualBrief, frameCount: count = 1, directions = [], sourceType = 'PixelLab', generationMethod = 'generate-image-pixflux' }) {
  manifest.assets.push({
    id,
    path: assetPath,
    dimensions: { width, height },
    transparent,
    seed,
    visualBrief,
    frameCount: count,
    directions,
    sourceType,
    generationMethod,
  })
}

for (const map of maps) {
  process.stdout.write(`PixelLab map ${map.id}\n`)
  await generateStatic(map)
  const prompt = `${map.description}. ${styleFormula}`
  const assetPath = publicPath(map.file)
  manifest.maps.push({ id: map.id, path: assetPath, width: map.width, height: map.height, seed: map.seed, prompt })
  addAsset({ id: `map_${map.id}`, path: assetPath, width: map.width, height: map.height, transparent: false, seed: map.seed, visualBrief: prompt })
}

for (const character of characters) {
  const referenceFile = path.join('characters', character.slug, 'reference.png')
  const referencePrompt = `${character.description}, isolated single game character, plain transparent background, no floor shadow. ${styleFormula}`
  process.stdout.write(`PixelLab character ${character.id} reference\n`)
  await generateStatic({
    file: referenceFile, width: character.referenceSize, height: character.referenceSize, seed: character.seed, transparent: true,
    description: `${character.description}, isolated single game character, plain transparent background, no floor shadow`,
  })
  const hasInvalidDirection = (await Promise.all(generatedDirections.map((direction) => (
    validAnimation(path.join('characters', character.slug, 'move', direction))
  )))).some((valid) => !valid)
  const needsSkeleton = forceCharacterAnimations === '1'
    || generatedDirections.some((direction) => forceCharacterAnimationTargets.has(`${character.id}:${direction}`))
    || hasInvalidDirection
  const characterReference = needsSkeleton ? await referenceImage(path.join(root, referenceFile)) : null
  const characterSkeleton = characterReference ? await estimateCharacterSkeleton(characterReference, character.id) : null
  const directions = {}
  const generated = await mapWithConcurrency(generatedDirections, 3, async (direction) => {
    process.stdout.write(`PixelLab character ${character.id} ${direction} frames\n`)
    return [direction, { ...await characterAnimation(character, direction, characterReference, characterSkeleton), fps: 12 }]
  })
  for (const [direction, animation] of generated) directions[direction] = animation
  for (const direction of Object.keys(mirrorSource)) {
    process.stdout.write(`Mirror character ${character.id} ${direction} frames\n`)
    directions[direction] = { ...await mirrorAnimation(character, direction), fps: 12 }
  }
  const referencePath = publicPath(referenceFile)
  manifest.characters.push({
    id: character.id,
    referencePath,
    seed: character.seed,
    prompt: referencePrompt,
    directions: Object.fromEntries(allDirections.map((direction) => [direction, directions[direction]])),
  })
  addAsset({
    id: `character_${character.id}`,
    path: referencePath,
    width: character.referenceSize,
    height: character.referenceSize,
    transparent: true,
    seed: character.seed,
    visualBrief: referencePrompt,
  })
  const animationBrief = `${character.description}. ${character.action}. ${walkCycleGuide}. ${styleFormula}`
  for (const direction of allDirections) {
    const sourceDirection = mirrorSource[direction] ?? direction
    addAsset({
      id: `${characterAnimationPrefixes[character.id]}_move_${direction}`,
      path: directions[direction].sheetPath,
      width: 512,
      height: 64,
      transparent: true,
      seed: character.seed + generatedDirections.indexOf(sourceDirection) * 20,
      visualBrief: animationBrief,
      frameCount,
      directions: [direction],
      sourceType: mirrorSource[direction] ? 'PixelLab mirror' : 'PixelLab',
      generationMethod: mirrorSource[direction] ? 'horizontal-mirror' : 'animate-with-skeleton',
    })
  }
}

const generatedSkills = await mapWithConcurrency(skills, 3, async (skill, index) => {
  const iconFile = path.join('skills', 'icons', `${skill.id}.png`)
  const iconSeed = 9301 + index
  const fxSeed = 9401 + index
  process.stdout.write(`PixelLab skill ${skill.id} icon\n`)
  const iconPrompt = `Centered pixel game skill icon, ${skill.label}, one bold readable symbol, no border frame. ${styleFormula}`
  const iconPath = await generateStatic({
    file: iconFile, width: 64, height: 64, seed: iconSeed, transparent: true,
    description: `Centered pixel game skill icon, ${skill.label}, one bold readable symbol, no border frame`,
  })
  process.stdout.write(`PixelLab skill ${skill.id} effect frames\n`)
  const fx = await skillAnimation(skill, iconPath, fxSeed)
  return { id: skill.id, iconPath: publicPath(iconFile), fxSheetPath: fx.sheetPath, fxFrames: fx.frames, fps: 14, iconSeed, fxSeed, iconPrompt, fxPrompt: `Centered isolated pixel game skill effect, ${skill.label}, high contrast readable silhouette. ${styleFormula}` }
})
for (const skill of generatedSkills) {
  manifest.skills.push(skill)
  addAsset({ id: `icon_${skill.id}`, path: skill.iconPath, width: 64, height: 64, transparent: true, seed: skill.iconSeed, visualBrief: skill.iconPrompt })
  addAsset({ id: `fx_${skill.id}`, path: skill.fxSheetPath, width: 512, height: 64, transparent: true, seed: skill.fxSeed, visualBrief: skill.fxPrompt, frameCount, directions: ['e'], generationMethod: 'animate-with-text' })
}

const manifestPath = path.join(root, 'manifest.json')
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const assetHash = createHash('sha256')
for (const file of [
  ...manifest.maps.map((item) => item.path),
  ...manifest.characters.flatMap((item) => [item.referencePath, ...Object.values(item.directions).flatMap((direction) => [direction.sheetPath, ...direction.frames])]),
  ...manifest.skills.flatMap((item) => [item.iconPath, item.fxSheetPath, ...item.fxFrames]),
].sort()) {
  assetHash.update(file)
  assetHash.update(await readFile(path.join(process.cwd(), 'public', file.replace(/^\//, ''))))
}
const visualFingerprint = assetHash.digest('hex')
const provenancePath = path.join(process.cwd(), 'src', 'content', 'generated', 'v3', 'provenance.json')
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'))
provenance.visualFingerprint = visualFingerprint
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)
await access(manifestPath)
process.stdout.write(`V3 PixelLab manifest complete\nvisual fingerprint: ${visualFingerprint}\n`)
