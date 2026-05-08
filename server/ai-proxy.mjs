import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

loadEnvFromFile(resolve(process.cwd(), 'server/.env'));
setupProxyDispatcher();

const PORT = Number(process.env.AI_PROXY_PORT || 8787);
const ALLOWED_ORIGIN = process.env.AI_PROXY_ALLOWED_ORIGIN || 'http://localhost:3000';
/** Default upstream for chat + battle when request body does not specify `provider`. */
const AI_LLM_PROVIDER = String(process.env.AI_LLM_PROVIDER || 'deepseek').trim().toLowerCase();
const DEEPSEEK_API_KEY = String(process.env.DEEPSEEK_API_KEY || '').trim();
const DEEPSEEK_MODEL = String(process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim();
const DEEPSEEK_BASE_URL = String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const MINIMAX_API_KEY = String(process.env.MINIMAX_API_KEY || '').trim();
const MINIMAX_MODEL = String(process.env.MINIMAX_MODEL || 'MiniMax-M2.1').trim();
const MINIMAX_BASE_URL = String(process.env.MINIMAX_BASE_URL || 'https://api.minimax.io').replace(/\/$/, '');

const SYSTEM_PROMPT =
  'You are a battle commander. Output strict JSON only: {"action":"...","targetId":"...","skillId":"...","metadata":{}}.';

const CHAT_SYSTEM_BOLT = `You are Engineer Bolt, a friendly Lv.14 engineer robot in a fantasy battle-arena world. You have a "Tool Claw" for gear tweaks and battle tips. Keep replies concise (1–4 short sentences) unless the user asks for detail. You can give encouragement and practical combat hints. Stay in character; no JSON; plain chat only.`;

const CHAT_SYSTEM_ENEMY = `You are a monster or rival the player is chatting with on the field. Reply in short, in-character lines (1–3 sentences). You may be sassy or menacing. Plain text only, no JSON.`;
const CHAT_SYSTEM_DEEPCLAW = '';
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

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} payload
 * @param {{ responseTimeMs?: number }} [options] — 设置后写入 `timing.totalMs` 与响应头 `X-Response-Time-Ms`
 */
function sendJson(res, status, payload, options) {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const ms = options?.responseTimeMs;
  const body = typeof ms === 'number' ? { ...payload, timing: { totalMs: ms } } : payload;
  if (typeof ms === 'number') {
    res.setHeader('X-Response-Time-Ms', String(ms));
  }
  res.end(JSON.stringify(body));
}

/** Map upstream-style errors to a clearer HTTP status (default 502). */
function inferProxyErrorStatus(message) {
  const m = String(message || '');
  if (/^invalid_request_json:/i.test(m)) return 400;
  if (/_http_401\b|"http_code":"401"|invalid api key|authorized_error/i.test(m)) return 401;
  if (/_http_402\b|"http_code":"402"|insufficient balance|余额|minimax_api_1008/i.test(m)) return 402;
  if (/_http_403\b|"http_code":"403"/i.test(m)) return 403;
  if (/_http_429\b|"http_code":"429"|rate limit|minimax_api_1002/i.test(m)) return 429;
  if (/missing_(minimax|deepseek)_api_key/i.test(m)) return 503;
  if (/abort|AbortError|The operation was aborted|ECONNABORTED|ETIMEDOUT/i.test(m)) return 504;
  if (/llm_parse_error|not_plain_object|empty_content|upstream_not_json|proxy_parse_error|proxy_response_not_json/i.test(m))
    return 422;
  return 502;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`invalid_request_json:${detail}`);
  }
}

function normalizeUrlPath(url = '/') {
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(0, idx) : url;
}

/**
 * @param {'deepseek' | 'minimax'} provider
 */
