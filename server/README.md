# battle-poc AI Proxy

This proxy keeps API keys on the backend and exposes a local endpoint for the game client.

## 1) Configure

```bash
cd /home/hetu/project/battle-poc
cp server/.env.example server/.env
```

Edit `server/.env`:

```bash
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
AI_PROXY_PORT=8787
AI_PROXY_ALLOWED_ORIGIN=http://localhost:3000
```

## 2) Start AI proxy

```bash
npm run dev:ai
```

Health check:

```bash
curl http://localhost:8787/health
```

In-game chat (Engineer Bolt / enemy) now calls Next API `POST /api/agent-chat`, which can proxy to:

- DeepSeek proxy (`CHAT_BACKEND_MODE=deepseek`, default)
- OpenClaw CLI (`CHAT_BACKEND_MODE=openclaw`)
- Supabase → User-hosted OpenClaw bridge (`CHAT_BACKEND_MODE=supabase_openclaw`, recommended for Vercel)

OpenClaw mode env vars (set in app runtime environment):

```bash
CHAT_BACKEND_MODE=openclaw
# Optional: which openclaw agent id to invoke (default: main)
OPENCLAW_AGENT_ID=main
# Optional mapping by target/agentId. Example:
# OPENCLAW_AGENT_ID_MAP_JSON='{"system":"main","enemy":"main"}'
OPENCLAW_AGENT_ID_MAP_JSON=
# Optional agent timeout in ms
OPENCLAW_AGENT_TIMEOUT_MS=30000
```

## Supabase OpenClaw Mode (Vercel-friendly)

When deploying on Vercel, `exec openclaw` is not reliable. Use Supabase Edge Functions to proxy chat to a user-hosted OpenClaw Chat Bridge.

### 1) Supabase setup

- Apply the migration: `supabase/migrations/20260430000001_create_openclaw_connections.sql`
- Deploy functions:
  - `openclaw_bind`
  - `openclaw_chat`
  - `openclaw_health`
- Set Edge Function secret env:
  - `OPENCLAW_ENC_KEY_B64`: base64 of 32 random bytes (AES-256-GCM key)

### 2) App runtime env

```bash
CHAT_BACKEND_MODE=supabase_openclaw
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 3) User-hosted OpenClaw Chat Bridge

Users run a small HTTP service that turns a `POST /battle/openclaw/chat` request into a synchronous `openclaw agent` call.

Example (user machine):

```bash
cp server/openclaw-bridge.env.example server/openclaw-bridge.env
set -a && source server/openclaw-bridge.env && set +a
npm run dev:openclaw-bridge
```

Health check:

```bash
curl -sS -H "Authorization: Bearer $BRIDGE_TOKEN" \
  "http://localhost:$BRIDGE_PORT/battle/openclaw/health"
```

Chat test:

```bash
curl -sS -X POST "http://localhost:$BRIDGE_PORT/battle/openclaw/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -d '{"agentId":"main","target":"system","text":"hello from battle-poc"}'
```

### 4) Bind in Supabase (minimal)

Call the `openclaw_bind` Edge Function with the user's Supabase JWT:

- `gatewayUrl`: `https://<public-bridge-host>` (host only)
- `secret`: `BRIDGE_TOKEN`
- `webhookPath`: `/battle/openclaw/chat`
- `healthPath`: `/battle/openclaw/health`

Then the game can call `POST /api/agent-chat` and Supabase will route to the user's bridge.

DeepSeek mode example:

```bash
curl -s -X POST http://localhost:8787/api/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"target":"system","messages":[{"role":"user","content":"hi"}]}'
```

## 3) Start frontend

In another terminal:

```bash
npm run dev
```

The app server reads:

- `CHAT_BACKEND_MODE` (`deepseek` / `openclaw`)
- DeepSeek: `BATTLE_AI_SERVER_URL` or `NEXT_PUBLIC_BATTLE_AI_SERVER_URL`
- OpenClaw: `OPENCLAW_AGENT_ID` / `OPENCLAW_AGENT_ID_MAP_JSON` / `OPENCLAW_AGENT_TIMEOUT_MS`
