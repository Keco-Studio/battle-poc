import { describe, expect, test } from 'vitest'
import { shouldApplyDodgeImpact, shouldClearQueuedSkill } from '../app/components/map-ui/utils/commandRejectedUtils'

describe('commandRejectedUtils', () => {
  test('shouldClearQueuedSkill supports both skill id and known reasons', () => {
    expect(shouldClearQueuedSkill('skill-x', 'whatever')).toBe(true)
    expect(shouldClearQueuedSkill('', 'not_enough_mp')).toBe(true)
    expect(shouldClearQueuedSkill('', 'flee_failed')).toBe(false)
  })

  test('shouldApplyDodgeImpact only for target_dodged', () => {
    expect(shouldApplyDodgeImpact('target_dodged')).toBe(true)
    expect(shouldApplyDodgeImpact('target_out_of_range')).toBe(false)
  })
})
