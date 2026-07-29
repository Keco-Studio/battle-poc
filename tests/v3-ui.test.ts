import { readFile } from 'node:fs/promises'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { V3_CONTENT } from '@/src/content/generated/v3'
import { BattleReport } from '@/src/v3/ui/BattleReport'
import { PreparationPanel } from '@/src/v3/ui/PreparationPanel'
import { SpectatorConsole } from '@/src/v3/ui/SpectatorConsole'
import { createBattle } from '@/src/v3/runtime'

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
    expect(html).toContain('Patch 证据')
    expect(html).toContain('暂停')
    expect(html).toContain('单步')
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
      battle: { ...battle, result: 'left_win' as const, endReason: 'hp_zero' as const },
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
    expect(html).toContain(V3_CONTENT.game.rulesetVersion)
    expect(html).toContain(V3_CONTENT.game.visualVersion)
    expect(html).toContain('确定性重放')
    expect(html).toContain(V3_CONTENT.rewards[encounter.rewardId].name)
  })

  it('makes V3 the default route and preserves the previous app under legacy', async () => {
    const [home, legacy] = await Promise.all([
      readFile(path.resolve('app/page.tsx'), 'utf8'),
      readFile(path.resolve('app/legacy/page.tsx'), 'utf8'),
    ])
    expect(home).toContain("@/src/v3/ui/V3Game")
    expect(legacy).toContain('useGameState')
  })
})
