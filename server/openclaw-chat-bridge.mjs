import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PORT = Number(process.env.PORT || process.env.BRIDGE_PORT || 32123)
const TOKEN = String(process.env.TOKEN_SECRET || process.env.BRIDGE_TOKEN || '').trim()
const DEFAULT_AGENT = String(process.env.OPENCLAW_AGENT_ID || 'main').trim() || 'main'
const TIMEOUT_MS = Number(process.env.OPENCLAW_AGENT_TIMEOUT_MS || 30000)

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

function normalizePath(url = '/') {
  const idx = url.indexOf('?')
  return idx >= 0 ? url.slice(0, idx) : url
}

function isAuthorized(req) {
  if (!TOKEN) return true // dev-friendly default
  const h = String(req.headers.authorization || '')
  return h === `Bearer ${TOKEN}` || h === `bearer ${TOKEN}`
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '')
}

function removePluginLogLines(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
  const kept = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (/^\d{1,2}:\d{2}:\d{2}\s+\[plugins\]/.test(trimmed)) return false
    if (/^\[plugins\]/.test(trimmed)) return false
    return true
  })
  return kept.join('\n').trim()
}

function extractJsonFromText(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(raw.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function normalizeOpenClawReply(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const obj = payload
  const tryExtractPayloadText = (maybePayloads) => {
    const payloads = Array.isArray(maybePayloads) ? maybePayloads : []
    for (const p of payloads) {
      if (!p || typeof p !== 'object') continue
      const text = String(p.text || '').trim()
      if (text) return text
    }
    return ''
  }
  const direct = tryExtractPayloadText(obj.payloads)
  if (direct) return direct
  const nested = obj.result && typeof obj.result === 'object' ? tryExtractPayloadText(obj.result.payloads) : ''
  if (nested) return nested
  for (const c of [obj.reply, obj.text, obj.message, obj.content]) {
    const s = String(c || '').trim()
    if (s) return s
  }
  return ''
}

function extractLastUserText(messages) {
  const list = Array.isArray(messages) ? messages : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i]
    if (m?.role === 'user') return String(m.content || '').trim()
  }
  return ''
}

function resolveChatText(body) {
  const direct = String(body?.text || '').trim()
  if (direct) return direct
  const lastUserText = extractLastUserText(body?.messages)
  const contextText = body?.context ? `\n\nRuntime context: ${JSON.stringify(body.context)}` : ''
  return `${lastUserText}${contextText}`.trim()
}

async function runOpenClawAgent(agentId, text) {
  const args = ['agent', '--json', '--agent', agentId, '--message', text]
  const r = await execFileAsync('openclaw', args, {
    timeout: TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
  })
  const clean = removePluginLogLines(stripAnsi(String(r.stdout || '')))
  const parsed = extractJsonFromText(clean)
  const reply = normalizeOpenClawReply(parsed) || removePluginLogLines(clean)
  return reply || ''
}

const server = createServer(async (req, res) => {
  const path = normalizePath(req.url || '/')
  if (req.method === 'GET' && (path === '/health' || path === '/battle/openclaw/health')) {
    if (!isAuthorized(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' })
    return sendJson(res, 200, { ok: true, hasKey: true, mode: 'openclaw_service' })
  }

  if (req.method === 'POST' && (path === '/api/ai/chat' || path === '/battle/openclaw/chat')) {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'unauthorized', code: 'unauthorized' })
    try {
      const body = await readBody(req)
      const text = resolveChatText(body)
      if (!text) return sendJson(res, 400, { error: 'text_required', code: 'invalid_payload' })
      const agentId = String(body?.agentId || DEFAULT_AGENT).trim() || DEFAULT_AGENT
      const reply = await runOpenClawAgent(agentId, text)
      if (!reply) return sendJson(res, 502, { error: 'empty_reply', code: 'unknown' })
      return sendJson(res, 200, { reply })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return sendJson(res, 502, { error: msg, code: msg.includes('timed out') ? 'timeout' : 'unknown' })
    }
  }

  return sendJson(res, 404, { error: 'not_found' })
})

server.listen(PORT, () => {
  console.log(`[openclaw-service] listening on http://0.0.0.0:${PORT}`)
  console.log(`[openclaw-service] health: GET /health`)
  console.log(`[openclaw-service] chat:   POST /api/ai/chat`)
  console.log(`[openclaw-service] compat: GET /battle/openclaw/health, POST /battle/openclaw/chat`)
  if (!TOKEN) console.warn('[openclaw-service] TOKEN_SECRET is empty; auth is disabled (dev only).')
})

