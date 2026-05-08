'use client'

import { useMemo } from 'react'

type BattleEventLike = {
  type: string
  payload?: Record<string, unknown>
}

type Props = {
  events: BattleEventLike[]
  decisionMode?: 'manual' | 'dual_llm'
  llmRuntime?: 'available' | 'unavailable' | 'unknown' | 'disabled'
  className?: string
}

export default function BattleLlmDebugPanel({ events, decisionMode, llmRuntime, className }: Props) {
  const stats = useMemo(() => {
    const out = {
      totalCommands: 0,
      llmCommands: 0,
      llmSeqCommands: 0,
      fallbackCommands: 0,
      totalRejects: 0,
      dashBlockedRejects: 0,
    }
    for (const ev of events) {
      if (ev.type === 'command_received') {
        out.totalCommands += 1
        const meta =
          ev.payload && typeof ev.payload.metadata === 'object' && ev.payload.metadata !== null
            ? (ev.payload.metadata as Record<string, unknown>)
            : {}
        const decisionSource = typeof meta.decisionSource === 'string' ? meta.decisionSource : ''
        const decisionPath = typeof meta.decisionPath === 'string' ? meta.decisionPath : ''
        const isLlmSeq = decisionPath.includes('llm_seq:')
        const isLlm = decisionSource === 'llm' || isLlmSeq
        if (isLlm) {
          out.llmCommands += 1
          if (isLlmSeq) out.llmSeqCommands += 1
        } else {
          out.fallbackCommands += 1
        }
      } else if (ev.type === 'command_rejected') {
        out.totalRejects += 1
        const reason = typeof ev.payload?.reason === 'string' ? ev.payload.reason : ''
        if (reason === 'dash_blocked') {
          out.dashBlockedRejects += 1
        }
      }
    }
    return out
  }, [events])

  const llmHitRate =
    stats.totalCommands > 0 ? Math.round((stats.llmCommands / stats.totalCommands) * 100) : 0
  const seqShare =
    stats.llmCommands > 0 ? Math.round((stats.llmSeqCommands / stats.llmCommands) * 100) : 0
  const fallbackRate =
    stats.totalCommands > 0 ? Math.round((stats.fallbackCommands / stats.totalCommands) * 100) : 0
  const dashBlockedRate =
    stats.totalRejects > 0 ? Math.round((stats.dashBlockedRejects / stats.totalRejects) * 100) : 0

  return (
    <div
      className={
        className
        || 'grid grid-cols-2 gap-x-2 gap-y-1 rounded border border-cyan-500/35 bg-slate-950/55 px-2 py-1 text-[10px] text-cyan-100'
      }
    >
      <div>Decision Mode: {decisionMode ?? 'unknown'}</div>
      <div>LLM Runtime: {llmRuntime ?? 'unknown'} (local trees only when unavailable)</div>
      <div>LLM hit: {llmHitRate}% ({stats.llmCommands}/{stats.totalCommands})</div>
      <div>LLM seq share: {seqShare}% ({stats.llmSeqCommands}/{stats.llmCommands})</div>
      <div>Fallback: {fallbackRate}% ({stats.fallbackCommands}/{stats.totalCommands})</div>
      <div>dash_blocked: {dashBlockedRate}% ({stats.dashBlockedRejects}/{stats.totalRejects})</div>
    </div>
  )
}

