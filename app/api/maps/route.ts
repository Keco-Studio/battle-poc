import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

const LOCAL_MAPS_DIR = path.join(process.cwd(), 'data', 'maps')

export async function GET() {
  try {
    const files = await readdir(LOCAL_MAPS_DIR, { withFileTypes: true })
    const maps = files
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => ({
        id: entry.name.replace(/\.json$/i, ''),
        fileName: entry.name,
      }))
      .sort((a, b) => a.id.localeCompare(b.id, 'zh-CN'))

    return NextResponse.json({
      maps,
      defaultMapId: maps[0]?.id ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'failed to load map catalog', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
