/**
 * OpenClaw gateway HTTP hooks: POST {baseUrl}/hooks/agent
 * @see server/README.md (CHAT_BACKEND_MODE=openclaw_hooks)
 */

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type ChatContext = {
  player?: { level?: number; hp?: number; maxHp?: number }
  enemy?: {
    id?: number
    name?: string
    level?: number
    isAgent?: boolean
    agentId?: string
    stats?: { maxHp?: number; atk?: number; def?: number; spd?: number }
  }
}

export type OpenClawHooksRequestBody = {
  target: 'system' | 'enemy'
  agentId: string
  context: ChatContext
  messages: ChatMessage[]
}

export type OpenClawHooksCallOptions = {
  baseUrl: string
  token: string
  defaultAgentId: string
  timeoutSeconds: number
}

function extractLastUserText(messages: ChatMessage[] | undefined): string {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'user') {
      return String(m.content || '').trim()
    }
  }
  return ''
}

function normalizeOpenClawReply(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const obj = payload as Record<string, unknown>
  const tryExtractPayloadText = (maybePayloads: unknown): string => {
    const payloads = Array.isArray(maybePayloads) ? maybePayloads : []
    for (const p of payloads) {
      if (!p || typeof p !== 'object') continue
      const text = String((p as Record<string, unknown>).text || '').trim()
      if (text) return text
    }
    return ''
  }

  const direct = tryExtractPayloadText(obj.payloads)
  if (direct) return direct
  const nestedResult =
    typeof obj.result === 'object' && obj.result ? (obj.result as Record<string, unknown>) : null
  const nested = nestedResult ? tryExtractPayloadText(nestedResult.payloads) : ''
  if (nested) return nested

  const candidates = [
    obj.reply,
    obj.text,
    obj.message,
    obj.content,
    typeof obj.data === 'object' && obj.data ? (obj.data as Record<string, unknown>).reply : undefined,
    typeof obj.data === 'object' && obj.data ? (obj.data as Record<string, unknown>).text : undefined,
  ]
  for (const c of candidates) {
    const s = String(c || '').trim()
    if (s) return s
  }
  return ''
}

/**
 * Forwards the chat request to the local OpenClaw gateway hooks endpoint and returns assistant text.
 */
export async function callOpenClawHooks(
  body: OpenClawHooksRequestBody,
  options: OpenClawHooksCallOptions,
): Promise<string> {
  const base = String(options.baseUrl || '').replace(/\/$/, '')
  if (!base) {
    throw new Error('openclaw_hooks:missing_base_url')
  }

  const lastUserText = extractLastUserText(body.messages)
  if (!lastUserText) {
    throw new Error('openclaw_hooks:empty_user_message')
  }

  const contextText = body.context && Object.keys(body.context).length > 0
    ? `\n\nRuntime context: ${JSON.stringify(body.context)}`
    : ''
  const message = `${lastUserText}${contextText}`

  const agentId = String(body.agentId || options.defaultAgentId || 'main').trim() || options.defaultAgentId

  const url = `${base}/hooks/agent`
  const timeoutMs = Math.max(1000, Math.floor(options.timeoutSeconds * 1000))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = String(options.token || '').trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        target: body.target,
        agent: agentId,
        agentId,
        message,
        messages: body.messages,
        context: body.context,
      }),
    })

    const rawText = await resp.text()
    let json: unknown = null
    if (rawText) {
      try {
        json = JSON.parse(rawText) as unknown
      } catch {
        json = null
      }
    }

    if (!resp.ok) {
      const err =
        json && typeof json === 'object' && 'error' in (json as object)
          ? String((json as { error?: string }).error || '')
          : rawText.slice(0, 200)
      throw new Error(err || `openclaw_hooks_http_${resp.status}`)
    }

    const reply = normalizeOpenClawReply(json) || String(rawText || '').trim()
    if (!reply) {
      throw new Error('openclaw_hooks_no_sync_reply')
    }
    return reply
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`openclaw_hooks_timeout:${timeoutMs}ms`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
