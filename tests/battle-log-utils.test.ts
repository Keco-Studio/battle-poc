import { describe, expect, test } from 'vitest'
import { buildActionExecutedBattleLogLine } from '../app/components/map-ui/utils/battleLogUtils'

describe('buildActionExecutedBattleLogLine', () => {
  test('builds minimal action log line without optional metadata', () => {
    const line = buildActionExecutedBattleLogLine({
      action: 'basic_attack',
      actorId: 'poc-player',
      metadata: {},
    })
    expect(line).toContain('Player')
    expect(line).not.toContain('[AI]')
    expect(line).not.toContain('·')
  })
})
