import { readFile } from 'node:fs/promises'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { V3_CONTENT } from '@/src/content/generated/v3'
import { BattleReport } from '@/src/v3/ui/BattleReport'
import { PreparationPanel } from '@/src/v3/ui/PreparationPanel'
import { SpectatorConsole } from '@/src/v3/ui/SpectatorConsole'
import { createBattle, resolveDecisionTick } from '@/src/v3/runtime'

const noop = () => undefined
const encounter = V3_CONTENT.encounters.briar_trial
const player = V3_CONTENT.jobs.astra_vanguard
const enemy = V3_CONTENT.enemies.briar_sentinel

function preparation(mode: 'standard' | 'sandbox') {
  return React.createElement(PreparationPanel, {
    mode,
    encounter,
    player,
    enemy,
    playerSkillIds: player.skillIds,
    enemySkillIds: enemy.skillIds,
    playerTreeId: player.treeId,
    enemyTreeId: enemy.treeId,
    modelProvider: 'minimax' as const,
    skills: V3_CONTENT.skills,
    trees: V3_CONTENT.trees,
    validationErrors: [],
    progressionBonuses: mode === 'standard' ? Object.values(V3_CONTENT.progression) : [],
    statModifiers: mode === 'standard'
      ? { hp: 18, energy: 20, atk: 4, def: 3, spd: 1 }
      : { hp: 0, energy: 0, atk: 0, def: 0, spd: 0 },
    onModeChange: noop,
    onPlayerSkillChange: noop,
    onEnemySkillChange: noop,
    onPlayerTreeChange: noop,
    onEnemyTreeChange: noop,
    onModelProviderChange: noop,
    onStart: noop,
    onCancel: noop,
  })
}

