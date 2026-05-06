const CLEAR_QUEUED_SKILL_REASONS = new Set([
  'target_out_of_range',
  'not_enough_mp',
  'skill_on_cooldown',
  'not_enough_stamina',
  'skill_not_equipped',
  'skill_not_found',
  'missing_skill_id',
  'target_not_found',
])

export function shouldClearQueuedSkill(payloadSkillId: string, reason: string): boolean {
  return payloadSkillId.length > 0 || CLEAR_QUEUED_SKILL_REASONS.has(reason)
}

export function shouldApplyDodgeImpact(reason: string): boolean {
  return reason === 'target_dodged'
}
