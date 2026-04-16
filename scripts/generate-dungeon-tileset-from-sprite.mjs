import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const SRC = path.join(projectRoot, 'public/maps/tilesets/sprite.png')
const DEST = path.join(projectRoot, 'public/maps/tilesets/dungeon-tileset.png')
const CHAR_SRC = path.join(projectRoot, 'public/maps/tilesets/characters.png')

const TILE_W = 16
const TILE_H = 16
const COLS = 8
const ROWS = 8

const SRC_COLS = 8
const SRC_ROWS = 8

async function main() {
  const srcMeta = await sharp(SRC).metadata()
  if (!srcMeta.width || !srcMeta.height) {
    throw new Error('Cannot read sprite.png size')
  }

  const bigW = srcMeta.width / SRC_COLS
  const bigH = srcMeta.height / SRC_ROWS
  const tiles = []

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const srcX = Math.floor(col * bigW)
      const srcY = Math.floor(row * bigH)
      const tile = await sharp(SRC)
        .extract({
          left: srcX,
          top: srcY,
          width: Math.floor(bigW),
          height: Math.floor(bigH),
        })
        .resize(TILE_W, TILE_H, { fit: 'fill' })
        .toBuffer()
      tiles.push({ col, row, buf: tile })
    }
  }

  const blank = sharp({
    create: {
      width: COLS * TILE_W,
      height: ROWS * TILE_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })

  const composites = tiles.map(({ col, row, buf }) => ({
    input: buf,
    left: col * TILE_W,
    top: row * TILE_H,
  }))

  try {
    const charMeta = await sharp(CHAR_SRC).metadata()
    if (charMeta.width && charMeta.height) {
      const cTileW = 16
      const cTileH = 16

      async function charFrame(col, row) {
        return sharp(CHAR_SRC)
          .extract({
            left: col * cTileW,
            top: row * cTileH,
            width: cTileW,
            height: cTileH,
          })
          .toBuffer()
      }

      const playerBuf = await charFrame(13, 6)
      const guardBuf = await charFrame(5, 2)

      function destForIndex(tileIndex) {
        const i = tileIndex - 1
        const col = i % COLS
        const row = Math.floor(i / COLS)
        return { left: col * TILE_W, top: row * TILE_H }
      }

      composites.push(
        { input: playerBuf, ...destForIndex(8) },
        { input: guardBuf, ...destForIndex(32) },
      )
    }
  } catch (error) {
    console.warn('Characters overlay skipped:', error instanceof Error ? error.message : String(error))
  }

  await blank.composite(composites).png().toFile(DEST)
  console.log('Generated tileset:', DEST)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
