import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { config as loadEnv } from 'dotenv'
import sharp from 'sharp'

loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const token = process.env.PIXELLAB_API_TOKEN
if (!token) throw new Error('PIXELLAB_API_TOKEN is not configured')

const STYLE = 'High-contrast 2D hand-painted action-game art with crisp cel-shaded surfaces and subtle mineral texture. Shapes use sharp geometric silhouettes, broken circular motifs, and clean edges without cartoon outlines. Environments are near-black volcanic metal with cyan relay circuitry; the hero uses pale ceramic armor, enemies use charcoal bodies, and hazards signal in magenta and molten orange. Lighting is dramatic and nocturnal with restrained bloom. Maintain strong foreground separation, instantly readable effects, and one consistent three-quarter top-down perspective.'
const sourceRoot = path.join(process.cwd(), 'public', 'assets', 'ember-null', 'source')
const runtimeRoot = path.join(process.cwd(), 'public', 'assets', 'ember-null', 'runtime')

const generated = [
  ['hero-run-sheet', 'hero-run-sheet.png', 384, 128, 7101, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same pale ceramic armored relay warden in every cell, full body visible, running toward the right with a cyan glaive, four sequential stride phases, no grid lines, no text'],
  ['hero-dash-sheet', 'hero-dash-sheet.png', 384, 128, 7102, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same pale ceramic armored relay warden in every cell, full body visible, rapidly phasing toward the right, anticipation then cyan afterimage then recovery, no grid lines, no text'],
  ['hero-cast-sheet', 'hero-cast-sheet.png', 384, 128, 7103, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same pale ceramic armored relay warden in every cell, full body visible, sweeping a cyan energy glaive to cast a radial skill, windup strike and follow-through, no grid lines, no text'],
  ['cinder-idle-sheet', 'cinder-idle-sheet.png', 384, 128, 7110, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same charcoal ember wisp in every cell, fully visible, hovering and rotating three blade fragments around an orange furnace core, no grid lines, no text'],
  ['cinder-attack-sheet', 'cinder-attack-sheet.png', 384, 128, 7111, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same charcoal ember wisp in every cell, fully visible, compressing then lunging right as a sharp orange fire streak, no grid lines, no text'],
  ['husk-walk-sheet', 'husk-walk-sheet.png', 384, 128, 7120, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same broad volcanic iron construct in every cell, full body visible, heavy marching gait toward the right, shield shoulder and magenta heat seams, no grid lines, no text'],
  ['husk-charge-sheet', 'husk-charge-sheet.png', 384, 128, 7121, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same broad volcanic iron construct in every cell, full body visible, lowering shield shoulder then charging right with debris, no grid lines, no text'],
  ['revenant-glide-sheet', 'revenant-glide-sheet.png', 384, 128, 7130, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same pale frost revenant in every cell, full body visible, gliding right with a cyan veil and fractured staff, no grid lines, no text'],
  ['revenant-cast-sheet', 'revenant-cast-sheet.png', 384, 128, 7131, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same pale frost revenant in every cell, full body visible, raising a fractured staff then releasing a freezing cone to the right, no grid lines, no text'],
  ['boss-idle-sheet', 'boss-idle-sheet.png', 384, 128, 7140, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same monumental four-armed charcoal relay custodian in every cell, full body visible, hovering while a broken halo slowly turns, no grid lines, no text'],
  ['boss-summon-sheet', 'boss-summon-sheet.png', 384, 128, 7141, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same monumental four-armed charcoal relay custodian in every cell, full body visible, opening its broken halo and summoning magenta orbiting shards, no grid lines, no text'],
  ['boss-slam-sheet', 'boss-slam-sheet.png', 384, 128, 7142, 'Four-panel horizontal game animation sprite sheet, four equal 96x128 cells, the exact same monumental four-armed charcoal relay custodian in every cell, full body visible, raising both front arms then smashing downward with orange shock energy, no grid lines, no text'],
  ['iron-husk-idle', 'iron-husk-idle.png', 256, 256, 7125, 'Game sprite of a broad heavy volcanic iron construct with a shield shoulder and magenta heat seams, single character, full body visible, centered, no text'],
  ['frost-revenant-idle', 'frost-revenant-idle.png', 256, 256, 7135, 'Game sprite of a tall pale frost revenant with a cyan veil and fractured tuning-fork staff, single character, full body visible, centered, no text'],
  ['null-custodian-idle', 'null-custodian-idle.png', 256, 256, 7145, 'Game sprite of a monumental charcoal relay custodian boss with four arms and a broken magenta-orange halo, single character, full body visible, centered, no text'],
  ['relay-bolt-fx', 'relay-bolt-fx.png', 192, 192, 7150, 'Game skill effect, cyan compressed relay spear projectile with a sharp white core and radial impact shards, centered, no text'],
  ['cinder-chain-fx', 'cinder-chain-fx.png', 192, 192, 7151, 'Game skill effect, orange ember chain curling around a magenta target ring with sparks and black cinders, centered, no text'],
  ['frost-break-fx', 'frost-break-fx.png', 192, 192, 7152, 'Game skill effect, cyan ice lattice rupturing into large white angular shards and frozen mist, centered, no text'],
  ['overload-crown-fx', 'overload-crown-fx.png', 192, 192, 7153, 'Game skill effect, huge cyan crown ring intersected by molten orange electrical arcs and white shock lines, centered, no text'],
  ['skill-sigil-sheet', 'skill-sigil-sheet.png', 384, 96, 7160, 'Four-panel horizontal game UI icon sheet, four equal 96x96 cells, distinct icons for cyan relay spear, orange ember chain, white cyan frost fracture, and cyan orange overload crown, no grid lines, no text'],
]

function decodeBase64Png(value) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(value)
  return Buffer.from(match?.[1] ?? value, 'base64')
}

async function generateImage([id, fileName, width, height, seed, description]) {
  const outputPath = path.join(runtimeRoot, fileName)
  try {
    const metadata = await sharp(await readFile(outputPath)).metadata()
    if (metadata.width === width && metadata.height === height) return { id, fileName, reused: true }
  } catch {
    // Generate missing or invalid runtime assets.
  }

  const response = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: `${description}. ${STYLE}`,
      image_size: { width, height },
      seed,
      no_background: true,
      outline: 'selective outline',
      detail: 'highly detailed',
    }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${id}: PixelLab ${response.status} ${JSON.stringify(json?.error ?? json?.detail ?? 'request failed')}`)
  if (!json?.image?.base64) throw new Error(`${id}: PixelLab response has no image.base64`)
  const png = decodeBase64Png(json.image.base64)
  const metadata = await sharp(png).metadata()
  if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height) {
    throw new Error(`${id}: expected ${width}x${height} PNG, received ${metadata.width}x${metadata.height} ${metadata.format}`)
  }
  await writeFile(outputPath, png)
  return { id, fileName, reused: false }
}

async function removeKey(inputPath, outputPath, key) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const keyed = key === 'magenta'
      ? r > 185 && b > 160 && g < 120 && r + b > g * 3.2
      : g > 165 && r < 125 && b < 125 && g > (r + b) * 1.25
    if (keyed) data[index + 3] = 0
  }
  await sharp(data, { raw: info }).resize(256, 256, { fit: 'contain' }).png().toFile(outputPath)
}

await mkdir(runtimeRoot, { recursive: true })
await sharp(path.join(sourceRoot, 'ember-null-arena.png'))
  .resize(1600, 900, { fit: 'cover' })
  .png()
  .toFile(path.join(runtimeRoot, 'ember-null-arena.png'))
await removeKey(
  path.join(sourceRoot, 'relay-warden-idle.png'),
  path.join(runtimeRoot, 'relay-warden-idle.png'),
  'magenta',
)
await removeKey(
  path.join(sourceRoot, 'cinder-wisp-idle.png'),
  path.join(runtimeRoot, 'cinder-wisp-idle.png'),
  'green',
)
await removeKey(
  path.join(sourceRoot, 'iron-husk-idle.png'),
  path.join(runtimeRoot, 'iron-husk-idle.png'),
  'green',
)
await removeKey(
  path.join(sourceRoot, 'frost-revenant-idle.png'),
  path.join(runtimeRoot, 'frost-revenant-idle.png'),
  'magenta',
)
await removeKey(
  path.join(sourceRoot, 'null-custodian-idle.png'),
  path.join(runtimeRoot, 'null-custodian-idle.png'),
  'green',
)

const results = []
for (let index = 0; index < generated.length; index += 3) {
  results.push(...await Promise.all(generated.slice(index, index + 3).map(generateImage)))
  process.stdout.write(`EMBER//NULL assets: ${results.length}/${generated.length}\n`)
}

await writeFile(path.join(runtimeRoot, 'manifest.json'), `${JSON.stringify({
  version: 'ember-null-v1',
  style: STYLE,
  generatedAt: new Date().toISOString(),
  assets: results,
}, null, 2)}\n`)
