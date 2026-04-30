export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body ?? {}), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export async function readJson(req: Request): Promise<any> {
  const text = await req.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('invalid_json')
  }
}

export function pickAuthHeader(req: Request): string {
  const v = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  return v
}

export function ensureHttpsUrl(url: string): URL {
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new Error('invalid_gateway_url:only_https_allowed')
  if (u.username || u.password) throw new Error('invalid_gateway_url:no_userinfo')
  if (u.pathname !== '/' || u.search || u.hash) throw new Error('invalid_gateway_url:no_path_query_hash')
  return u
}

// Best-effort SSRF hardening (no DNS resolution in Edge).
export function blockSuspiciousHost(hostname: string) {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) throw new Error('invalid_gateway_url:localhost_blocked')
  if (h.endsWith('.local')) throw new Error('invalid_gateway_url:local_tld_blocked')
  // Block obvious IPv4 literals (including private ranges). Users should use a real DNS name over https.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) throw new Error('invalid_gateway_url:ip_literal_blocked')
}

