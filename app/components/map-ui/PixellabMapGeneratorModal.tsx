'use client'

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
    return `当前 ${width}×${height}（面积 ${area}）`
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
        setError(data.error || '生成失败')
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
            <div className="truncate text-sm font-bold text-slate-100">PixelLab 生成地图（pixflux）</div>
            <div className="truncate text-[11px] text-slate-400">
              生成结果会保存到 <span className="font-mono text-slate-300">public/assets/maps/</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            关闭
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-300">描述</span>
            <textarea
              className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-300">宽</span>
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
                <span className="text-[11px] font-semibold text-slate-300">高</span>
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
                <span className="text-[11px] font-semibold text-slate-300">Seed（可选）</span>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value === '' ? '' : Number(e.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-xs text-slate-200">
                <input type="checkbox" checked={noBackground} onChange={(e) => setNoBackground(e.target.checked)} />
                透明背景（no_background）
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-300">Outline（可选）</span>
                <input
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder="e.g. single color black outline"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-300">Detail（可选）</span>
                <input
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="(deprecated in some modes)"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
                />
              </label>
            </div>

            <div className="text-[11px] text-slate-400">{sizeHint}（套餐限制：最大面积随 tier 变化）</div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void generate()}
              className="mt-1 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? '生成中…' : '生成地图'}
            </button>

            {error && <div className="rounded-lg border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-200">{error}</div>}
          </div>
        </div>

        {resultUrl && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-black/35 p-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-300">预览</div>
              <img src={resultUrl} alt="generated map" className="w-full rounded-lg border border-slate-800" />
            </div>
            <div className="rounded-xl border border-slate-800 bg-black/35 p-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-300">生成结果</div>
              <div className="text-[11px] text-slate-200">
                publicUrl: <span className="font-mono text-amber-200">{resultUrl}</span>
              </div>
              {resultMapJsonId && (
                <div className="mt-1 text-[11px] text-slate-200">
                  mapId: <span className="font-mono text-sky-200">{resultMapJsonId}</span>（已写入 data/maps，可在右上角地图下拉选择）
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                >
                  新标签页打开
                </a>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(resultUrl)}
                  className="rounded bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-slate-700"
                >
                  复制链接
                </button>
              </div>
              <div className="mt-3 text-[10px] text-slate-400">
                说明：这是一张 PNG（可做背景预览）。若要变成可走网格/碰撞数据，需要额外的 tileset/grid 管线。
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

