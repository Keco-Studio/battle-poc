import { json, readJson, pickAuthHeader, ensureHttpsUrl, blockSuspiciousHost } from '../_shared/http.ts'
import { createSupabaseAuthed } from '../_shared/supabase.ts'
import { encryptText } from '../_shared/crypto.ts'

type BindBody = {
  gatewayUrl?: string
  webhookPath?: string
  healthPath?: string
  authType?: 'bearer' | 'header_secret'
  secret?: string
  agentId?: string
}

function normalizePath(p: string, fallback: string) {
  const raw = String(p || '').trim()
  const v = raw || fallback
  if (!v.startsWith('/')) throw new Error('invalid_path:must_start_with_slash')
  if (v.includes('..')) throw new Error('invalid_path:dotdot')
  return v
}

(globalThis as any).Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  try {
    const authHeader = pickAuthHeader(req)
    const supabase = createSupabaseAuthed(authHeader)
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData?.user) {
      return json(401, { error: 'unauthorized', code: 'unauthorized' })
    }

    const body = (await readJson(req)) as BindBody
    const gatewayUrl = String(body.gatewayUrl || '').trim()
    if (!gatewayUrl) return json(400, { error: 'gatewayUrl_required', code: 'invalid_payload' })

    const u = ensureHttpsUrl(gatewayUrl)
    blockSuspiciousHost(u.hostname)

    const authType = (body.authType === 'header_secret' ? 'header_secret' : 'bearer') as
      | 'bearer'
      | 'header_secret'
    const secret = String(body.secret || '').trim()
    if (!secret) return json(400, { error: 'secret_required', code: 'invalid_payload' })

    const webhookPath = normalizePath(String(body.webhookPath || ''), '/battle/openclaw/chat')
    const healthPath = normalizePath(String(body.healthPath || ''), '/battle/openclaw/health')
    const agentId = String(body.agentId || '').trim() || null
    const secretCipher = await encryptText(secret)

    const { error } = await supabase.from('openclaw_connections').upsert(
      {
        user_id: userData.user.id,
        gateway_url: u.origin,
        webhook_path: webhookPath,
        health_path: healthPath,
        auth_type: authType,
        secret_ciphertext: secretCipher,
        agent_id: agentId,
        enabled: true,
        last_error: null,
      },
      { onConflict: 'user_id' },
    )
    if (error) {
      return json(500, { error: `db_upsert_failed:${error.message}`, code: 'unknown' })
    }

    return json(200, { ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json(400, { error: msg, code: msg.startsWith('invalid_gateway_url') ? 'invalid_payload' : 'unknown' })
  }
})

