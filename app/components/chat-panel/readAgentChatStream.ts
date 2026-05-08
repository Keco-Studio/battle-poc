import { extractDeltaFromSseLine, stripThinkingTags } from './parseOpenAiSse'

type ChatApiBody = {
  target: 'system' | 'enemy'
  agentId?: string
  context?: Record<string, unknown>
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * POST /api/agent-chat with stream; invokes onDelta for each token chunk.
 * Falls back to JSON `{ reply }` if server returns non-SSE (e.g. OpenClaw backends).
 */
export async function readAgentChatStream(
  apiPath: string,
  body: ChatApiBody,
  onDelta: (chunk: string) => void,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const r = await fetch(apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
    signal: options?.signal,
  })

  const ct = r.headers.get('content-type') || ''

  if (!r.ok) {
    let msg = `http_${r.status}`
    try {
      const j = (await r.json()) as { error?: string }
      if (j?.error) msg = j.error
    } catch {
      try {
        const t = await r.text()
        if (t.trim()) msg = t.slice(0, 400)
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg)
  }

  if (ct.includes('text/event-stream') && r.body) {
    const full = await consumeOpenAiSse(r.body, onDelta)
    const cleaned = stripThinkingTags(full)
    if (!cleaned.trim()) throw new Error('empty_reply')
    return cleaned
  }

  const data = (await r.json()) as { reply?: string; error?: string }
  if (data.error) throw new Error(data.error)
  const reply = stripThinkingTags(String(data.reply || '').trim())
  if (!reply) throw new Error('empty_reply')
  onDelta(reply)
  return reply
}

async function consumeOpenAiSse(
  body: ReadableStream<Uint8Array>,
  onDelta: (chunk: string) => void,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let acc = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const piece = extractDeltaFromSseLine(line)
      if (piece === '') continue
      if (piece === null) continue
      acc += piece
      onDelta(piece)
    }
  }
  if (buffer.trim()) {
    const piece = extractDeltaFromSseLine(buffer)
    if (piece && piece !== '') {
      acc += piece
      onDelta(piece)
    }
  }
  return acc
}
