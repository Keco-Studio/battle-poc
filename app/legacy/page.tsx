'use client'

import Link from 'next/link'

import { useGameState } from '../hooks/useGameState'
import CharacterPanel from '../components/CharacterPanel'
import EquipmentPanel from '../components/EquipmentPanel'
import SkillsPanel from '../components/SkillsPanel'
import GameMap from '../components/GameMap'
import StudioImportModal from '../components/studioImport/StudioImportModal'
import AuthErrorNotice from '../components/AuthErrorNotice'
import './legacy.css'

export default function LegacyPage() {
  const game = useGameState()

  return (
    <>
      <AuthErrorNotice
        onRetry={() => {
          game.setShowJobSelect(false)
          game.setDockPanel('character_login')
        }}
      />
      <GameMap game={game} />
      <Link href="/" className="legacy-v3-return">返回新版 V3</Link>
      {game.showCharacter && <CharacterPanel game={game} />}
      {game.showEquipment && <EquipmentPanel game={game} />}
      {game.showSkills && <SkillsPanel game={game} />}
      {game.showStudioImport && <StudioImportModal game={game} />}
    </>
  )
}
