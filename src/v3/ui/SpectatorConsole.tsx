import { FastForward, ListFilter, Pause, Play, SkipForward } from 'lucide-react'

import type { V3BattleEvent, V3BattleState } from '@/src/v3/runtime/types'
import {
  playerEventLabel,
  playerEventText,
  playerNodeText,
  playerPatchOperationText,
  playerPatchStatusText,
} from '@/src/v3/presentation/playerText'
import type {
  V3ConsoleTab,
  V3DecisionEvidence,
  V3TimelineFilter,
} from '@/src/v3/runtime/useV3Game'

export type SpectatorConsoleProps = {
  battle: V3BattleState
  activeEvent: V3BattleEvent | null
  latestDecisionEvidence: V3DecisionEvidence | null
  paused: boolean
  speed: 0.5 | 1 | 2 | 4
  activeTab: V3ConsoleTab
  eventFilter: V3TimelineFilter
  onPauseToggle: () => void
  onStep: () => void
  onSpeedChange: (speed: 0.5 | 1 | 2 | 4) => void
  onTabChange: (tab: V3ConsoleTab) => void
  onEventFilterChange: (filter: V3TimelineFilter) => void
}

function ActorSummary({ battle, actorId }: { battle: V3BattleState; actorId: 'left' | 'right' }) {
  const actor = battle.actors[actorId]
  const hpRatio = Math.max(0, actor.hp / actor.maxHp)
  const energyRatio = Math.max(0, actor.energy / actor.maxEnergy)
  return (
    <section className={`v3-actor-summary is-${actorId}`}>
      <div><strong>{actor.name}</strong><span>{actorId === 'left' ? 'Ally AI' : 'Enemy AI'}</span></div>
      <div className="v3-meter"><i style={{ width: `${hpRatio * 100}%` }} /><span>HP {actor.hp}/{actor.maxHp}</span></div>
      <div className="v3-meter is-energy"><i style={{ width: `${energyRatio * 100}%` }} /><span>EN {actor.energy}/{actor.maxEnergy}</span></div>
    </section>
  )
}

function filteredEvents(battle: V3BattleState, filter: V3TimelineFilter) {
  if (filter === 'all') return battle.events
  if (filter === 'patch') return battle.events.filter((event) => event.type === 'patch')
  if (filter === 'action') return battle.events.filter((event) => event.type === 'action' || event.type === 'action_rejected' || event.type === 'move' || event.type === 'guard')
  return battle.events.filter((event) => ['damage', 'heal', 'shield', 'status', 'result'].includes(event.type))
}

function decisionSourceText(source: V3DecisionEvidence['source'] | undefined): string {
  return source === 'llm' ? 'Online model' : source === 'fallback' ? 'Local deterministic strategy' : 'Awaiting decision'
}

function decisionStatusText(status: V3DecisionEvidence['status'] | undefined): string {
  if (status === 'ok') return 'Decision valid'
  if (status === 'timeout') return 'Computation timed out, safe takeover engaged'
  if (status === 'invalid') return 'Result invalid, safe takeover engaged'
  if (status === 'unavailable') return 'Online model unavailable, safe takeover engaged'
  return 'Awaiting validation'
}

function ActorDecision({ battle, actorId }: { battle: V3BattleState; actorId: 'left' | 'right' }) {
  const action = battle.events.findLast((event) => event.type === 'action' && event.actorId === actorId)
  const patch = battle.patchRecords.findLast((record) => record.actorId === actorId)
  return (
    <section className="v3-decision-row">
      <strong>{battle.actors[actorId].name}</strong>
      <span><b>Current action</b>{action ? playerEventText(action, battle) : 'Awaiting action'}</span>
      <span><b>Rationale</b>{playerNodeText(action?.nodeId, actorId, battle)}</span>
      <span><b>Strategy status</b>{playerPatchStatusText(patch?.status)}</span>
    </section>
  )
}

