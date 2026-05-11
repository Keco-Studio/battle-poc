/** Extract incremental assistant text from one SSE `data:` line (OpenAI-compatible). */
export function extractDeltaFromSseLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return ''
  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
    }
    const delta = json?.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta.length > 0) return delta
    const msg = json?.choices?.[0]?.message?.content
    if (typeof msg === 'string' && msg.length > 0) return msg
    return null
  } catch {
    return null
  }
}

/** Strip MiniMax-style thinking blocks from accumulated assistant text. */
export function stripThinkingTags(text: string): string {
  return stripThinkingStreaming(String(text || '')).trim()
}

/** Prefixes for incomplete opening tags while SSE chunks stream (before final `>`). */
const OPEN_THINKING_PREFIXES = ['<think', '<redacted_thinking'] as const

function earliestOpenThinkingIndex(lower: string): number {
  let best = -1
  for (const p of OPEN_THINKING_PREFIXES) {
    const i = lower.indexOf(p)
    if (i !== -1 && (best === -1 || i < best)) best = i
  }
  return best
}

/**
 * Like {@link stripThinkingTags} but safe while SSE chunks are incomplete:
 * removes closed blocks, drops an unclosed thinking section, strips a trailing
 * partial opening tag split across packets, and removes orphan closing tags.
 */
export function stripThinkingStreaming(text: string): string {
  let s = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<redacted_thinking>[\s\S]*?<\/think>/gi, '')
    .replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, '')

  const lower = s.toLowerCase()
  const openIdx = earliestOpenThinkingIndex(lower)
  if (openIdx !== -1) {
    const tail = s.slice(openIdx)
    const closeRel = tail.search(/<\/(?:redacted_thinking|think)>/i)
    if (closeRel === -1) {
      s = s.slice(0, openIdx)
    }
  }

  s = s.replace(/^<\/(?:redacted_thinking|think)>\s*/gi, '')

  const sl = s.toLowerCase()
  for (const prefix of OPEN_THINKING_PREFIXES) {
    const pl = prefix.toLowerCase()
    for (let n = Math.min(pl.length - 1, sl.length); n >= 1; n--) {
      if (pl.startsWith(sl.slice(-n))) {
        s = s.slice(0, -n)
        return s
      }
    }
  }

  return s
}
