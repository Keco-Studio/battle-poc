import { Flag, MapPin, ShieldCheck, Sparkles, Star } from 'lucide-react'

import type { V3Encounter } from '@/src/content/generated/v3'
import type { V3Progress } from '@/src/v3/runtime/campaign'

export type ExploreHudProps = {
  progress: V3Progress
  objective: string
  nearbyEncounter: V3Encounter | null
  onOpenEncounter: (encounterId: string) => void
}

export function ExploreHud({ progress, objective, nearbyEncounter, onOpenEncounter }: ExploreHudProps) {
  return (
    <div className="v3-explore-hud" aria-label="探索状态">
      <div className="v3-hud-strip">
        <span><ShieldCheck size={15} /> 星辉先锋</span>
        <span><Star size={15} /> {progress.starlight}</span>
        <span><Sparkles size={15} /> EXP {progress.exp}</span>
        <span><MapPin size={15} /> {progress.playerPosition.x},{progress.playerPosition.y}</span>
      </div>
      <div className="v3-objective-band">
        <Flag size={16} />
        <span>{objective}</span>
      </div>
      {nearbyEncounter && (
        <button
          className="v3-encounter-prompt"
          type="button"
          onClick={() => onOpenEncounter(nearbyEncounter.id)}
        >
          <span>发现 {nearbyEncounter.name}</span>
          <strong>进入战前准备</strong>
        </button>
      )}
    </div>
  )
}
