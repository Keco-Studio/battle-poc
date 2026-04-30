import { NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServerSupabase } from '@/src/lib/supabase/server'

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

type ChatRequestBody = {
  target?: 'system' | 'enemy'
  agentId?: string
  context?: ChatContext
  messages?: ChatMessage[]
}

const DEFAULT_DEEPSEEK_BASE = 'http://127.0.0.1:8787'
const execFileAsync = promisify(execFile)
export const runtime = 'nodejs'

async function whichOpenClaw(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('bash', ['-lc', 'command -v openclaw'], {
      timeout: 1500,
      maxBuffer: 128 * 1024,
    })
    return String(stdout || '').trim()
  } catch {
    return ''
  }
}

function looksLikeNodeTooOldError(message: string): boolean {
  const m = String(message || '')
  return m.includes('Node.js v22.12+ is required') || m.includes('current: v20.') || m.includes('Node.js v22')
}

function looksLikeGatewayClosedError(message: string): boolean {
  const m = String(message || '').toLowerCase()
  return (
    m.includes('gateway connect failed') ||
    m.includes('gateway closed') ||
    m.includes('gateway agent failed') ||
    m.includes('websocket') && m.includes('1000')
  )
}

function gatewayHelpText(): string {
  return 'OpenClaw gateway is not reachable. Start it in another terminal: `openclaw gateway --port 18789`'
}

function resolveMode(): 'deepseek' | 'openclaw' | 'supabase_openclaw' {
  const raw =
    process.env.CHAT_BACKEND_MODE ??
    process.env.NEXT_PUBLIC_CHAT_BACKEND_MODE ??
    'deepseek'
  const v = raw.trim().toLowerCase()
  if (v === 'openclaw') return 'openclaw'
  if (v === 'supabase_openclaw') return 'supabase_openclaw'
  return 'deepseek'
}

function deepseekBase() {
  return String(
    process.env.BATTLE_AI_SERVER_URL ??
      process.env.NEXT_PUBLIC_BATTLE_AI_SERVER_URL ??
      DEFAULT_DEEPSEEK_BASE,
  ).replace(/\/$/, '')
}

function defaultOpenClawAgentId() {
  const v = String(process.env.OPENCLAW_AGENT_ID || '').trim()
  return v || 'main'
}

function getOpenClawAgentIdByTarget(agentId: string, target: 'system' | 'enemy') {
  const mapRaw = String(process.env.OPENCLAW_AGENT_ID_MAP_JSON || '').trim()
  if (mapRaw) {
    try {
      const parsed = JSON.parse(mapRaw) as Record<string, string>
      const mapped = String(parsed[agentId] || parsed[target] || '').trim()
      if (mapped) return mapped
    } catch {
      // ignore invalid map json and fallback
    }
  }
  return defaultOpenClawAgentId()
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

  // Most common shapes:
  // - { payloads: [{ text }] }
  // - { result: { payloads: [{ text }] } }
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

function extractJsonFromText(text: string) {
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

function stripAnsi(text: string): string {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '')
}

function removePluginLogLines(text: string): string {
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function proxyToDeepSeek(body: Required<Pick<ChatRequestBody, 'target' | 'agentId' | 'context' | 'messages'>>) {
  const endpoint = `${deepseekBase()}/api/ai/chat`
  const resp = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    20000,
  )
  const payload = (await resp.json()) as { reply?: string; error?: string }
  if (!resp.ok) {
    throw new Error(payload.error || `deepseek_http_${resp.status}`)
  }
  const reply = String(payload.reply || '').trim()
  if (!reply) throw new Error('deepseek_empty_reply')
  return reply
}

async function proxyToOpenClaw(body: Required<Pick<ChatRequestBody, 'target' | 'agentId' | 'context' | 'messages'>>) {
  const lastUserText = extractLastUserText(body.messages)
  const contextText = body.context ? `\n\nRuntime context: ${JSON.stringify(body.context)}` : ''
  const text = `${lastUserText}${contextText}`
  const selectedAgent = getOpenClawAgentIdByTarget(body.agentId, body.target)

  const args = [
    'agent',
    '--json',
    '--agent',
    selectedAgent,
    '--message',
    text,
  ]

  const timeoutMs = Number(process.env.OPENCLAW_AGENT_TIMEOUT_MS || 30000)
  try {
    let stdout = ''
    let stderr = ''
    try {
      const r = await execFileAsync('openclaw', args, {
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
      })
      stdout = String(r.stdout || '')
      stderr = String(r.stderr || '')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!looksLikeNodeTooOldError(msg)) throw error

      // Fallback: force OpenClaw to run under the same Node as this Next.js server process.
      const openclawPath = (await whichOpenClaw()) || 'openclaw'
      const r2 = await execFileAsync(process.execPath, [openclawPath, ...args], {
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
      })
      stdout = String(r2.stdout || '')
      stderr = String(r2.stderr || '')
    }
    const cleanStdout = removePluginLogLines(stripAnsi(stdout))
    const parsed = extractJsonFromText(cleanStdout)
    const reply =
      normalizeOpenClawReply(parsed) ||
      removePluginLogLines(cleanStdout)
    if (reply) return reply
    const errText = String(stderr || '').trim()
    if (errText) {
      if (looksLikeGatewayClosedError(errText)) {
        throw new Error(`openclaw_gateway_unreachable:${gatewayHelpText()}`)
      }
      throw new Error(`openclaw_empty_reply:${errText.slice(0, 200)}`)
    }
    return 'OpenClaw handled your message. (No text reply returned)'
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    throw new Error(`openclaw_cli_error:${message}`)
  }
}

