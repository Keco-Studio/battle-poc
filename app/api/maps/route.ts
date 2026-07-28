import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

import { requireServerUser } from '@/src/lib/auth/require-server-user'
import {
  DEFAULT_BUILTIN_MAP_REF,
  formatBuiltinMapRef,
  formatUserMapRef,
} from '@/src/lib/maps/map-reference'
import {
  createUserMap,
  listUserMaps,
  signUserMapBackground,
} from '@/src/lib/maps/server-user-maps'
import { createServerSupabase } from '@/src/lib/supabase/server'
import { LOCAL_WEB_MODE } from '@/src/lib/runtime/localWebMode'
import { localModeUnavailable } from '@/src/lib/runtime/localModeResponse'
import { VS01_MAPS } from '@/src/content/generated/vs01/maps'

const LOCAL_MAPS_DIR = path.join(process.cwd(), 'data', 'maps')

async function listBuiltinMaps() {
  const files = await readdir(LOCAL_MAPS_DIR, { withFileTypes: true })
  const legacyMaps = files
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const legacyId = entry.name.replace(/\.json$/i, '')
      const ref = formatBuiltinMapRef(legacyId)
      return {
        id: ref,
        ref,
        source: 'builtin' as const,
        name: legacyId,
        fileName: entry.name,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const vs01Maps = VS01_MAPS.map((map) => {
    const legacyId = map.id.replaceAll('_', '-')
    const ref = formatBuiltinMapRef(legacyId)
    return {
      id: ref,
      ref,
      source: 'builtin' as const,
      name: map.name,
      fileName: null,
      previewUrl: map.backgroundImageUrl,
    }
  })
  return [...vs01Maps, ...legacyMaps.filter((map) => !vs01Maps.some((item) => item.ref === map.ref))]
}

export async function GET() {
  try {
    const builtins = await listBuiltinMaps()
    if (LOCAL_WEB_MODE) {
      return NextResponse.json({
        maps: builtins,
        defaultMapId: builtins.some((map) => map.ref === DEFAULT_BUILTIN_MAP_REF)
          ? DEFAULT_BUILTIN_MAP_REF
          : builtins[0]?.ref ?? null,
      })
    }
    // Legacy Supabase implementation retained below.
    const supabase = await createServerSupabase()
    const auth = await requireServerUser(supabase)

    if (!auth.ok || !supabase) {
      return NextResponse.json({
        maps: builtins,
        defaultMapId: builtins.some((map) => map.ref === DEFAULT_BUILTIN_MAP_REF)
          ? DEFAULT_BUILTIN_MAP_REF
          : builtins[0]?.ref ?? null,
      })
    }

    const result = await listUserMaps(supabase, auth.user.id)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const privateMaps = await Promise.all(result.maps.map(async (map) => {
      const signed = await signUserMapBackground(
        supabase,
        auth.user.id,
        map.background_object_path,
      )
      const ref = formatUserMapRef(map.id)
      return {
        id: ref,
        ref,
        source: 'user' as const,
        name: map.name,
        fileName: null,
        previewUrl: signed.ok ? signed.url : null,
        updatedAt: map.updated_at,
      }
    }))

    return NextResponse.json({
      maps: [...builtins, ...privateMaps],
      defaultMapId: builtins.some((map) => map.ref === DEFAULT_BUILTIN_MAP_REF)
        ? DEFAULT_BUILTIN_MAP_REF
        : builtins[0]?.ref ?? privateMaps[0]?.ref ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'failed to load map catalog', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  if (LOCAL_WEB_MODE) return localModeUnavailable('cloud_maps')
  // Legacy Supabase implementation retained below.
  const supabase = await createServerSupabase()
  const auth = await requireServerUser(supabase)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  if (!supabase) return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 503 })

  let body: { name?: unknown; mapData?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const result = await createUserMap(supabase, auth.user.id, {
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
      previewUrl: null,
      updatedAt: result.map.updated_at,
    },
  }, { status: 201 })
}
