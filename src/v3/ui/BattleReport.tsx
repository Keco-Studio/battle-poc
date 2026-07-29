import { Map, RefreshCw, RotateCcw, Trophy } from 'lucide-react'

import type { V3Encounter, V3Reward } from '@/src/content/generated/v3'
import type { V3BattleMode } from '@/src/v3/runtime/campaign'
import type { V3BattleState } from '@/src/v3/runtime/types'
import type { V3TimelineFilter } from '@/src/v3/runtime/useV3Game'

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
  const filtered = props.battle.events.filter((event) => {
    if (props.timelineFilter === 'all') return true
    if (props.timelineFilter === 'patch') return event.type === 'patch'
    if (props.timelineFilter === 'action') return ['action', 'move', 'guard'].includes(event.type)
    return ['damage', 'heal', 'shield', 'status', 'result'].includes(event.type)
  })
  const firstPatch = props.battle.patchRecords[0]
  const lastPatch = props.battle.patchRecords.at(-1)
  const endReason = props.battle.endReason === 'hp_zero'
    ? '一方生命值归零'
    : props.battle.endReason === 'max_tick'
      ? '达到最大回合数'
      : props.battle.endReason ?? '战斗结束'

  return (
    <aside className="v3-report" aria-label="战斗复盘">
      <header className={victory ? 'is-victory' : 'is-defeat'}>
        <Trophy size={25} />
        <div><span>战斗结果</span><h2>{victory ? '挑战成功' : props.battle.result === 'draw' ? '双方战平' : '挑战失败'}</h2></div>
      </header>

      <div className="v3-report-meta">
        <span>结束原因<strong>{endReason}</strong></span>
        <span>战斗回合<strong>{props.battle.tick}</strong></span>
        <span>耗时<strong>{(props.durationMs / 1000).toFixed(1)}s</strong></span>
      </div>

      <section className="v3-report-stats">
        <h3>战斗统计</h3>
        <p>我方伤害 <strong>{props.battle.actors.left.damageDealt}</strong></p>
        <p>敌方伤害 <strong>{props.battle.actors.right.damageDealt}</strong></p>
        <p>我方治疗 <strong>{props.battle.actors.left.healingDone}</strong></p>
        <p>策略调整 <strong>{props.battle.patchRecords.length}</strong></p>
      </section>

      <details className="v3-advanced-details v3-report-details">
        <summary>高级详情</summary>
        <section className="v3-tree-diff">
          <p>随机种子 {props.battle.initialConfig.seed}</p>
          <p>策略版本 {firstPatch?.baseTreeVersion ?? 1} → {lastPatch?.resultingTreeVersion ?? props.battle.trees.left.version}</p>
          <p>内容版本 {props.battle.initialConfig.versions.content}</p>
          <p>规则版本 {props.battle.initialConfig.versions.rules}</p>
          <p>视觉版本 {props.battle.initialConfig.versions.visual}</p>
          <p>模型版本 {props.battle.initialConfig.versions.model}</p>
          <code>{lastPatch?.reason ?? '本场没有策略调整'}</code>
        </section>
      </details>

      {props.mode === 'standard' && victory && props.reward && (
        <section className="v3-reward-band">
          <strong>{props.reward.name}</strong>
          <span>+{props.reward.exp} EXP · +{props.reward.starlight} 星辉</span>
          <p>{props.reward.description}</p>
        </section>
      )}
      {props.mode === 'sandbox' && <p className="v3-sandbox-note">自由测试不会写入奖励、解锁或正式记录。</p>}

      <label className="v3-filter-line">
        <span>时间线筛选</span>
        <select value={props.timelineFilter} onChange={(event) => props.onTimelineFilterChange(event.target.value as V3TimelineFilter)}>
          <option value="all">全部</option><option value="patch">策略调整</option><option value="action">行动</option><option value="combat">生命变化</option>
        </select>
      </label>
      <ol className="v3-report-timeline">
        {filtered.slice(-12).reverse().map((event) => <li key={event.id}><span>T{event.tick}</span><p>{event.message}</p></li>)}
      </ol>

      <div className="v3-report-actions">
        <button type="button" onClick={props.onReplay}><RotateCcw size={17} /> 确定性重放</button>
        <button type="button" onClick={props.onRematch}><RefreshCw size={17} /> 同配置再战</button>
        <button className="is-primary" type="button" onClick={props.onReturnToMap}><Map size={17} /> 返回地图</button>
      </div>
    </aside>
  )
}
