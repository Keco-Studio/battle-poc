import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

loadEnvFromFile(resolve(process.cwd(), 'server/.env'));
setupProxyDispatcher();

const PORT = Number(process.env.AI_PROXY_PORT || 8787);
const ALLOWED_ORIGIN = process.env.AI_PROXY_ALLOWED_ORIGIN || 'http://localhost:3000';
const DEEPSEEK_API_KEY = String(process.env.DEEPSEEK_API_KEY || '').trim();
const DEEPSEEK_MODEL = String(process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim();
const DEEPSEEK_BASE_URL = String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');

const SYSTEM_PROMPT =
  'You are a battle commander. Output strict JSON only: {"action":"...","targetId":"...","skillId":"...","metadata":{}}.';

const CHAT_SYSTEM_BOLT = `You are Engineer Bolt, a friendly Lv.14 engineer robot in a fantasy battle-arena world. You have a "Tool Claw" for gear tweaks and battle tips. Keep replies concise (1–4 short sentences) unless the user asks for detail. You can give encouragement and practical combat hints. Stay in character; no JSON; plain chat only.`;

const CHAT_SYSTEM_ENEMY = `You are a monster or rival the player is chatting with on the field. Reply in short, in-character lines (1–3 sentences). You may be sassy or menacing. Plain text only, no JSON.`;
const CHAT_SYSTEM_DEEPCLAW = `You are DeepClaw Agent, the signature AI creature of battle-poc powered by DeepSeek. Stay in character as a roaming elite monster and tactical operator.

Behavior:
- Keep replies concise and practical (1–4 short sentences).
- You can chat, give battle strategy, and accept action requests.
- If user asks for automation/task style commands (battle repeats, flee policy, farm), acknowledge clearly in natural language.
- Tone: confident, slightly playful, competent.
- Plain text only, no JSON, no markdown tables.`;
const CHAT_GROUNDED_RULES = `Grounding rules:
- You MUST prioritize provided runtime context (player/enemy level and stats) over roleplay.
- Do NOT fabricate numeric stats (HP/ATK/DEF/SPD/level) when context is missing.
- If a requested stat is unavailable, explicitly say you don't have that exact value now.
- Keep roleplay flavor, but factual values must remain grounded in context.`;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function sendJson(res, status, payload) {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeUrlPath(url = '/') {
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(0, idx) : url;
}

function assertApiKey() {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('missing_deepseek_api_key: please set DEEPSEEK_API_KEY in server/.env');
  }
}

function deepseekEndpoint() {
  return DEEPSEEK_BASE_URL.endsWith('/v1')
    ? `${DEEPSEEK_BASE_URL}/chat/completions`
    : `${DEEPSEEK_BASE_URL}/v1/chat/completions`;
}

/**
 * @param {{ model?: string, temperature?: number, timeoutMs?: number, messages: Array<{ role: string, content: string }> }} input
 */
async function postDeepSeekChatCompletions(input) {
  assertApiKey();
  const endpoint = deepseekEndpoint();
  const timeoutMs = Math.max(800, Math.min(30000, Number(input.timeoutMs ?? 15000)));
  const maxAttempts = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: input.model || DEEPSEEK_MODEL,
          temperature: Number.isFinite(input.temperature) ? input.temperature : 0.7,
          messages: input.messages
        }),
        signal: controller.signal
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`deepseek_http_${resp.status}:${text.slice(0, 160)}`);
      }
      const payload = JSON.parse(text);
      const content = String(payload?.choices?.[0]?.message?.content || '').trim();
      if (!content) {
        throw new Error('deepseek_empty_content');
      }
      return content;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(180);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('deepseek_request_failed');
}

async function requestDeepSeek(input) {
  const content = await postDeepSeekChatCompletions({
    model: input.model,
    temperature: 0.2,
    timeoutMs: Math.max(800, Math.min(20000, Number(input.timeoutMs || 8000))),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: String(input.prompt || '') }
    ]
  });
  const decision = parseJsonObject(content);
  if (!decision) {
    throw new Error('deepseek_parse_error');
  }
  return decision;
}

function parseJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {unknown} raw
 * @returns {Array<{ role: 'user' | 'assistant', content: string }>}
 */
function sanitizeChatMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-24)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    const content = String('content' in m ? m.content : '').trim().slice(0, 8000);
    if (!role || !content) continue;
    out.push({ role, content });
  }
  return out;
}

function sanitizeChatContext(raw) {
  if (!raw || typeof raw !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(raw));
  } catch {
    return null;
  }
}

