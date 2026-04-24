'use client'

import { useGameState } from './hooks/useGameState'
import CharacterPanel from './components/CharacterPanel'
import EquipmentPanel from './components/EquipmentPanel'
import SkillsPanel from './components/SkillsPanel'
import GameMap from './components/GameMap'

export default function HomePage() {
  const game = useGameState()

  return (
    <>
      {/* Map always rendered; character/equipment/skill panels overlay on top, keeping map visible as background */}
      <GameMap game={game} />
      {game.showCharacter && <CharacterPanel game={game} />}
      {game.showEquipment && <EquipmentPanel game={game} />}
      {game.showSkills && <SkillsPanel game={game} />}
    </>
  )
}