function getProviderConfig(provider) {
  if (provider === 'minimax') {
    return {
      label: 'minimax',
      apiKey: MINIMAX_API_KEY,
      defaultModel: MINIMAX_MODEL,
      baseUrl: MINIMAX_BASE_URL
    };
  }
  return {
    label: 'deepseek',
    apiKey: DEEPSEEK_API_KEY,
    defaultModel: DEEPSEEK_MODEL,
    baseUrl: DEEPSEEK_BASE_URL
  };
}

function chatCompletionsEndpoint(baseUrl) {
  return baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
}

function resolveBattleProvider(body) {
  const b = String(body?.provider || '').trim().toLowerCase();
  if (b === 'minimax') return 'minimax';
  if (b === 'deepseek' || b === 'zhipu') return 'deepseek';
  return AI_LLM_PROVIDER === 'minimax' ? 'minimax' : 'deepseek';
}

function resolveChatProvider() {
  return AI_LLM_PROVIDER === 'minimax' ? 'minimax' : 'deepseek';
}

/**
 * MiniMax OpenAPI (`text-chat-openai`): `temperature` must lie in (0, 1] — not 0, not above 1.
 * Sending 0 triggers parameter errors (often surfaced as 2013).
 */
function clampMinimaxTemperature(raw) {
  const t = Number(raw);
  const base = Number.isFinite(t) ? t : 0.7;
  if (base <= 0) return 0.01;
  if (base > 1) return 1;
  return base;
}

/**
 * MiniMax: multiple messages with the same `role` should carry distinct `name` fields; repeated
 * roles without `name` may return 2013. We also drop orphan leading `assistant` turns (broken local
 * history) and merge adjacent same-role turns into one block.
 * @param {Array<{ role: string, content: string }>} messages
 */
function normalizeMinimaxMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const systems = [];
  const rest = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const role = String(m.role || '');
    const content = String(m.content ?? '').trim();
    if (!content) continue;
    if (role === 'system') systems.push(content);
    else if (role === 'assistant' || role === 'user') rest.push({ role, content });
  }
  while (rest.length > 0 && rest[0].role === 'assistant') {
    rest.shift();
  }
  const merged = [];
  for (const m of rest) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      merged.push({ role: m.role, content: m.content });
    }
  }
  const head =
    systems.length > 0
      ? [{ role: 'system', content: systems.map((s) => String(s).trim()).filter(Boolean).join('\n\n') }]
      : [];
  return [...head, ...merged];
}

function summarizeUpstreamHttpError(label, status, text) {
  const raw = String(text || '');
  let detail = raw.slice(0, 320);
  try {
    const ep = JSON.parse(raw);
    const inner =
      ep?.error?.message ??
      ep?.message ??
      ((typeof ep?.base_resp?.status_msg === 'string' ? ep.base_resp.status_msg : '') ||
        (typeof ep?.error === 'string' ? ep.error : ''));
    if (inner) detail = String(inner).slice(0, 400);
  } catch {
    /* keep slice */
  }
  return `${label}_http_${status}:${detail}`;
}

/**
 * OpenAI-compatible chat completions (DeepSeek + MiniMax).
 * @param {'deepseek' | 'minimax'} provider
 * @param {{ model?: string, temperature?: number, timeoutMs?: number, maxAttempts?: number, maxCompletionTokens?: number, messages: Array<{ role: string, content: string }> }} input
 */
