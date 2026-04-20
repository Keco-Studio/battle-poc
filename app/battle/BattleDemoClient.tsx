'use client'

import dynamic from 'next/dynamic'

const PhaserGame = dynamic(() => import('@/src/renderer/PhaserGame').then((m) => m.PhaserGame), {
  ssr: false,
  loading: () => <div className="h-[900px] w-[1600px] max-w-full rounded bg-[#1a1a2e]" aria-hidden />,
})

export default function BattleDemoClient() {
  return <PhaserGame />
}
