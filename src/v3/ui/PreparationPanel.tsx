import { Bot, ChevronLeft, Play, Swords, Wrench } from 'lucide-react'
import Image from 'next/image'

import type {
  V3BehaviorTree,
  V3Encounter,
  V3Enemy,
  V3Job,
  V3Skill,
} from '@/src/content/generated/v3'
import type { V3BattleMode } from '@/src/v3/runtime/campaign'
import type { V3ModelProvider } from '@/src/v3/runtime/useV3Game'

export type PreparationPanelProps = {
  mode: V3BattleMode
  encounter: V3Encounter
  player: V3Job
  enemy: V3Enemy
  playerSkillIds: string[]
  enemySkillIds: string[]
  playerTreeId: string
  enemyTreeId: string
  modelProvider: V3ModelProvider
  skills: Record<string, V3Skill>
  trees: Record<string, V3BehaviorTree>
  validationErrors: string[]
  onModeChange: (mode: V3BattleMode) => void
  onPlayerSkillChange: (index: number, skillId: string) => void
  onEnemySkillChange: (index: number, skillId: string) => void
  onPlayerTreeChange: (treeId: string) => void
  onEnemyTreeChange: (treeId: string) => void
  onModelProviderChange: (provider: V3ModelProvider) => void
  onStart: () => void
  onCancel: () => void
}

function SkillSlots({
  ids,
  skills,
  editable,
  onChange,
}: {
  ids: string[]
  skills: Record<string, V3Skill>
  editable: boolean
  onChange: (index: number, skillId: string) => void
}) {
  return (
    <div className="v3-skill-slots">
      {ids.map((skillId, index) => {
        const skill = skills[skillId]
        return (
          <label className="v3-skill-slot" key={`${index}-${skillId}`}>
            <Image src={`/assets/v3/skills/icons/${skillId}.png`} alt="" width={42} height={42} unoptimized />
            <span>槽位 {index + 1}</span>
            {editable ? (
              <select value={skillId} onChange={(event) => onChange(index, event.target.value)}>
                {Object.values(skills).map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            ) : (
              <strong>{skill?.name ?? skillId}</strong>
            )}
          </label>
        )
      })}
    </div>
  )
}

export function PreparationPanel(props: PreparationPanelProps) {
  const sandbox = props.mode === 'sandbox'
  const playerTrees = Object.values(props.trees).filter((tree) => tree.ownerType === 'player')
  const enemyTrees = Object.values(props.trees).filter((tree) => tree.ownerType === 'enemy')

  return (
    <section className="v3-work-surface v3-prepare" aria-label="战前准备">
      <header className="v3-section-heading">
        <div>
          <span className="v3-kicker">战前准备</span>
          <h2>挑战 {props.encounter.name}</h2>
        </div>
        <button className="v3-icon-button" type="button" onClick={props.onCancel} title="返回探索" aria-label="返回探索">
          <ChevronLeft size={20} />
        </button>
      </header>

      <div className="v3-segmented" aria-label="战斗模式">
        <button type="button" className={props.mode === 'standard' ? 'is-active' : ''} onClick={() => props.onModeChange('standard')}>正式挑战</button>
        <button type="button" className={sandbox ? 'is-active' : ''} onClick={() => props.onModeChange('sandbox')}>自由测试</button>
      </div>

      <div className="v3-prepare-columns">
        <section className="v3-build-column">
          <h3><Swords size={17} /> 我的队伍</h3>
          <p>{props.player.name} · HP {props.player.hp} · SPD {props.player.spd}</p>
          <SkillSlots ids={props.playerSkillIds} skills={props.skills} editable onChange={props.onPlayerSkillChange} />
          <label className="v3-field">
            <span>作战策略</span>
            <select value={props.playerTreeId} onChange={(event) => props.onPlayerTreeChange(event.target.value)}>
              {playerTrees.map((tree) => <option key={tree.id} value={tree.id}>{tree.name} / {tree.preset}</option>)}
            </select>
          </label>
        </section>

        <section className="v3-build-column" role="grid" data-testid="enemy-loadout" aria-label={sandbox ? '编辑敌方构筑' : '敌方构筑'} aria-readonly={sandbox ? 'false' : 'true'}>
          <h3>{sandbox && <Wrench size={17} />} {sandbox ? '调整对手' : '对手情报'}</h3>
          <p>{props.enemy.name} · {props.enemy.title} · HP {props.enemy.hp}</p>
          <SkillSlots ids={props.enemySkillIds} skills={props.skills} editable={sandbox} onChange={props.onEnemySkillChange} />
          <label className="v3-field">
            <span>对手策略</span>
            <select value={props.enemyTreeId} disabled={!sandbox} onChange={(event) => props.onEnemyTreeChange(event.target.value)}>
              {enemyTrees.map((tree) => <option key={tree.id} value={tree.id}>{tree.name} / {tree.preset}</option>)}
            </select>
          </label>
        </section>
      </div>

      <div className="v3-prepare-footer">
        <label className="v3-field v3-model-field">
          <span><Bot size={16} /> AI 引擎</span>
          <select value={props.modelProvider} onChange={(event) => props.onModelProviderChange(event.target.value as V3ModelProvider)}>
            <option value="minimax">MiniMax-M2.1</option>
            <option value="deepseek">DeepSeek Chat</option>
          </select>
        </label>
        <div className="v3-arena-chip">双方将自动判断移动、技能与防守</div>
        <button className="v3-command-button" type="button" onClick={props.onStart}>
          <Play size={18} fill="currentColor" /> 开始 AI 对战
        </button>
      </div>
      {props.validationErrors.length > 0 && (
        <div className="v3-validation" role="alert">{props.validationErrors.join(' ')}</div>
      )}
    </section>
  )
}