describe('V3 React surfaces', () => {
  it('keeps enemy construction read-only in standard mode', () => {
    const html = renderToStaticMarkup(preparation('standard'))
    expect(html).toContain('data-testid="enemy-loadout"')
    expect(html).toContain('aria-readonly="true"')
    expect(html).not.toContain('编辑敌方构筑')
  })

  it('exposes enemy construction controls only in sandbox mode', () => {
    const html = renderToStaticMarkup(preparation('sandbox'))
    expect(html).toContain('aria-readonly="false"')
    expect(html).toContain('编辑敌方构筑')
  })

  it('explains earned expedition bonuses in standard preparation only', () => {
    const standard = renderToStaticMarkup(preparation('standard'))
    const sandbox = renderToStaticMarkup(preparation('sandbox'))
    expect(standard).toContain('远征加成')
    expect(standard).toContain('生命 +18')
    expect(standard).toContain('能量 +20')
    expect(standard).toContain('攻击 +4')
    expect(standard).toContain('防御 +3')
    expect(standard).toContain('速度 +1')
    expect(standard).toContain('繁花核心强化生命与防御。')
    expect(sandbox).not.toContain('远征加成')
  })

  it('shows both actors, tick state, patch evidence, and viewer controls', () => {
    const battle = createBattle({
      seed: 7319,
      mapId: encounter.battleMapId,
      maxDecisionTicks: 80,
      left: { templateType: 'job', templateId: player.id, skillIds: player.skillIds, treeId: player.treeId },
      right: { templateType: 'enemy', templateId: enemy.id, skillIds: enemy.skillIds, treeId: enemy.treeId },
    })
    const html = renderToStaticMarkup(React.createElement(SpectatorConsole, {
      battle,
      activeEvent: null,
      latestDecisionEvidence: null,
      paused: false,
      speed: 1 as const,
      activeTab: 'decision' as const,
      eventFilter: 'all' as const,
      onPauseToggle: noop,
      onStep: noop,
      onSpeedChange: noop,
      onTabChange: noop,
      onEventFilterChange: noop,
    }))
    expect(html).toContain(player.name)
    expect(html).toContain(enemy.name)
    expect(html).toContain('Tick 0')
    expect(html).toContain('战况')
    expect(html).toContain('AI 思路')
    expect(html).toContain('战斗记录')
    expect(html).toContain('高级详情')
    expect(html).not.toContain('Patch 证据')
    expect(html).toContain('暂停')
    expect(html).toContain('单步')
  })

  it('shows player-facing event labels in the battle log', () => {
    const battle = createBattle({
      seed: 7319,
      mapId: encounter.battleMapId,
      maxDecisionTicks: 80,
      left: { templateType: 'job', templateId: player.id, skillIds: player.skillIds, treeId: player.treeId },
      right: { templateType: 'enemy', templateId: enemy.id, skillIds: enemy.skillIds, treeId: enemy.treeId },
    })
    const html = renderToStaticMarkup(React.createElement(SpectatorConsole, {
      battle: {
        ...battle,
        events: [
          { id: 'patch', tick: 1, sequence: 0, type: 'patch' as const, message: 'accepted:保持距离' },
          { id: 'action', tick: 1, sequence: 1, type: 'action' as const, actorId: 'left' as const, skillId: 'solar_lance', actionKind: 'skill' as const, nodeId: 'control', visitedNodeIds: ['root', 'control'], message: '星辉先锋: skill' },
          { id: 'reject', tick: 1, sequence: 2, type: 'action_rejected' as const, actorId: 'left' as const, rejectCode: 'not_equipped', nodeId: 'control', visitedNodeIds: ['root', 'control'], message: 'not_equipped' },
          { id: 'result', tick: 2, sequence: 0, type: 'result' as const, message: 'left_win:hp_zero' },
        ],
        result: 'left_win' as const,
        endReason: 'hp_zero' as const,
      },
      activeEvent: null,
      latestDecisionEvidence: null,
      paused: false,
      speed: 1 as const,
      activeTab: 'timeline' as const,
      eventFilter: 'all' as const,
      onPauseToggle: noop,
      onStep: noop,
      onSpeedChange: noop,
      onTabChange: noop,
      onEventFilterChange: noop,
    }))
    expect(html).toContain('策略调整')
    expect(html).toContain('策略已调整：保持距离')
    expect(html).toContain('星辉先锋施放日耀枪')
    expect(html).toContain('未装备该技能')
    expect(html).toContain('我方赢得战斗')
    expect(html).not.toMatch(/>patch</)
    expect(html).not.toContain('accepted:')
    expect(html).not.toContain(' skill')
    expect(html).not.toContain('left_win')
    expect(html).not.toContain('hp_zero')
    expect(html).not.toContain('not_equipped')
    expect(html).not.toContain('>control<')
  })

  it('shows each AI current action and selected reasoning in player language', () => {
    let battle = createBattle({
      seed: 7319,
      mapId: encounter.battleMapId,
      maxDecisionTicks: 80,
      left: { templateType: 'job', templateId: player.id, skillIds: player.skillIds, treeId: player.treeId },
      right: { templateType: 'enemy', templateId: enemy.id, skillIds: enemy.skillIds, treeId: enemy.treeId },
    })
    battle = resolveDecisionTick(battle, { left: null, right: null })
    const html = renderToStaticMarkup(React.createElement(SpectatorConsole, {
      battle,
      activeEvent: battle.events.at(-1) ?? null,
      latestDecisionEvidence: null,
      paused: false,
      speed: 1 as const,
      activeTab: 'decision' as const,
      eventFilter: 'all' as const,
      onPauseToggle: noop,
      onStep: noop,
      onSpeedChange: noop,
      onTabChange: noop,
      onEventFilterChange: noop,
    }))
    expect(html).toContain('当前行动')
    expect(html).toContain('判断依据')
    expect(html).not.toContain('>root<')
    expect(html).not.toContain('>control<')
    expect(html).not.toContain('set_threshold')
  })

  it('shows deterministic report metadata, rewards, and replay commands', () => {
    const battle = createBattle({
      seed: 7319,
      mapId: encounter.battleMapId,
      maxDecisionTicks: 80,
      left: { templateType: 'job', templateId: player.id, skillIds: player.skillIds, treeId: player.treeId },
      right: { templateType: 'enemy', templateId: enemy.id, skillIds: enemy.skillIds, treeId: enemy.treeId },
    })
    const html = renderToStaticMarkup(React.createElement(BattleReport, {
      battle: {
        ...battle,
        initialConfig: {
          ...battle.initialConfig,
          versions: {
            content: 'fixture-content',
            rules: 'fixture-rules',
            visual: 'fixture-visual',
            modelProvider: 'deepseek',
            model: 'fixture-model',
          },
        },
        result: 'left_win' as const,
        endReason: 'hp_zero' as const,
      },
      encounter,
      mode: 'standard' as const,
      durationMs: 4200,
      reward: V3_CONTENT.rewards[encounter.rewardId],
      timelineFilter: 'all' as const,
      onTimelineFilterChange: noop,
      onReplay: noop,
      onRematch: noop,
      onReturnToMap: noop,
    }))
    expect(html).toContain('7319')
    expect(html).toContain('fixture-content')
    expect(html).toContain('fixture-rules')
    expect(html).toContain('fixture-visual')
    expect(html).toContain('fixture-model')
    expect(html).toContain('确定性重放')
    expect(html).toContain(V3_CONTENT.rewards[encounter.rewardId].name)
  })

  it('translates the maximum-turn end reason for players', () => {
    const battle = createBattle({
      seed: 7319,
      mapId: encounter.battleMapId,
      maxDecisionTicks: 80,
      left: { templateType: 'job', templateId: player.id, skillIds: player.skillIds, treeId: player.treeId },
      right: { templateType: 'enemy', templateId: enemy.id, skillIds: enemy.skillIds, treeId: enemy.treeId },
    })
    const html = renderToStaticMarkup(React.createElement(BattleReport, {
      battle: { ...battle, result: 'draw' as const, endReason: 'max_tick' as const },
      encounter,
      mode: 'standard' as const,
      durationMs: 4200,
      reward: null,
      timelineFilter: 'all' as const,
      onTimelineFilterChange: noop,
      onReplay: noop,
      onRematch: noop,
      onReturnToMap: noop,
    }))
    expect(html).toContain('达到最大回合数')
  })

  it('makes V3 the default route and preserves the previous app under legacy', async () => {
    const [home, legacy, v3Game] = await Promise.all([
      readFile(path.resolve('app/page.tsx'), 'utf8'),
      readFile(path.resolve('app/legacy/page.tsx'), 'utf8'),
      readFile(path.resolve('src/v3/ui/V3Game.tsx'), 'utf8'),
    ])
    expect(home).toContain("@/src/v3/ui/V3Game")
    expect(legacy).toContain('useGameState')
    expect(legacy).toContain("from 'next/link'")
    expect(legacy).toContain('href="/"')
    expect(legacy).toContain('返回新版 V3')
    expect(v3Game).toContain('当前任务')
    expect(v3Game).toContain('旅程进度')
    expect(v3Game).toContain('可挑战')
    expect(v3Game).toContain('赢下挑战')
    expect(v3Game).toContain('前往')
    expect(v3Game).toContain("game.move({ kind: 'target'")
    expect(v3Game).not.toContain('game.openEncounter(encounter.id)')
  })
})
