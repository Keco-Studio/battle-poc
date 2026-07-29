import type { Metadata } from 'next'
import { BattleRuntimeProviders } from '@/src/components/BattleRuntimeProviders'
import './globals.css'

export const metadata: Metadata = {
  title: 'Battle Demo',
  description: 'NPC Battle System Demo',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body>
        <BattleRuntimeProviders>{children}</BattleRuntimeProviders>
      </body>
    </html>
  )
}
