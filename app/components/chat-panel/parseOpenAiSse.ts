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
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
}
