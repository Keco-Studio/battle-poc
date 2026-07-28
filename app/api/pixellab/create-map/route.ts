import { NextResponse } from 'next/server'
import sharp from 'sharp'

import { requireServerUser } from '@/src/lib/auth/require-server-user'
import { persistUserMapWithBackground } from '@/src/lib/maps/server-user-maps'
import { createServerSupabase } from '@/src/lib/supabase/server'
import { LOCAL_WEB_MODE } from '@/src/lib/runtime/localWebMode'

type PixellabResponse = {
  error?: string
  detail?: string
  image?: { base64?: string }
}

function safeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'map'
}

function decodeBase64Png(data: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/i.exec(data)
  const encoded = match?.[1] ?? data.trim()
  if (encoded.length <= 32 || /\s/.test(encoded)) {
    throw new Error('PixelLab returned image is not a parseable base64 PNG')
  }
  return Buffer.from(encoded, 'base64')
}

export async function POST(request: Request) {
  let cloudPersistence: {
    supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>
    userId: string
  } | null = null

  if (!LOCAL_WEB_MODE) {
    // Legacy Supabase authentication and persistence remain available outside local Web mode.
    const supabase = await createServerSupabase()
    const auth = await requireServerUser(supabase)
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
    }
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 })
    }
    cloudPersistence = { supabase, userId: auth.user.id }
  }

  const token = process.env.PIXELLAB_API_TOKEN ?? ''
  if (!token) {
    return NextResponse.json({ ok: false, error: 'PIXELLAB_API_TOKEN not set' }, { status: 503 })
  }

  let body: {
    description?: unknown
    imageSize?: { width?: unknown; height?: unknown }
    seed?: unknown
    noBackground?: unknown
    outline?: unknown
    detail?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const width = Number(body.imageSize?.width ?? 256)
  const height = Number(body.imageSize?.height ?? 256)
  if (!description) {
    return NextResponse.json({ ok: false, error: 'description cannot be empty' }, { status: 400 })
  }
  if (
    !Number.isInteger(width) || !Number.isInteger(height)
    || width < 32 || height < 32 || width > 400 || height > 400
  ) {
    return NextResponse.json({ ok: false, error: 'imageSize must be between 32 and 400' }, { status: 400 })
  }

  try {
    const apiResponse = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description,
        image_size: { width, height },
        seed: typeof body.seed === 'number' ? body.seed : undefined,
        no_background: body.noBackground !== false,
        outline: typeof body.outline === 'string' ? body.outline : undefined,
        detail: typeof body.detail === 'string' ? body.detail : undefined,
      }),
    })

    const apiJson = (await apiResponse.json().catch(() => null)) as PixellabResponse | null
    if (!apiResponse.ok) {
      const detail = apiJson?.error || apiJson?.detail || `${apiResponse.status} ${apiResponse.statusText}`
      return NextResponse.json(
        { ok: false, error: `PixelLab request failed: ${detail}` },
        { status: apiResponse.status },
      )
    }
    if (!apiJson?.image?.base64) {
      return NextResponse.json(
        { ok: false, error: 'PixelLab returned abnormal format: missing image.base64' },
        { status: 502 },
      )
    }

    const png = decodeBase64Png(apiJson.image.base64)
    if (png.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'generated PNG exceeds 10 MiB' }, { status: 502 })
    }
    const metadata = await sharp(png).metadata()
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
      return NextResponse.json({ ok: false, error: 'PixelLab response is not a valid PNG' }, { status: 502 })
    }
    if (metadata.width > 400 || metadata.height > 400) {
      return NextResponse.json({ ok: false, error: 'generated PNG dimensions exceed 400' }, { status: 502 })
    }

    if (LOCAL_WEB_MODE) {
      return NextResponse.json({
        ok: true,
        mapRef: null,
        previewUrl: `data:image/png;base64,${png.toString('base64')}`,
        persisted: false,
        imageSize: { width: metadata.width, height: metadata.height },
      })
    }

    if (!cloudPersistence) {
      return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 })
    }

    const gridWidth = 16
    const gridHeight = 16
    const project = {
      config: {
        startingMap: 'map-1',
        playerSpawn: { x: 8, y: 8 },
        playerVisualId: 'archerGreen',
      },
      maps: {
        'map-1': {
          id: 'map-1',
          width: gridWidth,
          height: gridHeight,
          tileLayers: { ground: { data: Array(gridWidth * gridHeight).fill(0) } },
          collisionLayer: Array(gridWidth * gridHeight).fill(0),
          entities: [],
        },
      },
      tilesets: {},
      entityDefs: {},
    }
    const result = await persistUserMapWithBackground(cloudPersistence.supabase, cloudPersistence.userId, {
      name: `${safeSlug(description)}-${Date.now()}`,
      mapData: project,
      png,
    })
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      mapRef: result.mapRef,
      previewUrl: result.previewUrl,
      persisted: true,
      imageSize: { width: metadata.width, height: metadata.height },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
