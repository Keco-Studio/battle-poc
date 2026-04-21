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

async function requestDeepSeek(input) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('missing_deepseek_api_key: please set DEEPSEEK_API_KEY in server/.env');
  }
  const endpoint = DEEPSEEK_BASE_URL.endsWith('/v1')
    ? `${DEEPSEEK_BASE_URL}/chat/completions`
    : `${DEEPSEEK_BASE_URL}/v1/chat/completions`;
  const timeoutMs = Math.max(800, Math.min(20000, Number(input.timeoutMs || 8000)));
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
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: String(input.prompt || '') }
          ]
        }),
        signal: controller.signal
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`deepseek_http_${resp.status}:${text.slice(0, 160)}`);
      }
      const payload = JSON.parse(text);
      const content = String(payload?.choices?.[0]?.message?.content || '');
      const decision = parseJsonObject(content);
      if (!decision) {
        throw new Error('deepseek_parse_error');
      }
      return decision;
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
