import { FastForward, ListFilter, Pause, Play, SkipForward } from 'lucide-react'

import type { V3BattleEvent, V3BattleState } from '@/src/v3/runtime/types'
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
      <div><strong>{actor.name}</strong><span>{actorId === 'left' ? '我方 AI' : '敌方 AI'}</span></div>
      <div className="v3-meter"><i style={{ width: `${hpRatio * 100}%` }} /><span>HP {actor.hp}/{actor.maxHp}</span></div>
      <div className="v3-meter is-energy"><i style={{ width: `${energyRatio * 100}%` }} /><span>EN {actor.energy}/{actor.maxEnergy}</span></div>
    </section>
  )
}

function filteredEvents(battle: V3BattleState, filter: V3TimelineFilter) {
  if (filter === 'all') return battle.events
  if (filter === 'patch') return battle.events.filter((event) => event.type === 'patch')
  if (filter === 'action') return battle.events.filter((event) => event.type === 'action' || event.type === 'move' || event.type === 'guard')
  return battle.events.filter((event) => ['damage', 'heal', 'shield', 'status', 'result'].includes(event.type))
}

export function SpectatorConsole(props: SpectatorConsoleProps) {
  const latestPatch = props.battle.patchRecords.at(-1)
  const events = filteredEvents(props.battle, props.eventFilter).slice(-18).reverse()
  return (
    <aside className="v3-spectator" aria-label="AI 观战控制台">
      <div className="v3-actor-pair">
        <ActorSummary battle={props.battle} actorId="left" />
        <ActorSummary battle={props.battle} actorId="right" />
      </div>

      <div className="v3-tick-line">
        <strong>Tick {props.battle.tick}</strong>
        <span>{props.activeEvent?.message ?? '等待下一行动'}</span>
      </div>

      <div className="v3-viewer-controls">
        <button type="button" onClick={props.onPauseToggle} title={props.paused ? '继续' : '暂停'}>
          {props.paused ? <Play size={17} /> : <Pause size={17} />} {props.paused ? '继续' : '暂停'}
        </button>
        <button type="button" onClick={props.onStep} title="单步播放一个行动"><SkipForward size={17} /> 单步</button>
        <label><FastForward size={17} /><select value={props.speed} onChange={(event) => props.onSpeedChange(Number(event.target.value) as 0.5 | 1 | 2 | 4)}>
          <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
        </select></label>
      </div>

      <nav className="v3-console-tabs" aria-label="观战视图">
        {(['status', 'decision', 'timeline'] as const).map((tab) => (
          <button key={tab} type="button" className={props.activeTab === tab ? 'is-active' : ''} onClick={() => props.onTabChange(tab)}>
            {tab === 'status' ? '状态' : tab === 'decision' ? '决策' : '时间线'}
          </button>
        ))}
      </nav>

      {props.activeTab === 'status' && (
        <div className="v3-console-body v3-stat-grid">
          <span>我方伤害<strong>{props.battle.actors.left.damageDealt}</strong></span>
          <span>敌方伤害<strong>{props.battle.actors.right.damageDealt}</strong></span>
          <span>我方技能<strong>{props.battle.actors.left.skillsUsed}</strong></span>
          <span>敌方技能<strong>{props.battle.actors.right.skillsUsed}</strong></span>
          <span>活动节点<strong>{props.battle.trees.left.rootId}</strong></span>
          <span>树版本<strong>{props.battle.trees.left.version} / {props.battle.trees.right.version}</strong></span>
        </div>
      )}

      {props.activeTab === 'decision' && (
        <div className="v3-console-body">
          <h3>Patch 证据</h3>
          <dl className="v3-evidence">
            <div><dt>来源</dt><dd>{props.latestDecisionEvidence?.source ?? '等待'}</dd></div>
            <div><dt>状态</dt><dd>{props.latestDecisionEvidence?.status ?? 'none'}</dd></div>
            <div><dt>延迟</dt><dd>{props.latestDecisionEvidence?.latencyMs ?? 0} ms</dd></div>
            <div><dt>版本</dt><dd>{latestPatch ? `${latestPatch.baseTreeVersion} → ${latestPatch.resultingTreeVersion}` : '-'}</dd></div>
          </dl>
          <p className="v3-patch-reason">{latestPatch?.reason ?? props.latestDecisionEvidence?.reason ?? '双方将在每个决策 Tick 提交一次受约束 Patch。'}</p>
          <code>{latestPatch?.ops.map((operation) => operation.kind).join(' · ') || 'no patch yet'}</code>
        </div>
      )}

      {props.activeTab === 'timeline' && (
        <div className="v3-console-body">
          <label className="v3-filter-line"><ListFilter size={16} />
            <select value={props.eventFilter} onChange={(event) => props.onEventFilterChange(event.target.value as V3TimelineFilter)}>
              <option value="all">全部事件</option><option value="patch">Patch</option><option value="action">行动</option><option value="combat">战斗数值</option>
            </select>
          </label>
          <ol className="v3-timeline">
            {events.map((event) => <li key={event.id}><span>T{event.tick}</span><strong>{event.type}</strong><p>{event.message}</p></li>)}
          </ol>
        </div>
      )}
    </aside>
  )
}
