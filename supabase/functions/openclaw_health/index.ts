import { corsPreflight, json, pickAuthHeader } from '../_shared/http.ts'
import { createSupabaseAuthed } from '../_shared/supabase.ts'
import { decryptText } from '../_shared/crypto.ts'

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 6000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

(globalThis as any).Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight()
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const authHeader = pickAuthHeader(req)
  const supabase = createSupabaseAuthed(authHeader)
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) return json(401, { ok: false, error: 'unauthorized' })

  const { data: rows, error } = await supabase
    .from('openclaw_connections')
    .select('gateway_url,health_path,auth_type,secret_ciphertext,enabled')
    .eq('user_id', userData.user.id)
    .limit(1)
  if (error) return json(500, { ok: false, error: `db_read_failed:${error.message}` })
  const conn = rows?.[0]
  if (!conn || !conn.enabled) return json(404, { ok: false, error: 'not_bound' })

  try {
    const secret = await decryptText(conn.secret_ciphertext)
    const url = `${String(conn.gateway_url).replace(/\/$/, '')}${String(conn.health_path || '/battle/openclaw/health')}`
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (conn.auth_type === 'header_secret') headers['x-openclaw-webhook-secret'] = secret
    else headers.Authorization = `Bearer ${secret}`
    const resp = await fetchWithTimeout(url, { method: 'GET', headers }, 6000)
    const ok = resp.ok
    const text = await resp.text()
    await supabase
      .from('openclaw_connections')
      .update({
        last_health_at: new Date().toISOString(),
        last_health_ok: ok,
        last_error: ok ? null : text.slice(0, 200),
      })
      .eq('user_id', userData.user.id)
    return json(200, { ok })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase
      .from('openclaw_connections')
      .update({
        last_health_at: new Date().toISOString(),
        last_health_ok: false,
        last_error: msg.slice(0, 200),
      })
      .eq('user_id', userData.user.id)
    return json(200, { ok: false, error: msg })
  }
})

