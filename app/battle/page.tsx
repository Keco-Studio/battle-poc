import dynamic from 'next/dynamic'

const PhaserGame = dynamic(() => import('@/src/renderer/PhaserGame').then((m) => m.PhaserGame), {
  ssr: false,
  loading: () => <div className="h-[900px] w-[1600px] max-w-full bg-[#1a1a2e] rounded" aria-hidden />,
})

export default function BattlePage() {
  return (
    <main className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold text-white mb-4">Battle Demo</h1>
      <PhaserGame />
    </main>
  )
}
