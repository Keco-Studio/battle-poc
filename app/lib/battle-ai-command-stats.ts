/**
 * Classifies battle command_received metadata for dual_llm debug HUD.
 * Pipeline = orchestrator path (BT arbitration, macro LLM, or sequence steps).
 * macroOrSeq = subset eligible for seq-share denominator (excludes pure BT-only singles).
 */
export function classifyBattleCommandMetadata(meta: Record<string, unknown>): {
  pipeline: boolean
  macroOrSeq: boolean
  isLlmSeq: boolean
} {
  const decisionSource = typeof meta.decisionSource === 'string' ? meta.decisionSource : ''
  const decisionPath = typeof meta.decisionPath === 'string' ? meta.decisionPath : ''
  const isLlmSeq = decisionPath.includes('llm_seq:')
  const pipeline =
    decisionSource === 'bt' ||
    decisionSource === 'llm_macro' ||
    decisionSource === 'llm' ||
    isLlmSeq
  const macroOrSeq =
    decisionSource === 'llm_macro' || decisionSource === 'llm' || isLlmSeq
  return { pipeline, macroOrSeq, isLlmSeq }
}
