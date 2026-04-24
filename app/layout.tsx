import type { Metadata } from 'next'
import { SupabaseProvider } from '@/src/lib/SupabaseContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'Battle Demo',
  description: 'NPC Battle System Demo',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body>
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
    </html>
  )
}
