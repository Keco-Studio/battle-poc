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
      {/* 地图始终渲染；角色/装备/技能面板叠加在其上方，保持地图作为背景可见 */}
      <GameMap game={game} />
      {game.showCharacter && <CharacterPanel game={game} />}
      {game.showEquipment && <EquipmentPanel game={game} />}
      {game.showSkills && <SkillsPanel game={game} />}
    </>
  )
}
