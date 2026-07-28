import { NextResponse } from 'next/server'

import { requireServerUser } from '@/src/lib/auth/require-server-user'
import { validateMapProject } from '@/src/lib/maps/map-project'
import { parseMapRef } from '@/src/lib/maps/map-reference'
import { getUserMap, updateUserMap } from '@/src/lib/maps/server-user-maps'
import { createServerSupabase } from '@/src/lib/supabase/server'
import { LOCAL_WEB_MODE } from '@/src/lib/runtime/localWebMode'
import { localModeUnavailable } from '@/src/lib/runtime/localModeResponse'

export async function POST(request: Request) {
  if (LOCAL_WEB_MODE) return localModeUnavailable('cloud_maps')
  // Legacy Supabase implementation retained below.
  const supabase = await createServerSupabase()
  const auth = await requireServerUser(supabase)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  if (!supabase) return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 })

  let body: { mapRef?: unknown; mapId?: unknown; collision?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const parsed = parseMapRef(body.mapRef ?? body.mapId)
  if (!parsed || parsed.source !== 'user') {
    return NextResponse.json(
      { ok: false, error: 'only private user maps can be edited' },
      { status: 400 },
    )
  }
  if (!Array.isArray(body.collision) || !body.collision.every(Number.isFinite)) {
    return NextResponse.json({ ok: false, error: 'collision must be a numeric array' }, { status: 400 })
  }

  const current = await getUserMap(supabase, auth.user.id, parsed.id)
  if (!current.ok) {
    return NextResponse.json({ ok: false, error: current.error }, { status: current.status })
  }
  const validated = validateMapProject(current.map.map_data)
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 500 })
  }

  const mapKey = validated.value.config.startingMap
  const mapNode = validated.value.maps[mapKey]
  const expectedLength = mapNode.width * mapNode.height
  if (body.collision.length !== expectedLength) {
    return NextResponse.json(
      {
        ok: false,
        error: `collision length mismatch: expected ${expectedLength}, actual ${body.collision.length}`,
      },
      { status: 400 },
    )
  }

  mapNode.collisionLayer = body.collision
  const metadata = validated.value.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    ;(metadata as Record<string, unknown>).updatedAt = new Date().toISOString()
  }

  const updated = await updateUserMap(supabase, auth.user.id, parsed.id, {
    mapData: validated.value,
  })
  if (!updated.ok) {
    return NextResponse.json({ ok: false, error: updated.error }, { status: updated.status })
  }
  return NextResponse.json({ ok: true, mapRef: parsed.ref })
}
