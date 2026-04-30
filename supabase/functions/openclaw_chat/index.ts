import { json, readJson, pickAuthHeader } from '../_shared/http.ts'
import { createSupabaseAuthed } from '../_shared/supabase.ts'
import { decryptText } from '../_shared/crypto.ts'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatRequestBody = {
  target?: 'system' | 'enemy'
  agentId?: string
  context?: unknown
  messages?: ChatMessage[]
}

function extractLastUserText(messages: ChatMessage[] | undefined): string {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'user') return String(m.content || '').trim()
  }
  return ''
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

(globalThis as any).Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  try {
    const authHeader = pickAuthHeader(req)
    const supabase = createSupabaseAuthed(authHeader)
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData?.user) return json(401, { error: 'unauthorized', code: 'unauthorized' })

    const raw = (await readJson(req)) as ChatRequestBody
    const messages = Array.isArray(raw.messages) ? raw.messages.slice(-24) : []
    if (messages.length === 0) return json(400, { error: 'messages_required', code: 'invalid_payload' })

    const { data: rows, error } = await supabase
      .from('openclaw_connections')
      .select('gateway_url,webhook_path,auth_type,secret_ciphertext,agent_id,enabled')
      .eq('user_id', userData.user.id)
      .limit(1)
    if (error) return json(500, { error: `db_read_failed:${error.message}`, code: 'unknown' })
    const conn = rows?.[0]
    if (!conn || !conn.enabled) return json(404, { error: 'not_bound', code: 'not_bound' })

    const secret = await decryptText(conn.secret_ciphertext)
    const agentId = String(raw.agentId || conn.agent_id || '').trim() || undefined
    const target = raw.target === 'enemy' ? 'enemy' : 'system'

    const lastUserText = extractLastUserText(messages)
    const contextText = raw.context ? `\n\nRuntime context: ${JSON.stringify(raw.context)}` : ''
    const text = `${lastUserText}${contextText}`.trim()
    if (!text) return json(400, { error: 'empty_text', code: 'invalid_payload' })

    const url = `${String(conn.gateway_url).replace(/\/$/, '')}${String(conn.webhook_path || '/battle/openclaw/chat')}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (conn.auth_type === 'header_secret') headers['x-openclaw-webhook-secret'] = secret
    else headers.Authorization = `Bearer ${secret}`

    const resp = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentId,
          target,
          text,
          metadata: {
            supabaseUserId: userData.user.id,
          },
        }),
      },
      20000,
    )
    const respText = await resp.text()
    let payload: any = null
    if (respText) {
      try {
        payload = JSON.parse(respText)
      } catch {
        payload = { reply: respText }
      }
    }
    if (!resp.ok) {
      const msg = String(payload?.error || payload?.message || respText || '').trim()
      return json(502, { error: msg || `bridge_http_${resp.status}`, code: 'gateway_unreachable' })
    }
    const reply = String(payload?.reply || '').trim()
    if (!reply) return json(502, { error: 'empty_reply', code: 'unknown' })
    return json(200, { reply })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const code =
      msg === 'invalid_json' ? 'invalid_payload' :
      msg.includes('aborted') ? 'timeout' :
      'unknown'
    return json(502, { error: msg, code })
  }
})