export function SpectatorConsole(props: SpectatorConsoleProps) {
  const latestPatch = props.battle.patchRecords.at(-1)
  const events = filteredEvents(props.battle, props.eventFilter).slice(-18).reverse()
  return (
    <aside className="v3-spectator" aria-label="AI spectator console">
      <div className="v3-actor-pair">
        <ActorSummary battle={props.battle} actorId="left" />
        <ActorSummary battle={props.battle} actorId="right" />
      </div>

      <div className="v3-tick-line">
        <strong>Tick {props.battle.tick}</strong>
        <span>{props.activeEvent ? playerEventText(props.activeEvent, props.battle) : 'Awaiting next action'}</span>
      </div>

      <div className="v3-viewer-controls">
        <button type="button" onClick={props.onPauseToggle} title={props.paused ? 'Resume' : 'Pause'}>
          {props.paused ? <Play size={17} /> : <Pause size={17} />} {props.paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" onClick={props.onStep} title="Play a single action"><SkipForward size={17} /> Step</button>
        <label><FastForward size={17} /><select value={props.speed} onChange={(event) => props.onSpeedChange(Number(event.target.value) as 0.5 | 1 | 2 | 4)}>
          <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
        </select></label>
      </div>

      <nav className="v3-console-tabs" aria-label="Spectator views">
        {(['status', 'decision', 'timeline'] as const).map((tab) => (
          <button key={tab} type="button" className={props.activeTab === tab ? 'is-active' : ''} onClick={() => props.onTabChange(tab)}>
            {tab === 'status' ? 'Battle' : tab === 'decision' ? 'AI Reasoning' : 'Battle Log'}
          </button>
        ))}
      </nav>

      {props.activeTab === 'status' && (
        <div className="v3-console-body v3-stat-grid">
          <span>Ally damage<strong>{props.battle.actors.left.damageDealt}</strong></span>
          <span>Enemy damage<strong>{props.battle.actors.right.damageDealt}</strong></span>
          <span>Ally skills<strong>{props.battle.actors.left.skillsUsed}</strong></span>
          <span>Enemy skills<strong>{props.battle.actors.right.skillsUsed}</strong></span>
          <span>Current turn<strong>{props.battle.tick}</strong></span>
          <span>Actions taken<strong>{props.battle.events.length}</strong></span>
        </div>
      )}

      {props.activeTab === 'decision' && (
        <div className="v3-console-body">
          <h3>Why this action this turn</h3>
          <div className="v3-decision-list">
            <ActorDecision battle={props.battle} actorId="left" />
            <ActorDecision battle={props.battle} actorId="right" />
          </div>
          <p className="v3-patch-reason">{latestPatch?.reason ?? props.latestDecisionEvidence?.reason ?? 'The AI is observing distance, health, and skill status.'}</p>
          <details className="v3-advanced-details">
            <summary>Advanced details</summary>
            <dl className="v3-evidence">
              <div><dt>Decision source</dt><dd>{decisionSourceText(props.latestDecisionEvidence?.source)}</dd></div>
              <div><dt>Validation status</dt><dd>{decisionStatusText(props.latestDecisionEvidence?.status)}</dd></div>
              <div><dt>Latency</dt><dd>{props.latestDecisionEvidence?.latencyMs ?? 0} ms</dd></div>
              <div><dt>Strategy version</dt><dd>{latestPatch ? `${latestPatch.baseTreeVersion} → ${latestPatch.resultingTreeVersion}` : '-'}</dd></div>
            </dl>
            <code>{latestPatch?.ops.map(playerPatchOperationText).join(' | ') || 'No strategy adjustments yet'}</code>
          </details>
        </div>
      )}

      {props.activeTab === 'timeline' && (
        <div className="v3-console-body">
          <label className="v3-filter-line"><ListFilter size={16} />
            <select value={props.eventFilter} onChange={(event) => props.onEventFilterChange(event.target.value as V3TimelineFilter)}>
              <option value="all">All events</option><option value="patch">Strategy adjustments</option><option value="action">Actions</option><option value="combat">Health changes</option>
            </select>
          </label>
          <ol className="v3-timeline">
            {events.map((event) => <li key={event.id}><span>T{event.tick}</span><strong>{playerEventLabel(event)}</strong><p>{playerEventText(event, props.battle)}</p></li>)}
          </ol>
        </div>
      )}
    </aside>
  )
}
