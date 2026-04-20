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
      {game.showCharacter && <CharacterPanel game={game} />}
      {game.showEquipment && <EquipmentPanel game={game} />}
      {game.showSkills && <SkillsPanel game={game} />}
      {!game.showCharacter && !game.showEquipment && !game.showSkills && <GameMap game={game} />}
    </>
  )
}
