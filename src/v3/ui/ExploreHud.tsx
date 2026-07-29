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
    <div className="v3-explore-hud" aria-label="Exploration status">
      <div className="v3-hud-strip">
        <span><ShieldCheck size={15} /> Starbright Vanguard</span>
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
          <span>Found {nearbyEncounter.name}</span>
          <strong>Enter battle preparation</strong>
        </button>
      )}
    </div>
  )
}