function extractLastUserMessage(history) {
  if (!Array.isArray(history)) return '';
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item?.role === 'user') return String(item.content || '').trim();
  }
  return '';
}

function isStatQuestion(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  return /(hp|health|atk|attack|def|defense|spd|speed|stat|stats|level|lvl|血|生命|攻击|防御|速度|属性|等级)/i.test(t);
}

function hasEnemyStats(context) {
  const s = context?.enemy?.stats;
  return Number.isFinite(s?.maxHp) && Number.isFinite(s?.atk) && Number.isFinite(s?.def) && Number.isFinite(s?.spd);
}

function buildEnemyStatsReply(context) {
  const enemy = context?.enemy || {};
  const stats = enemy.stats || {};
  const name = enemy.name || 'This enemy';
  const level = Number.isFinite(enemy.level) ? enemy.level : null;
  const hp = Number.isFinite(stats.maxHp) ? Math.round(stats.maxHp) : null;
  const atk = Number.isFinite(stats.atk) ? Math.round(stats.atk) : null;
  const def = Number.isFinite(stats.def) ? Math.round(stats.def) : null;
  const spd = Number.isFinite(stats.spd) ? Math.round(stats.spd) : null;
  const levelText = level == null ? 'Unknown' : String(level);
  const hpText = hp == null ? 'Unknown' : String(hp);
  const atkText = atk == null ? 'Unknown' : String(atk);
  const defText = def == null ? 'Unknown' : String(def);
  const spdText = spd == null ? 'Unknown' : String(spd);
  return `${name} stats (ground truth): Lv.${levelText}, HP ${hpText}, ATK ${atkText}, DEF ${defText}, SPD ${spdText}.`;
}

const server = createServer(async (req, res) => {
  const path = normalizeUrlPath(req.url || '/');
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && path === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'battle-poc-ai-proxy',
      provider: 'deepseek',
      hasKey: Boolean(DEEPSEEK_API_KEY),
      model: DEEPSEEK_MODEL
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/ai/battle-decision') {
    try {
      const body = await readBody(req);
      const decision = await requestDeepSeek(body);
      sendJson(res, 200, { decision });
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.message}${error.cause ? ` | cause: ${String(error.cause)}` : ''}`
          : String(error);
      sendJson(res, 502, {
        error: message
      });
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/ai/chat') {
    try {
      const body = await readBody(req);
      const target = body?.target === 'enemy' ? 'enemy' : 'system';
      const agentId = String(body?.agentId || '').trim().toLowerCase();
      const system =
        target === 'enemy'
          ? agentId === 'deepclaw'
            ? CHAT_SYSTEM_DEEPCLAW
            : CHAT_SYSTEM_ENEMY
          : CHAT_SYSTEM_BOLT;
      const history = sanitizeChatMessages(body?.messages);
      const context = sanitizeChatContext(body?.context);
      if (history.length === 0) {
        sendJson(res, 400, { error: 'messages_required' });
        return;
      }
      const lastUser = extractLastUserMessage(history);
      if (target === 'enemy' && isStatQuestion(lastUser)) {
        if (hasEnemyStats(context)) {
          sendJson(res, 200, { reply: buildEnemyStatsReply(context) });
          return;
        }
        sendJson(res, 200, { reply: 'I do not have exact enemy stats in context right now.' });
        return;
      }
      const contextPrompt = context
        ? `Runtime context (source of truth): ${JSON.stringify(context)}`
        : 'Runtime context (source of truth): unavailable';
      const text = await postDeepSeekChatCompletions({
        temperature: 0.75,
        timeoutMs: 20000,
        messages: [
          { role: 'system', content: system },
          { role: 'system', content: CHAT_GROUNDED_RULES },
          { role: 'system', content: contextPrompt },
          ...history
        ]
      });
      sendJson(res, 200, { reply: text });
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.message}${error.cause ? ` | cause: ${String(error.cause)}` : ''}`
          : String(error);
      sendJson(res, 502, { error: message });
    }
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`[ai-proxy] running on http://localhost:${PORT}`);
  if (!DEEPSEEK_API_KEY) {
    console.warn('[ai-proxy] missing DEEPSEEK_API_KEY, set server/.env before using AI.');
  }
});

function loadEnvFromFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function setupProxyDispatcher() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!proxyUrl) return;
  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[ai-proxy] using upstream proxy: ${proxyUrl}`);
  } catch (error) {
    console.warn('[ai-proxy] failed to configure upstream proxy:', error);
  }
}
