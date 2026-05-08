'use client'

/** Green pixel robot avatar placeholder (Engineer Bolt) */
export function BotAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="shrink-0 rounded-md bg-emerald-500 p-[3px] shadow-sm"
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    >
      <div
        className="grid h-full w-full grid-cols-5 grid-rows-5 gap-[1px]"
        style={{ imageRendering: 'pixelated' }}
      >
        {[
          0, 1, 1, 1, 0, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 1, 0, 1, 0, 1, 0,
        ].map((v, i) => (
          <span
            key={i}
            className={
              v === 0
                ? 'bg-transparent'
                : v === 2
                  ? 'bg-slate-900'
                  : v === 3
                    ? 'bg-lime-300'
                    : 'bg-emerald-600'
            }
          />
        ))}
      </div>
    </div>
  )
}
