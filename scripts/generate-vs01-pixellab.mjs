import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { config as loadEnv } from 'dotenv'
import sharp from 'sharp'

loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const token = process.env.PIXELLAB_API_TOKEN
if (!token) throw new Error('PIXELLAB_API_TOKEN is not configured')

const root = path.join(process.cwd(), 'public', 'assets', 'generated', 'vs01')
const assets = [
  ['character_relay_warden', 'characters/relay-warden.png', 128, 128, true, 6101, 'Game character sprite, full body Relay Warden, compact charcoal signal armor, teal relay glyphs, ember-red scarf, readable silhouette, three-quarter top-down view, crisp pixel art, isolated character, no text'],
  ['character_cinder_wisp', 'characters/cinder-wisp.png', 128, 128, true, 6102, 'Game enemy sprite, cinder wisp made of black iron fragments and ember-red flame, teal corrupted eye, readable silhouette, three-quarter top-down view, crisp pixel art, isolated, no text'],
  ['character_iron_husk', 'characters/iron-husk.png', 128, 128, true, 6103, 'Game enemy sprite, heavy iron husk automaton, basalt armor plates, furnace-red seams, teal relay core, broad readable silhouette, three-quarter top-down view, crisp pixel art, isolated, no text'],
  ['character_frost_revenant', 'characters/frost-revenant.png', 128, 128, true, 6104, 'Game enemy sprite, frost revenant in torn dark relay robes, ice-blue lattice limbs, pale teal mask, narrow readable silhouette, three-quarter top-down view, crisp pixel art, isolated, no text'],
  ['character_null_custodian', 'characters/null-custodian.png', 128, 128, true, 6105, 'Game boss sprite, Null Custodian, tall industrial occult keeper, asymmetric basalt armor, teal relay crown, ember and frost energy, commanding readable silhouette, three-quarter top-down view, crisp pixel art, isolated, no text'],
  ['map_emberwatch_causeway', 'maps/emberwatch-causeway.png', 400, 256, false, 6201, 'Top-down pixel art game map background, Emberwatch Causeway, wide basalt industrial bridge, broken relay machinery, clear walkable central lanes, teal navigation glyphs, sparse ember-red vents and ice-blue corruption, no characters, no text, exact 25:16 composition'],
  ['map_ashen_relay_core', 'maps/ashen-relay-core.png', 400, 256, false, 6202, 'Top-down pixel art boss arena background, Ashen Relay Core, circular signal chamber within rectangular basalt floor, clear walkable combat space, teal concentric relay glyphs, ember-red ruptures and ice-blue conduits, no characters, no text, exact 25:16 composition'],
  ['fx_relay_bolt', 'skill-fx/relay-bolt.png', 96, 96, true, 6301, 'Pixel art game skill effect, compact teal relay energy bolt with white core and clean forward motion, isolated on transparent background, no text'],
  ['fx_cinder_mark', 'skill-fx/cinder-mark.png', 96, 96, true, 6302, 'Pixel art game skill effect, ember-red circular brand with black cinders and a teal signal notch, isolated on transparent background, no text'],
  ['fx_frost_lattice', 'skill-fx/frost-lattice.png', 96, 96, true, 6303, 'Pixel art game skill effect, ice-blue geometric lattice cage with pale teal highlights, readable magical control icon, isolated transparent background, no text'],
  ['fx_shatter_lance', 'skill-fx/shatter-lance.png', 96, 96, true, 6304, 'Pixel art game skill effect, sharp ice-blue signal lance exploding into angular shards, high contrast white core, isolated transparent background, no text'],
  ['fx_sunder_arc', 'skill-fx/sunder-arc.png', 96, 96, true, 6305, 'Pixel art game skill effect, broad ember-red and teal crescent slash breaking a small armor plate, isolated transparent background, no text'],
  ['fx_mending_spark', 'skill-fx/mending-spark.png', 96, 96, true, 6306, 'Pixel art game skill effect, warm white repair spark inside a teal relay ring with tiny gold motes, isolated transparent background, no text'],
  ['fx_phase_needle', 'skill-fx/phase-needle.png', 96, 96, true, 6307, 'Pixel art game skill effect, extremely narrow magenta-teal phase needle with afterimage streak, isolated transparent background, no text'],
  ['fx_overload_crown', 'skill-fx/overload-crown.png', 96, 96, true, 6308, 'Pixel art game skill effect, crown of eight teal relay nodes detonating into ember-red radial arcs, bold boss-level silhouette, isolated transparent background, no text'],
]

function decodeBase64Png(value) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(value)
  return Buffer.from(match?.[1] ?? value, 'base64')
}

async function generate(asset) {
  const [id, relativePath, width, height, transparent, seed, prompt] = asset
  const outputPath = path.join(root, relativePath)
  try {
    const existing = await readFile(outputPath)
    const metadata = await sharp(existing).metadata()
    if (metadata.format === 'png' && metadata.width === width && metadata.height === height) {
      return { id, path: `/assets/generated/vs01/${relativePath}`, width, height, transparent, seed, prompt, reused: true }
    }
  } catch {
    // Missing or invalid output is generated below.
  }

  const response = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: prompt,
      image_size: { width, height },
      seed,
      no_background: transparent,
      outline: transparent ? 'single color black outline' : undefined,
      detail: transparent ? 'medium detail' : 'highly detailed',
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
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, png)
  return { id, path: `/assets/generated/vs01/${relativePath}`, width, height, transparent, seed, prompt, reused: false }
}

const results = []
for (let start = 0; start < assets.length; start += 3) {
  const batch = await Promise.all(assets.slice(start, start + 3).map(generate))
  results.push(...batch)
  process.stdout.write(`PixelLab assets: ${results.length}/${assets.length}\n`)
}

await mkdir(root, { recursive: true })
await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify({ version: 'vs01', generatedAt: new Date().toISOString(), assets: results }, null, 2)}\n`)
process.stdout.write(`VS01 PixelLab manifest written with ${results.length} assets.\n`)
