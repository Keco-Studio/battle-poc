import type { Metadata } from 'next'
import { BattleRuntimeProviders } from '@/src/components/BattleRuntimeProviders'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/700.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Battle: 星辉边境',
  description: '双 AI 自动战斗像素战术冒险',
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