async function postChatCompletions(provider, input) {
  const cfg = getProviderConfig(provider);
  if (!cfg.apiKey) {
    throw new Error(
      provider === 'minimax'
        ? 'missing_minimax_api_key: set MINIMAX_API_KEY in server/.env'
        : 'missing_deepseek_api_key: set DEEPSEEK_API_KEY in server/.env'
    );
  }
  const endpoint = chatCompletionsEndpoint(cfg.baseUrl);
  const timeoutMs = Math.max(800, Math.min(120000, Number(input.timeoutMs ?? 15000)));
  const maxAttempts = Math.max(1, Math.min(3, Number(input.maxAttempts ?? 2)));
  let lastError = null;

  const rawTemp = Number.isFinite(input.temperature) ? Number(input.temperature) : 0.7;
  const temperature = provider === 'minimax' ? clampMinimaxTemperature(rawTemp) : rawTemp;
  const messagesForUpstream =
    provider === 'minimax' ? normalizeMinimaxMessages(input.messages) : input.messages;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      /** @type {Record<string, unknown>} */
      const reqBody = {
        model: input.model || cfg.defaultModel,
        temperature,
        messages: messagesForUpstream
      };
      if (provider === 'minimax') {
        const mc = Number(input.maxCompletionTokens);
        const cap = Number.isFinite(mc) && mc > 0 ? Math.min(2048, Math.floor(mc)) : 2048;
        reqBody.max_completion_tokens = Math.max(1, cap);
      }
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify(reqBody),
        signal: controller.signal
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(summarizeUpstreamHttpError(cfg.label, resp.status, text));
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`${cfg.label}_upstream_not_json:${text.slice(0, 120)}`);
      }
      if (provider === 'minimax' && payload?.base_resp && typeof payload.base_resp === 'object') {
        const code = Number(payload.base_resp.status_code);
        if (Number.isFinite(code) && code !== 0) {
          const msg = String(payload.base_resp.status_msg || '').trim() || `code_${code}`;
          throw new Error(`minimax_api_${code}:${msg}`);
        }
      }
      let content = String(payload?.choices?.[0]?.message?.content || '').trim();
      // api.minimax.io 常见 <think>…</think>；api.minimaxi.com（Token Plan / sk-cp-）多为 <think>…</think>。
      content = content
        .replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
      if (!content) {
        throw new Error(`${cfg.label}_empty_content`);
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
  throw lastError || new Error(`${getProviderConfig(provider).label}_request_failed`);
}

/**
 * OpenAI-compatible SSE stream (DeepSeek + MiniMax chat completions).
 * @param {'deepseek' | 'minimax'} provider
 * @param {Array<{ role: string, content: string }>} messagesOpenAi
 * @param {import('node:http').ServerResponse} res
 */
async function pipeChatCompletionStream(provider, messagesOpenAi, res) {
  const cfg = getProviderConfig(provider);
  if (!cfg.apiKey) {
    throw new Error(
      provider === 'minimax'
        ? 'missing_minimax_api_key: set MINIMAX_API_KEY in server/.env'
        : 'missing_deepseek_api_key: set DEEPSEEK_API_KEY in server/.env'
    );
  }
  const endpoint = chatCompletionsEndpoint(cfg.baseUrl);
  const messagesForUpstream =
    provider === 'minimax' ? normalizeMinimaxMessages(messagesOpenAi) : messagesOpenAi;
  const rawTemp = 0.75;
  const temperature = provider === 'minimax' ? clampMinimaxTemperature(rawTemp) : rawTemp;
  /** @type {Record<string, unknown>} */
  const reqBody = {
    model: cfg.defaultModel,
    temperature,
    messages: messagesForUpstream,
    stream: true
  };
  if (provider === 'minimax') {
    reqBody.max_completion_tokens = 1536;
  }
  const controller = new AbortController();
  const timeoutMs = 120000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(reqBody),
      signal: controller.signal
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      throw new Error(summarizeUpstreamHttpError(cfg.label, upstream.status, text));
    }
    setCorsHeaders(res);
    res.statusCode = 200;
    const ct = upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (!upstream.body) {
      throw new Error(`${cfg.label}_empty_stream_body`);
    }
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength) res.write(Buffer.from(value));
      }
    } finally {
      res.end();
    }
  } finally {
    clearTimeout(timer);
  }
}

