import { actionLabel, reasonLabel, strategyLabel } from '../battleText'

export function buildActionExecutedBattleLogLine(input: {
  action: string
  actorId: string
  metadata: Record<string, unknown>
}): string {
  const { action, actorId, metadata } = input
  const actStr = actionLabel(action)
  const strategy = strategyLabel(metadata.strategy)
  const reason = reasonLabel(metadata.reason)
  const isAiDecision = metadata.decisionSource === 'llm'
  const actorName = actorId === 'poc-player' ? 'Player' : 'Enemy'
  const head = `${actorName}${actStr}`
  const parts = [head]
  if (isAiDecision) parts.push('[AI]')
  if (strategy) parts.push(`[${strategy}]`)
  if (reason && reason !== head) parts.push(`· ${reason}`)
  return parts.join(' ')
}
