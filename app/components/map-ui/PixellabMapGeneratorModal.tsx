'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  onCreatedMap?: (mapId: string) => void
}

type CreateMapResp =
  | { ok: true; id: string; fileName: string; publicUrl: string; mapJsonId?: string; mapJsonFileName?: string; imageSize: { width: number; height: number } }
  | { ok: false; error: string }

export default function PixellabMapGeneratorModal(props: Props) {
  const { open, onClose, onCreatedMap } = props
  const [description, setDescription] = useState('top-down pixel art dungeon map with rooms and corridors')
  const [width, setWidth] = useState(256)
  const [height, setHeight] = useState(256)
  const [seed, setSeed] = useState<number | ''>('')
  const [noBackground, setNoBackground] = useState(false)
  const [outline, setOutline] = useState<string>('')
  const [detail, setDetail] = useState<string>('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultMapJsonId, setResultMapJsonId] = useState<string | null>(null)

  const sizeHint = useMemo(() => {
    const area = width * height
    return `Current ${width}×${height} (area ${area})`
  }, [width, height])

  if (!open) return null

  const generate = async () => {
    setBusy(true)
    setError(null)
    setResultUrl(null)
    setResultMapJsonId(null)
    try {
      const resp = await fetch('/api/pixellab/create-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          imageSize: { width, height },
          seed: seed === '' ? undefined : Number(seed),
          noBackground,
          outline: outline.trim() ? outline.trim() : undefined,
          detail: detail.trim() ? detail.trim() : undefined,
        }),
      })
      const data = (await resp.json()) as CreateMapResp
      if (!data.ok) {
        setError(data.error || 'Generation failed')
        return
      }
      setResultUrl(data.publicUrl)
      setResultMapJsonId(typeof data.mapJsonId === 'string' ? data.mapJsonId : null)
      if (typeof data.mapJsonId === 'string' && data.mapJsonId) {
        onCreatedMap?.(data.mapJsonId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4">
      <div className="w-[min(820px,calc(100vw-1rem))] rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-100">PixelLab Generate Map (pixflux)</div>
            <div className="truncate text-[11px] text-slate-400">
              Generated result will be saved to <span className="font-mono text-slate-300">public/assets/maps/</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
<label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-300">Description</span>
            <textarea
              className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
<label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-300">Width</span>
                <input
                  type="number"
                  min={32}
                  max={400}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-300">Height</span>
                <input
                  type="number"
                  min={32}
                  max={400}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-300">Seed (optional)</span>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value === '' ? '' : Number(e.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-xs text-slate-200">
                <input type="checkbox" checked={noBackground} onChange={(e) => setNoBackground(e.target.checked)} />
                Transparent background (no_background)
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-300">Outline (optional)</span>
                <input
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder="e.g. single color black outline"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-300">Detail (optional)</span>
                <input
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="(deprecated in some modes)"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
              </label>
            </div>

            <div className="text-[11px] text-slate-400">{sizeHint} (Package limit: max area varies by tier)</div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void generate()}
              className="mt-1 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Generating...' : 'Generate Map'}
            </button>

            {error && <div className="rounded-lg border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-200">{error}</div>}
          </div>
        </div>

        {resultUrl && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-black/35 p-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-300">Preview</div>
              <img src={resultUrl} alt="generated map" className="w-full rounded-lg border border-slate-800" />
            </div>
            <div className="rounded-xl border border-slate-800 bg-black/35 p-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-300">Generation Result</div>
              <div className="text-[11px] text-slate-200">
                publicUrl: <span className="font-mono text-amber-200">{resultUrl}</span>
              </div>
              {resultMapJsonId && (
                <div className="mt-1 text-[11px] text-slate-200">
                  mapId: <span className="font-mono text-sky-200">{resultMapJsonId}</span> (Written to data/maps, can be selected in map dropdown at top-right)
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(resultUrl)}
                  className="rounded bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                >
                  Copy Link
                </button>
              </div>
              <div className="mt-3 text-[10px] text-slate-400">
                Note: This is a PNG (can be used as background preview). To make it walkable grid/collision data, additional tileset/grid pipeline is needed.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

