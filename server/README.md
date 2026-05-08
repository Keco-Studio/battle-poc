# battle-poc AI / OpenClaw 接入

游戏内聊天统一走 Next API：`POST /api/agent-chat`。前端不用知道后面接的是 DeepSeek、OpenClaw hooks，还是本地 OpenClaw 服务。

## 推荐：OpenClaw 官方 hooks

适合用户已经在本机配置 OpenClaw，并且想尽量少跑额外服务的场景。

OpenClaw 配置示例：

```json
{
  "hooks": {
    "enabled": true,
    "token": "${OPENCLAW_HOOKS_TOKEN}",
    "path": "/hooks",
    "defaultSessionKey": "hook:battle-poc",
    "allowRequestSessionKey": false,
    "allowedAgentIds": ["main"]
  }
}
```

启动 OpenClaw gateway 后，在 battle-poc 运行环境设置：

```bash
CHAT_BACKEND_MODE=openclaw_hooks
OPENCLAW_BASE_URL=http://127.0.0.1:18789
OPENCLAW_HOOKS_TOKEN=your-strong-token
OPENCLAW_AGENT_ID=main
```

本地试玩时，`WEBHOOK_URL` 就是：

```text
http://127.0.0.1:18789/hooks/agent
```

如果游戏后端部署在云端，而 OpenClaw 跑在用户电脑上，这个 URL 必须变成云端可访问的地址，例如 tunnel、tailnet 或可信反代地址。这个网络可达性无法靠代码省掉。

注意：官方 `/hooks/agent` 文档主要承诺接收触发事件。如果实际响应没有同步文本，`/api/agent-chat` 会返回 `openclaw_hooks_no_sync_reply`。这种情况下用下面的本地 Open API 服务。

## 稳定回显：本地 OpenClaw Open API 服务

适合游戏聊天窗口必须马上显示 AI 文本回复的场景。这个服务只是把 HTTP 请求封装成：

```bash
openclaw agent --json --agent <agentId> --message <text>
```

配置：

```bash
cp server/openclaw-bridge.env.example server/openclaw-bridge.env
set -a && source server/openclaw-bridge.env && set +a
npm run dev:openclaw-service
```

`server/openclaw-bridge.env.example` 只需要这些项：

```bash
PORT=32123
TOKEN_SECRET=your-strong-token
OPENCLAW_AGENT_ID=main
OPENCLAW_AGENT_TIMEOUT_MS=30000
```

让游戏接这个本地服务：

```bash
CHAT_BACKEND_MODE=openclaw_service
OPENCLAW_SERVICE_URL=http://127.0.0.1:32123
OPENCLAW_SERVICE_TOKEN=your-strong-token
```

健康检查：

```bash
curl -sS -H "Authorization: Bearer $TOKEN_SECRET" \
  "http://127.0.0.1:$PORT/health"
```

聊天测试：

```bash
curl -sS -X POST "http://127.0.0.1:$PORT/api/ai/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_SECRET" \
  -d '{"target":"system","messages":[{"role":"user","content":"hi"}]}'
```

兼容旧路径：

- `GET /battle/openclaw/health`
- `POST /battle/openclaw/chat`
- 旧脚本 `npm run dev:openclaw-bridge`

## DeepSeek / MiniMax 本地代理

如果不用 OpenClaw，可以继续使用默认 DeepSeek 代理，或改用 MiniMax（OpenAI 兼容接口）。

```bash
cp server/.env.example server/.env
```

### DeepSeek

编辑 `server/.env`：

```bash
AI_LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
AI_PROXY_PORT=8787
AI_PROXY_ALLOWED_ORIGIN=http://localhost:3000
```

### MiniMax

```bash
AI_LLM_PROVIDER=minimax
MINIMAX_API_KEY=你的密钥
MINIMAX_MODEL=MiniMax-M2.1
MINIMAX_BASE_URL=https://api.minimax.io
AI_PROXY_PORT=8787
AI_PROXY_ALLOWED_ORIGIN=http://localhost:3000
```

前端需设置 `NEXT_PUBLIC_BATTLE_LLM_PROVIDER=minimax`（及可选 `NEXT_PUBLIC_BATTLE_LLM_MODEL`），与代理一致。

启动：

```bash
npm run dev:ai
```

游戏环境：

```bash
CHAT_BACKEND_MODE=deepseek
BATTLE_AI_SERVER_URL=http://127.0.0.1:8787
```

## 高级：Supabase / 用户侧 Bridge

`CHAT_BACKEND_MODE=supabase_openclaw` 只建议云端部署、多用户绑定或需要 Supabase Edge Function 中转时使用。

需要：

- 应用 `supabase/migrations/20260430000001_create_openclaw_connections.sql`
- 部署 `openclaw_bind`、`openclaw_chat`、`openclaw_health`
- 设置 `OPENCLAW_ENC_KEY_B64`
- 用户提供公网可达的 `gatewayUrl`

如果目标是“越简单越好”，优先用 `openclaw_hooks`；如果游戏内必须稳定显示回复，用 `openclaw_service`。

## 启动前端

```bash
npm run dev
```