async function requestBattleDecision(body) {
  const provider = resolveBattleProvider(body);
  const systemPrompt =
    typeof body?.systemPrompt === 'string' && body.systemPrompt.trim().length > 0
      ? body.systemPrompt.trim()
      : SYSTEM_PROMPT;
  // 大地图 + 长 system prompt 时 MiniMax 常 >12s；原先 min(20s)×2 次重试 ≈24s 仍失败。单轮拉长、战斗只重试 1 次上游。
  const upstreamMs = Math.max(2000, Math.min(120000, Number(body?.timeoutMs || 55000)));
  const content = await postChatCompletions(provider, {
    model: body?.model,
    temperature: 0.2,
    timeoutMs: upstreamMs,
    maxAttempts: 1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(body?.prompt || '') }
    ]
  });
  const decision = parseJsonObject(sanitizeModelJsonText(content));
  if (!decision) {
    throw new Error('llm_parse_error:no_json_object');
  }
  if (typeof decision !== 'object' || Array.isArray(decision)) {
    throw new Error('llm_parse_error:not_plain_object');
  }
  return decision;
}

/** Strip ```json fences and preamble so parseJsonObject sees `{`. */
function sanitizeModelJsonText(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const m = s.match(fence);
  if (m) s = m[1].trim();
  else {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }
  const brace = s.indexOf('{');
  if (brace > 0) s = s.slice(brace);
  return s.trim();
}

function parseJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    const direct = JSON.parse(trimmed);
    if (direct !== null && typeof direct === 'object' && !Array.isArray(direct)) return direct;
    return null;
  } catch {
    /* fall through */
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const sliced = trimmed.slice(start, end + 1);
      const obj = JSON.parse(sliced);
      if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) return obj;
    } catch {
      /* fall through */
    }
  }
  return parseFirstBalancedJsonObject(trimmed);
}

/**
 * When model nests prose or multiple `{`, first/last `}` slice fails — scan balanced braces (strings may break edge cases).
 */
