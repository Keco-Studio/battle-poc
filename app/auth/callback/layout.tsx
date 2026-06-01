import { BattleRuntimeProviders } from '@/src/components/BattleRuntimeProviders'

export default function AuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return <BattleRuntimeProviders>{children}</BattleRuntimeProviders>
}
