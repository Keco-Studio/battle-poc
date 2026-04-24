'use client'

import { useEffect, useMemo, useState } from 'react'

type Props = {
  open: boolean
  mapId: string
  width: number
  height: number
  collision: number[]
  onClose: () => void
  onSaved: () => void
}

export default function CollisionEditorModal(props: Props) {
  const { open, mapId, width, height, collision, onClose, onSaved } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<number[]>(() => collision.slice())

  // When opening on a new map/collision, reset draft.
  // (simple heuristic: key by length + mapId)
  const key = `${mapId}:${width}x${height}:${collision.length}`
  useEffect(() => {
    if (!open) return
    setDraft(collision.slice())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open])

  const gridStyle = useMemo(() => {
    const cols = Math.max(1, width)
    return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
  }, [width])

  if (!open) return null

  const idxFrom = (x: number, y: number) => y * width + x

  const toggle = (x: number, y: number) => {
    const idx = idxFrom(x, y)
    setDraft((prev) => {
      const next = prev.slice()
      next[idx] = next[idx] ? 0 : 1
      return next
    })
  }

  const fillAll = (val: 0 | 1) => {
    setDraft(Array(width * height).fill(val))
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const resp = await fetch('/api/maps/update-collision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapId, collision: draft }),
      })
      const data = (await resp.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || `Save failed (HTTP ${resp.status})`)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 px-4">
      <div className="w-[min(980px,calc(100vw-1rem))] rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-100">Edit Collision (Walkable/Blocked)</div>
            <div className="truncate text-[11px] text-slate-400">
              Map <span className="font-mono text-slate-200">{mapId}</span> · {width}×{height}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fillAll(0)}
              className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              All Walkable
            </button>
            <button
              type="button"
              onClick={() => fillAll(1)}
              className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              All Blocked
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
          <div className="max-h-[min(70vh,720px)] overflow-auto rounded-xl border border-slate-800 bg-black/35 p-2">
            <div className="grid gap-[2px]" style={gridStyle}>
              {Array.from({ length: width * height }).map((_, i) => {
                const blocked = draft[i] === 1
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggle(i % width, Math.floor(i / width))}
                    className="aspect-square rounded-[3px]"
                    style={{
                      background: blocked ? 'rgba(239,68,68,0.75)' : 'rgba(16,185,129,0.25)',
                      border: '1px solid rgba(148,163,184,0.18)',
                    }}
                    aria-label={blocked ? 'blocked' : 'walkable'}
                  />
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-black/35 p-3 text-[11px] text-slate-200">
            <div className="font-semibold text-slate-100">Legend</div>
            <div>
              - Green: Walkable (0)
              <br />- Red: Blocked (1)
            </div>
            <div className="text-slate-400">
              After saving, will write to collisionLayer of <span className="font-mono">data/maps/{mapId}.json</span>, character movement and enemy patrol will be blocked accordingly.
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="mt-1 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Saving...' : 'Save Collision'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

