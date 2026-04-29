import { useCallback } from 'react'
import type { Enemy, MapCharacterVisualId } from '@/app/constants'
import { ensureDeepClawAgentEnemy } from '@/app/components/map-ui/utils/gameMapBattleUtils'

type MapInfoSnapshot = {
  width: number
  height: number
  collision: number[]
  ground: number[]
  tilesetId: string | null
}

type UsePixellabSyncParams = {
  selectedMapId: string
  mapInfo: MapInfoSnapshot
  setPixellabSyncHint: (hint: string | null) => void
  setPlayerVisualId: (visualId: MapCharacterVisualId) => void
  setEnemies: (updater: (prev: Enemy[]) => Enemy[]) => void
}

export function usePixellabSync({
  selectedMapId,
  mapInfo,
  setPixellabSyncHint,
  setPlayerVisualId,
  setEnemies,
}: UsePixellabSyncParams): () => Promise<void> {
  return useCallback(async () => {
    setPixellabSyncHint('Syncing...')
    try {
      const res = await fetch('/api/pixellab-sync', { method: 'POST' })
      const data = (await res.json()) as { ok?: boolean; copiedFiles?: number; errors?: string[] }
      if (data.ok) {
        setPixellabSyncHint(`Synced ${data.copiedFiles ?? 0} files`)
      } else {
        setPixellabSyncHint(data.errors?.[0] ?? 'Sync incomplete')
      }
      const mapRes = await fetch(`/api/airpg-map?map=${encodeURIComponent(selectedMapId)}`)
      if (mapRes.ok) {
        const d = (await mapRes.json()) as {
          width?: number
          height?: number
          collision?: number[]
          ground?: number[]
          tileset?: { id?: string | null } | null
          enemies: Enemy[]
          playerVisualId?: MapCharacterVisualId
        }
        if (d.playerVisualId) setPlayerVisualId(d.playerVisualId)
        if (d.enemies?.length) {
          setEnemies(() =>
            ensureDeepClawAgentEnemy(d.enemies, {
              width: d.width ?? mapInfo.width,
              height: d.height ?? mapInfo.height,
              collision: d.collision ?? mapInfo.collision,
              ground: d.ground ?? mapInfo.ground,
              tilesetId: d.tileset?.id ?? mapInfo.tilesetId,
            }),
          )
        }
      }
    } catch (e) {
      setPixellabSyncHint(e instanceof Error ? e.message : 'Sync failed')
    }
    window.setTimeout(() => setPixellabSyncHint(null), 4200)
  }, [mapInfo.collision, mapInfo.ground, mapInfo.height, mapInfo.tilesetId, mapInfo.width, selectedMapId, setEnemies, setPixellabSyncHint, setPlayerVisualId])
}
