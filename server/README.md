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
