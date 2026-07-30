import { Map, RefreshCw, RotateCcw, Trophy } from 'lucide-react'

import type { V3Encounter, V3Reward } from '@/src/content/generated/v3'
import type { V3BattleMode } from '@/src/v3/runtime/campaign'
import type { V3BattleState } from '@/src/v3/runtime/types'
import type { V3TimelineFilter } from '@/src/v3/runtime/useV3Game'
import { playerEventText } from '@/src/v3/presentation/playerText'
import { analyzeBattle } from '@/src/v3/runtime/battleAnalysis'

export type BattleReportProps = {
  battle: V3BattleState
  encounter: V3Encounter
  mode: V3BattleMode
  durationMs: number
  reward: V3Reward | null
  timelineFilter: V3TimelineFilter
  onTimelineFilterChange: (filter: V3TimelineFilter) => void
  onReplay: () => void
  onRematch: () => void
  onReturnToMap: () => void
}

export function BattleReport(props: BattleReportProps) {
  const victory = props.battle.result === 'left_win'
  const analysis = analyzeBattle(props.battle)
  const filtered = props.battle.events.filter((event) => {
    if (props.timelineFilter === 'all') return true
    if (props.timelineFilter === 'patch') return event.type === 'patch'
    if (props.timelineFilter === 'action') return ['action', 'action_rejected', 'move', 'guard'].includes(event.type)
    return ['damage', 'heal', 'shield', 'status', 'result'].includes(event.type)
  })
  const firstPatch = props.battle.patchRecords[0]
  const lastPatch = props.battle.patchRecords.at(-1)
  const endReason = props.battle.endReason === 'hp_zero'
    ? 'One side reached zero HP'
    : props.battle.endReason === 'max_tick'
      ? 'Maximum turn count reached'
      : props.battle.endReason ?? 'Battle ended'

  return (
    <aside className="v3-report" aria-label="Battle recap">
      <header className={victory ? 'is-victory' : 'is-defeat'}>
        <Trophy size={25} />
        <div><span>Battle result</span><h2>{victory ? 'Challenge cleared' : props.battle.result === 'draw' ? 'Draw' : 'Challenge failed'}</h2></div>
      </header>

      <div className="v3-report-meta">
        <span>End reason<strong>{endReason}</strong></span>
        <span>Turns<strong>{props.battle.tick}</strong></span>
        <span>Duration<strong>{(props.durationMs / 1000).toFixed(1)}s</strong></span>
      </div>

      <section className="v3-report-stats">
        <h3>Battle stats</h3>
        <p>Ally damage <strong>{props.battle.actors.left.damageDealt}</strong></p>
        <p>Enemy damage <strong>{props.battle.actors.right.damageDealt}</strong></p>
        <p>Ally healing <strong>{props.battle.actors.left.healingDone}</strong></p>
        <p>Strategy adjustments <strong>{props.battle.patchRecords.length}</strong></p>
      </section>

      <section className={`v3-report-insights ${victory ? 'is-strength' : 'is-adjustment'}`}>
        <h3>{victory ? 'Keys to victory' : 'Next adjustments'}</h3>
        {analysis.insights.map((insight) => (
          <article key={`${insight.title}-${insight.detail}`}>
            <strong>{insight.title}</strong>
            <p>{insight.detail}</p>
          </article>
        ))}
      </section>

      <details className="v3-advanced-details v3-report-details">
        <summary>Advanced details</summary>
        <section className="v3-tree-diff">
          <p>Random seed {props.battle.initialConfig.seed}</p>
          <p>Strategy version {firstPatch?.baseTreeVersion ?? 1} → {lastPatch?.resultingTreeVersion ?? props.battle.trees.left.version}</p>
          <p>Content version {props.battle.initialConfig.versions.content}</p>
          <p>Rules version {props.battle.initialConfig.versions.rules}</p>
          <p>Visual version {props.battle.initialConfig.versions.visual}</p>
          <p>Model version {props.battle.initialConfig.versions.model}</p>
          <code>{lastPatch?.reason ?? 'No strategy adjustments in this battle'}</code>
        </section>
      </details>

      {props.mode === 'standard' && victory && props.reward && (
        <section className="v3-reward-band">
          <strong>{props.reward.name}</strong>
          <span>+{props.reward.exp} EXP | +{props.reward.starlight} Starlight</span>
          <p>{props.reward.description}</p>
        </section>
      )}
      {props.mode === 'sandbox' && <p className="v3-sandbox-note">Sandbox tests do not write rewards, unlocks, or official records.</p>}

      <label className="v3-filter-line">
        <span>Timeline filter</span>
        <select value={props.timelineFilter} onChange={(event) => props.onTimelineFilterChange(event.target.value as V3TimelineFilter)}>
          <option value="all">All</option><option value="patch">Strategy adjustments</option><option value="action">Actions</option><option value="combat">Health changes</option>
        </select>
      </label>
      <ol className="v3-report-timeline">
        {filtered.slice(-12).reverse().map((event) => <li key={event.id}><span>T{event.tick}</span><p>{playerEventText(event, props.battle)}</p></li>)}
      </ol>

      <div className="v3-report-actions">
        <button type="button" onClick={props.onReplay}><RotateCcw size={17} /> Deterministic replay</button>
        <button type="button" onClick={props.onRematch}><RefreshCw size={17} /> Rematch same config</button>
        <button className="is-primary" type="button" onClick={props.onReturnToMap}><Map size={17} /> Return to map</button>
      </div>
    </aside>
  )
}
