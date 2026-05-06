import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'

type PixellabResponse = {
  error?: string
  detail?: string
  image?: {
    base64?: string
  }
}

function safeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'map'
  )
}

function decodeBase64Png(data: string): Buffer {
  const m = /^data:image\/png;base64,(.+)$/i.exec(data)
  if (m?.[1]) return Buffer.from(m[1], 'base64')
  const raw = data.trim()
  if (raw.length > 32 && !/\s/.test(raw)) return Buffer.from(raw, 'base64')
  throw new Error('PixelLab returned image is not a parseable base64 PNG (data URL or raw base64)')
}

export async function POST(req: Request) {
  try {
    const token = process.env.PIXELLAB_API_TOKEN ?? ''
    if (!token) {
      return NextResponse.json({ ok: false, error: 'PIXELLAB_API_TOKEN not set' }, { status: 400 })
    }

    const body = (await req.json()) as {
      description?: string
      imageSize?: { width?: number; height?: number }
      seed?: number
      noBackground?: boolean
      outline?: string
      detail?: string
    }

    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const width = Number(body.imageSize?.width ?? 256)
    const height = Number(body.imageSize?.height ?? 256)
    const seed = typeof body.seed === 'number' ? body.seed : undefined
    const noBackground = body.noBackground !== false

    if (!description) {
      return NextResponse.json({ ok: false, error: 'description cannot be empty' }, { status: 400 })
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 32 || height < 32 || width > 400 || height > 400) {
      return NextResponse.json({ ok: false, error: 'imageSize must be between 32~400 (area limited by package)' }, { status: 400 })
    }

    const apiResp = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description,
        image_size: { width, height },
        seed,
        no_background: noBackground,
        outline: typeof body.outline === 'string' ? body.outline : undefined,
        detail: typeof body.detail === 'string' ? body.detail : undefined,
      }),
    })

    const apiJson = (await apiResp.json().catch(() => null)) as PixellabResponse | null
    if (!apiResp.ok) {
      const detail = apiJson?.error || apiJson?.detail || `${apiResp.status} ${apiResp.statusText}`
      return NextResponse.json({ ok: false, error: `PixelLab request failed: ${detail}` }, { status: apiResp.status })
    }

    const b64: string | undefined = apiJson?.image?.base64
    if (!b64) {
      return NextResponse.json({ ok: false, error: 'PixelLab returned abnormal format: missing image.base64' }, { status: 500 })
    }

    const buf = decodeBase64Png(b64)
    const stamp = Date.now()
    const id = `${safeSlug(description)}-${stamp}`
    const relDir = path.join('assets', 'maps')
    const absDir = path.join(process.cwd(), 'public', relDir)
    await mkdir(absDir, { recursive: true })
    const fileName = `${id}.png`
    await writeFile(path.join(absDir, fileName), buf)

    // Also create a minimal map JSON so it can be loaded via /api/maps like existing maps.
    // This "project-like" format matches what /api/airpg-map expects.
    const mapJsonFileName = `${id}.json`
    const mapJsonPath = path.join(process.cwd(), 'data', 'maps', mapJsonFileName)
    await mkdir(path.dirname(mapJsonPath), { recursive: true })
    const startingMapId = 'map-1'
    const gridW = 16
    const gridH = 16
    const backgroundImageUrl = `/${relDir}/${fileName}`
    const projectLike = {
      config: {
        startingMap: startingMapId,
        playerSpawn: { x: 8, y: 8 },
        playerVisualId: 'archerGreen',
      },
      maps: {
        [startingMapId]: {
          id,
          width: gridW,
          height: gridH,
          backgroundImageUrl,
          tileLayers: { ground: { data: Array(gridW * gridH).fill(0) } },
          collisionLayer: Array(gridW * gridH).fill(0),
          entities: [],
        },
      },
      tilesets: {},
      entityDefs: {},
    }
    await writeFile(mapJsonPath, JSON.stringify(projectLike, null, 2), 'utf8')

    return NextResponse.json({
      ok: true,
      id,
      fileName,
      publicUrl: `/${relDir}/${fileName}`,
      mapJsonId: id,
      mapJsonFileName,
      imageSize: { width, height },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

