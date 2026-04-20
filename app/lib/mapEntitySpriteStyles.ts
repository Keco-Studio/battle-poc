import type { CSSProperties } from 'react'

import type { MapCharacterVisualId } from '../constants'

/** ai-rpg-poc 导出的角色表：768×256，32×32 帧，首帧为朝下的 idle */
const CHAR_FRAME = 32
const CHAR_SHEET_W = 768
const CHAR_SHEET_H = 256

export function mapCharacterIdleStyle(visualId: MapCharacterVisualId, displaySize: number): CSSProperties {
  const url = visualId.startsWith('pixellab:')
    ? `/assets/characters/${encodeURIComponent(visualId.slice('pixellab:'.length))}.png`
    : visualId === 'warriorBlue'
      ? '/characters/Warrior-Blue.png'
      : '/characters/Archer-Green.png'
  const scale = displaySize / CHAR_FRAME
  return {
    width: displaySize,
    height: displaySize,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${CHAR_SHEET_W * scale}px ${CHAR_SHEET_H * scale}px`,
    backgroundPosition: '0 0',
    imageRendering: 'pixelated',
  }
}

export function mapTileSpriteStyle(
  params: {
    imageUrl: string
    columns: number
    tileWidth: number
    tileHeight: number
    tileCount: number
    tileIndex: number
  },
  displaySize: number,
): CSSProperties {
  const { imageUrl, columns, tileWidth, tileHeight, tileCount, tileIndex } = params
  if (tileIndex <= 0 || tileIndex > tileCount || columns <= 0) {
    return {
      width: displaySize,
      height: displaySize,
      backgroundColor: 'rgba(55, 65, 81, 0.9)',
      imageRendering: 'pixelated',
    }
  }
  const i = tileIndex - 1
  const sx = i % columns
  const sy = Math.floor(i / columns)
  const rows = Math.ceil(tileCount / columns)
  const scale = displaySize / tileWidth
  const sheetW = columns * tileWidth * scale
  const sheetH = rows * tileHeight * scale
  return {
    width: displaySize,
    height: displaySize,
    backgroundImage: `url("${imageUrl}")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sheetW}px ${sheetH}px`,
    backgroundPosition: `${-sx * tileWidth * scale}px ${-sy * tileHeight * scale}px`,
    imageRendering: 'pixelated',
  }
}