function parseFirstBalancedJsonObject(s) {
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < s.length; j += 1) {
      const c = s[j];
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = s.slice(i, j + 1);
          try {
            const obj = JSON.parse(slice);
            if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) return obj;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
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
    const active = resolveChatProvider();
    const hasKey =
      active === 'minimax' ? Boolean(MINIMAX_API_KEY) : Boolean(DEEPSEEK_API_KEY);
    const model = active === 'minimax' ? MINIMAX_MODEL : DEEPSEEK_MODEL;
    sendJson(res, 200, {
      ok: true,
      service: 'battle-poc-ai-proxy',
      provider: active,
      defaultProvider: AI_LLM_PROVIDER,
      hasKey,
      model
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/ai/battle-decision') {
    const t0 = Date.now();
    try {
      const body = await readBody(req);
      const decision = await requestBattleDecision(body);
      const totalMs = Date.now() - t0;
      console.log(`[ai-proxy] battle-decision ok ${totalMs}ms`);
      sendJson(res, 200, { decision }, { responseTimeMs: totalMs });
    } catch (error) {
      const totalMs = Date.now() - t0;
      const message =
        error instanceof Error
          ? `${error.message}${error.cause ? ` | cause: ${String(error.cause)}` : ''}`
          : String(error);
      const status = inferProxyErrorStatus(message);
      if (status === 401) {
        console.warn('[ai-proxy] battle-decision auth/upstream key error:', message.slice(0, 220));
      } else if (status === 422) {
        console.warn('[ai-proxy] battle-decision parse/contract:', message.slice(0, 400));
      } else {
        console.warn(`[ai-proxy] battle-decision error ${status} ${totalMs}ms:`, message.slice(0, 400));
      }
      sendJson(
        res,
        status,
        {
          error: message
        },
        { responseTimeMs: totalMs }
      );
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/ai/chat') {
    const t0 = Date.now();
    try {
      const body = await readBody(req);
      const target = body?.target === 'enemy' ? 'enemy' : 'system';
      const agentId = String(body?.agentId || '').trim().toLowerCase();
      const system =
        target === 'enemy'
          ? CHAT_SYSTEM_ENEMY
          : CHAT_SYSTEM_BOLT;
      const history = sanitizeChatMessages(body?.messages);
      const context = sanitizeChatContext(body?.context);
      if (history.length === 0) {
        sendJson(res, 400, { error: 'messages_required' }, { responseTimeMs: Date.now() - t0 });
        return;
      }
      const lastUser = extractLastUserMessage(history);
      if (target === 'enemy' && isStatQuestion(lastUser)) {
        if (hasEnemyStats(context)) {
          sendJson(
            res,
            200,
            { reply: buildEnemyStatsReply(context) },
            { responseTimeMs: Date.now() - t0 }
          );
          return;
        }
        sendJson(
          res,
          200,
          { reply: 'I do not have exact enemy stats in context right now.' },
          { responseTimeMs: Date.now() - t0 }
        );
        return;
      }
      const contextPrompt = context
        ? `Runtime context (source of truth): ${JSON.stringify(context)}`
        : 'Runtime context (source of truth): unavailable';
      // MiniMax OpenAI API: multiple messages with the same role must include distinct
      // `name` fields; otherwise upstream returns 2013 "invalid chat setting". Merge
      // persona + rules + context into one system block (DeepSeek-compatible too).
      const systemCombined = [system, CHAT_GROUNDED_RULES, contextPrompt]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join('\n\n');
      const chatProvider = resolveChatProvider();
      const messagesOpenAi = [{ role: 'system', content: systemCombined }, ...history];

      if (body.stream === true) {
        try {
          await pipeChatCompletionStream(chatProvider, messagesOpenAi, res);
          const totalMs = Date.now() - t0;
          console.log(`[ai-proxy] chat stream ok ${totalMs}ms`);
        } catch (error) {
          const totalMs = Date.now() - t0;
          const message =
            error instanceof Error
              ? `${error.message}${error.cause ? ` | cause: ${String(error.cause)}` : ''}`
              : String(error);
          const chatStatus = inferProxyErrorStatus(message);
          console.warn(`[ai-proxy] chat stream error ${chatStatus} ${totalMs}ms:`, message.slice(0, 400));
          if (!res.headersSent) {
            sendJson(res, chatStatus, { error: message }, { responseTimeMs: totalMs });
          } else {
            try {
              res.end();
            } catch {
              /* ignore */
            }
          }
        }
        return;
      }

      const text = await postChatCompletions(chatProvider, {
        temperature: 0.75,
        timeoutMs: 20000,
        maxCompletionTokens: 1536,
        messages: messagesOpenAi
      });
      const totalMs = Date.now() - t0;
      console.log(`[ai-proxy] chat ok ${totalMs}ms`);
      sendJson(res, 200, { reply: text }, { responseTimeMs: totalMs });
    } catch (error) {
      const totalMs = Date.now() - t0;
      const message =
        error instanceof Error
          ? `${error.message}${error.cause ? ` | cause: ${String(error.cause)}` : ''}`
          : String(error);
      const chatStatus = inferProxyErrorStatus(message);
      console.warn(`[ai-proxy] chat error ${chatStatus} ${totalMs}ms:`, message.slice(0, 400));
      sendJson(res, chatStatus, { error: message }, { responseTimeMs: totalMs });
    }
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`[ai-proxy] running on http://localhost:${PORT}`);
  console.log(`[ai-proxy] AI_LLM_PROVIDER=${AI_LLM_PROVIDER}`);
  if (AI_LLM_PROVIDER === 'minimax') {
    if (!MINIMAX_API_KEY) {
      console.warn('[ai-proxy] missing MINIMAX_API_KEY, set server/.env before using MiniMax.');
    }
  } else if (!DEEPSEEK_API_KEY) {
    console.warn('[ai-proxy] missing DEEPSEEK_API_KEY, set server/.env before using DeepSeek.');
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
