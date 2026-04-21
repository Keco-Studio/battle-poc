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

## 3) Start frontend

In another terminal:

```bash
npm run dev
```

The frontend reads `NEXT_PUBLIC_BATTLE_AI_SERVER_URL` (default `http://localhost:8787`).