function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

async function getUserAccessToken(): Promise<string> {
  const supabase = await createServerSupabase()
  if (!supabase) throw new Error('supabase_not_configured')
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(`supabase_session_error:${error.message}`)
  const token = String(data?.session?.access_token || '').trim()
  if (!token) throw new Error('supabase_not_signed_in')
  return token
}

async function callSupabaseFunction<T>(fnName: string, accessToken: string, body: unknown, timeoutMs = 15000): Promise<T> {
  const env = getSupabaseEnv()
  if (!env) throw new Error('supabase_not_configured')
  const url = `${env.url.replace(/\/$/, '')}/functions/v1/${fnName}`
  const resp = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body ?? {}),
    },
    timeoutMs,
  )
  const text = await resp.text()
  let payload: any = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: text.slice(0, 240) }
    }
  }
  if (!resp.ok) {
    const msg = String(payload?.error || payload?.message || '').trim()
    throw new Error(msg || `supabase_fn_http_${resp.status}`)
  }
  return payload as T
}

async function proxyToSupabaseOpenClaw(body: Required<Pick<ChatRequestBody, 'target' | 'agentId' | 'context' | 'messages'>>) {
  const accessToken = await getUserAccessToken()
  const payload = await callSupabaseFunction<{ reply?: string; error?: string }>('openclaw_chat', accessToken, body, 20000)
  const reply = String(payload?.reply || '').trim()
  if (!reply) throw new Error(payload?.error || 'openclaw_empty_reply')
  return reply
}

export async function GET() {
  const mode = resolveMode()
  try {
    if (mode === 'deepseek') {
      const resp = await fetchWithTimeout(`${deepseekBase()}/health`, { method: 'GET' }, 2500)
      const payload = resp.ok ? ((await resp.json()) as { ok?: boolean; hasKey?: boolean }) : null
      return NextResponse.json({
        mode,
        ok: Boolean(payload?.ok && payload?.hasKey),
      })
    }
    if (mode === 'supabase_openclaw') {
      try {
        const accessToken = await getUserAccessToken()
        const p = await callSupabaseFunction<{ ok?: boolean; error?: string }>('openclaw_health', accessToken, {}, 7000)
        return NextResponse.json({ mode, ok: Boolean(p?.ok), error: p?.ok ? undefined : p?.error })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ mode, ok: false, error: msg })
      }
    }
    try {
      try {
        await execFileAsync('openclaw', ['health'], { timeout: 5000, maxBuffer: 256 * 1024 })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!looksLikeNodeTooOldError(msg)) throw error
        const openclawPath = (await whichOpenClaw()) || 'openclaw'
        await execFileAsync(process.execPath, [openclawPath, 'health'], { timeout: 5000, maxBuffer: 256 * 1024 })
      }
      return NextResponse.json({
        mode,
        ok: true,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return NextResponse.json({
        mode,
        ok: false,
        error: looksLikeGatewayClosedError(msg) ? gatewayHelpText() : 'openclaw_unhealthy',
      })
    }
  } catch {
    return NextResponse.json({
      mode,
      ok: false,
    })
  }
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json()) as ChatRequestBody
    const target: 'system' | 'enemy' = raw.target === 'enemy' ? 'enemy' : 'system'
    const body = {
      target,
      agentId: String(raw.agentId || ''),
      context: raw.context || {},
      messages: Array.isArray(raw.messages) ? raw.messages.slice(-24) : [],
    }
    if (body.messages.length === 0) {
      return NextResponse.json({ error: 'messages_required' }, { status: 400 })
    }

    const mode = resolveMode()
    const reply = await (async () => {
      if (mode === 'supabase_openclaw') return await proxyToSupabaseOpenClaw(body)
      if (mode === 'openclaw') return await proxyToOpenClaw(body)
      return await proxyToDeepSeek(body)
    })()
    return NextResponse.json({ mode, reply })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    )
  }
}

