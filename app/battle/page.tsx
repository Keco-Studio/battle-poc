import BattleDemoClient from './BattleDemoClient'

export default function BattlePage() {
  return (
    <main className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold text-white mb-4">Battle Demo</h1>
      <BattleDemoClient />
    </main>
  )
}
