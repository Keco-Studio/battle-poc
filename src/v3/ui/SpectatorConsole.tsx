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

const EVENT_LABELS: Record<V3BattleEvent['type'], string> = {
  patch: '策略调整',
  action: '使用技能',
  damage: '伤害',
  heal: '治疗',
  shield: '护盾',
  status: '状态变化',
  move: '移动',
  guard: '防守',
  result: '战斗结果',
}

function playerFacingEventMessage(event: V3BattleEvent): string {
  if (event.type !== 'patch') return event.message
  const [status, ...reasonParts] = event.message.split(':')
  const reason = reasonParts.join(':')
  const label = status === 'accepted'
    ? '策略已调整'
    : status === 'partially_accepted'
      ? '策略已部分调整'
      : status === 'rejected'
        ? '策略未调整'
        : '策略检查完成'
  return reason ? `${label}：${reason}` : label
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
        <span>{props.activeEvent ? playerFacingEventMessage(props.activeEvent) : '等待下一行动'}</span>
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
            {tab === 'status' ? '战况' : tab === 'decision' ? 'AI 思路' : '战斗记录'}
          </button>
        ))}
      </nav>

      {props.activeTab === 'status' && (
        <div className="v3-console-body v3-stat-grid">
          <span>我方伤害<strong>{props.battle.actors.left.damageDealt}</strong></span>
          <span>敌方伤害<strong>{props.battle.actors.right.damageDealt}</strong></span>
          <span>我方技能<strong>{props.battle.actors.left.skillsUsed}</strong></span>
          <span>敌方技能<strong>{props.battle.actors.right.skillsUsed}</strong></span>
          <span>当前回合<strong>{props.battle.tick}</strong></span>
          <span>已执行行动<strong>{props.battle.events.length}</strong></span>
        </div>
      )}

      {props.activeTab === 'decision' && (
        <div className="v3-console-body">
          <h3>本回合为什么这样行动</h3>
          <p className="v3-patch-reason">{latestPatch?.reason ?? props.latestDecisionEvidence?.reason ?? 'AI 正在观察距离、生命值和技能状态。'}</p>
          <details className="v3-advanced-details">
            <summary>高级详情</summary>
            <dl className="v3-evidence">
              <div><dt>决策来源</dt><dd>{props.latestDecisionEvidence?.source ?? '等待'}</dd></div>
              <div><dt>校验状态</dt><dd>{props.latestDecisionEvidence?.status ?? 'none'}</dd></div>
              <div><dt>耗时</dt><dd>{props.latestDecisionEvidence?.latencyMs ?? 0} ms</dd></div>
              <div><dt>策略版本</dt><dd>{latestPatch ? `${latestPatch.baseTreeVersion} → ${latestPatch.resultingTreeVersion}` : '-'}</dd></div>
            </dl>
            <code>{latestPatch?.ops.map((operation) => operation.kind).join(' · ') || '暂无策略调整'}</code>
          </details>
        </div>
      )}

      {props.activeTab === 'timeline' && (
        <div className="v3-console-body">
          <label className="v3-filter-line"><ListFilter size={16} />
            <select value={props.eventFilter} onChange={(event) => props.onEventFilterChange(event.target.value as V3TimelineFilter)}>
              <option value="all">全部记录</option><option value="patch">策略调整</option><option value="action">行动</option><option value="combat">生命变化</option>
            </select>
          </label>
          <ol className="v3-timeline">
            {events.map((event) => <li key={event.id}><span>T{event.tick}</span><strong>{EVENT_LABELS[event.type]}</strong><p>{playerFacingEventMessage(event)}</p></li>)}
          </ol>
        </div>
      )}
    </aside>
  )
}
