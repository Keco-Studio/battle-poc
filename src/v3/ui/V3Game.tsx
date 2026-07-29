'use client'

import { ExternalLink, Flag, MapPin, Radio, Shield, Sparkles, Star } from 'lucide-react'

import { V3_CONTENT } from '@/src/content/generated/v3'
import { V3PhaserStage } from '@/src/v3/presentation/V3PhaserStage'
import { useV3Game } from '@/src/v3/runtime/useV3Game'

import { BattleReport } from './BattleReport'
import { ExploreHud } from './ExploreHud'
import { PreparationPanel } from './PreparationPanel'
import { SpectatorConsole } from './SpectatorConsole'
import { V3Controls } from './V3Controls'
import './v3.css'

export function V3Game() {
  const game = useV3Game()
  const phase = game.phaseState.phase
  const reward = game.selectedEncounter
    ? V3_CONTENT.rewards[game.selectedEncounter.rewardId] ?? null
    : null
  const currentPositionEncounter = Object.values(V3_CONTENT.encounters).find((encounter) => (
    game.progress.unlockedEncounterIds.includes(encounter.id)
    && encounter.x === game.progress.playerPosition.x
    && encounter.y === game.progress.playerPosition.y
  )) ?? null
  const remaining = Object.values(V3_CONTENT.encounters).filter((encounter) => (
    game.progress.unlockedEncounterIds.includes(encounter.id)
    && !game.progress.clearedEncounterIds.includes(encounter.id)
  ))
  const objective = remaining.length > 0
    ? `Head to ${remaining[0].name} and win the challenge`
    : 'All challenges cleared; you can revisit any location'

  return (
    <main className="v3-shell" data-phase={phase}>
      <header className="v3-topbar">
        <div className="v3-brand">
          <span className="v3-brand-mark"><Sparkles size={19} /></span>
          <div><strong>AI BATTLE</strong><span>Starbright Frontier</span></div>
        </div>
        <div className="v3-top-stats">
          <span><Radio size={15} /> {phase === 'battle' ? 'Dual AI live simulation' : 'Frontier signal stable'}</span>
          <span><Star size={15} /> {game.progress.starlight}</span>
          <span><Shield size={15} /> {game.progress.clearedEncounterIds.length}/4</span>
          <a href="/legacy" title="Open legacy interface">Legacy <ExternalLink size={14} /></a>
        </div>
      </header>

      <div className="v3-layout">
        <section className="v3-stage-column" aria-label="Pixel world">
          <V3PhaserStage
            className="v3-stage"
            viewModel={game.viewModel}
            onMoveIntent={game.move}
            onTravelArrival={game.handleTravelArrival}
            onAnimationComplete={game.handleAnimationComplete}
          />
          {phase === 'explore' && (
            <>
              <ExploreHud
                progress={game.progress}
                objective={objective}
                nearbyEncounter={currentPositionEncounter}
                onOpenEncounter={game.openEncounter}
              />
              <V3Controls onMove={(direction) => game.move({ kind: 'direction', direction })} />
            </>
          )}
          {phase === 'battle' && game.battle && (
            <div className="v3-battle-badge">
              <span>DECISION TICK {game.battle.tick}</span>
              <strong>{game.viewModel.battle?.activeActionLabel ?? 'Both AIs are computing the next action'}</strong>
            </div>
          )}
        </section>

        <section className="v3-side-column">
          {phase === 'explore' && (
            <div className="v3-map-console">
              <span className="v3-kicker">Starbright Frontier</span>
              <h2>Adventure route</h2>
              <section className="v3-mission-card">
                <span><Flag size={15} /> Current mission</span>
                <strong>{objective}</strong>
              </section>
              <div className="v3-journey-progress" aria-label="Journey progress">
                <span>Journey progress</span>
                <strong>{game.progress.clearedEncounterIds.length} / {Object.keys(V3_CONTENT.encounters).length}</strong>
                <i style={{ width: `${game.progress.clearedEncounterIds.length / Object.keys(V3_CONTENT.encounters).length * 100}%` }} />
              </div>
              <ol>
                {Object.values(V3_CONTENT.encounters).map((encounter) => {
                  const unlocked = game.progress.unlockedEncounterIds.includes(encounter.id)
                  const cleared = game.progress.clearedEncounterIds.includes(encounter.id)
                  const stateLabel = cleared ? 'Cleared' : unlocked ? 'Available' : 'Locked'
                  return (
                    <li key={encounter.id} className={cleared ? 'is-cleared' : unlocked ? 'is-unlocked' : 'is-locked'}>
                      <span className="v3-node-icon">{encounter.boss ? <Shield size={17} /> : <MapPin size={17} />}</span>
                      <div><strong>{encounter.name}</strong><small>{stateLabel}</small></div>
                      {unlocked && !cleared && (
                        <button
                          type="button"
                          aria-label={`Go to ${encounter.name}`}
                          onClick={() => game.move({ kind: 'target', to: { x: encounter.x, y: encounter.y } })}
                        >
                          Go
                        </button>
                      )}
                    </li>
                  )
                })}
              </ol>
              <div className="v3-field-tip"><strong>Movement</strong><span>Arrow keys / WASD / click the map</span></div>
            </div>
          )}

          {phase === 'prepare' && game.selectedEncounter && game.selectedEnemy && (
            <PreparationPanel
              mode={game.mode}
              encounter={game.selectedEncounter}
              player={game.player}
              enemy={game.selectedEnemy}
              playerSkillIds={game.playerSkillIds}
              enemySkillIds={game.enemySkillIds}
              playerTreeId={game.playerTreeId}
              enemyTreeId={game.enemyTreeId}
              modelProvider={game.modelProvider}
              skills={V3_CONTENT.skills}
              trees={V3_CONTENT.trees}
              validationErrors={game.validationErrors}
              progressionBonuses={game.earnedProgressionBonuses}
              statModifiers={game.statModifiers}
              onModeChange={game.setMode}
              onPlayerSkillChange={game.updatePlayerSkill}
              onEnemySkillChange={game.updateEnemySkill}
              onPlayerTreeChange={game.setPlayerTreeId}
              onEnemyTreeChange={game.setEnemyTreeId}
              onModelProviderChange={game.setModelProvider}
              onStart={game.startBattle}
              onCancel={game.cancelPreparation}
            />
          )}

          {phase === 'battle' && game.battle && (
            <SpectatorConsole
              battle={game.battle}
              activeEvent={game.activeEvent}
              latestDecisionEvidence={game.latestDecisionEvidence}
              paused={game.paused}
              speed={game.speed}
              activeTab={game.consoleTab}
              eventFilter={game.timelineFilter}
              onPauseToggle={game.togglePause}
              onStep={game.step}
              onSpeedChange={game.setSpeed}
              onTabChange={game.setConsoleTab}
              onEventFilterChange={game.setTimelineFilter}
            />
          )}

          {phase === 'report' && game.battle && game.selectedEncounter && (
            <BattleReport
              battle={game.battle}
              encounter={game.selectedEncounter}
              mode={game.mode}
              durationMs={game.durationMs}
              reward={reward}
              timelineFilter={game.timelineFilter}
              onTimelineFilterChange={game.setTimelineFilter}
              onReplay={game.replay}
              onRematch={game.rematch}
              onReturnToMap={game.returnToMap}
            />
          )}
        </section>
      </div>
    </main>
  )
}
