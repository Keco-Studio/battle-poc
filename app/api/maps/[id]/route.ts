import { NextResponse } from 'next/server'

import { requireServerUser } from '@/src/lib/auth/require-server-user'
import { formatUserMapRef, parseMapRef } from '@/src/lib/maps/map-reference'
import { deleteUserMap, updateUserMap } from '@/src/lib/maps/server-user-maps'
import { createServerSupabase } from '@/src/lib/supabase/server'
import { LOCAL_WEB_MODE } from '@/src/lib/runtime/localWebMode'
import { localModeUnavailable } from '@/src/lib/runtime/localModeResponse'

type RouteContext = { params: Promise<{ id: string }> }

async function resolveUserMapId(context: RouteContext): Promise<string | null> {
  const { id } = await context.params
  const parsed = parseMapRef(`user:${id}`)
  return parsed?.source === 'user' ? parsed.id : null
}

export async function PATCH(request: Request, context: RouteContext) {
  if (LOCAL_WEB_MODE) return localModeUnavailable('cloud_maps')
  // Legacy Supabase implementation retained below.
  const supabase = await createServerSupabase()
  const auth = await requireServerUser(supabase)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  if (!supabase) return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 })

  const mapId = await resolveUserMapId(context)
  if (!mapId) return NextResponse.json({ ok: false, error: 'invalid_map_id' }, { status: 400 })

  let body: { name?: unknown; mapData?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const result = await updateUserMap(supabase, auth.user.id, mapId, {
    name: body.name,
    mapData: body.mapData,
  })
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }

  const mapRef = formatUserMapRef(result.map.id)
  return NextResponse.json({
    ok: true,
    map: {
      id: mapRef,
      ref: mapRef,
      source: 'user',
      name: result.map.name,
      updatedAt: result.map.updated_at,
    },
  })
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (LOCAL_WEB_MODE) return localModeUnavailable('cloud_maps')
  // Legacy Supabase implementation retained below.
  const supabase = await createServerSupabase()
  const auth = await requireServerUser(supabase)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  if (!supabase) return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 })

  const mapId = await resolveUserMapId(context)
  if (!mapId) return NextResponse.json({ ok: false, error: 'invalid_map_id' }, { status: 400 })

  const result = await deleteUserMap(supabase, auth.user.id, mapId)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
