import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'

const LOCAL_MAPS_DIR = path.join(process.cwd(), 'data', 'maps')

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mapId?: string
      collision?: number[]
    }
    const mapId = typeof body.mapId === 'string' ? body.mapId.trim() : ''
    const collision = Array.isArray(body.collision) ? body.collision : null
    if (!mapId) return NextResponse.json({ ok: false, error: 'mapId 不能为空' }, { status: 400 })
    if (!collision) return NextResponse.json({ ok: false, error: 'collision 不能为空' }, { status: 400 })

    const mapFilePath = path.join(LOCAL_MAPS_DIR, `${path.basename(mapId)}.json`)
    const raw = await readFile(mapFilePath, 'utf8')
    const project = JSON.parse(raw) as any

    const startingMapId: string | undefined = project?.config?.startingMap
    const maps: Record<string, any> | undefined = project?.maps
    if (!maps || typeof maps !== 'object') {
      return NextResponse.json({ ok: false, error: '地图 JSON 格式异常：缺少 maps' }, { status: 400 })
    }
    const mapKey = startingMapId && maps[startingMapId] ? startingMapId : Object.keys(maps)[0]
    if (!mapKey || !maps[mapKey]) {
      return NextResponse.json({ ok: false, error: '地图 JSON 格式异常：找不到 map 节点' }, { status: 400 })
    }
    const mapNode = maps[mapKey]

    const w = Number(mapNode?.width ?? 0)
    const h = Number(mapNode?.height ?? 0)
    const expected = w > 0 && h > 0 ? w * h : null
    if (expected !== null && collision.length !== expected) {
      return NextResponse.json(
        { ok: false, error: `collision 长度不匹配：期望 ${expected}，实际 ${collision.length}` },
        { status: 400 },
      )
    }

    mapNode.collisionLayer = collision
    if (project?.metadata && typeof project.metadata === 'object') {
      project.metadata.updatedAt = new Date().toISOString()
    }

    await writeFile(mapFilePath, JSON.stringify(project, null, 2), 'utf8')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

