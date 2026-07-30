# Battle POC

Battle prototype built with Next.js 15 + React 19 + Phaser. The default experience is AI Battle V3: a bright pixel-RPG loop with exploration, preparation, automatic dual-AI combat, reports, and deterministic replay. The previous application remains available at `/legacy`.

## Requirements

- Node.js 20+
- npm 10+

## Quick Start

From the project root:

```bash
npm install
npm run dev
```

Then open [http://localhost:3002](http://localhost:3002).

V3 starts at `/`. Move with arrow keys/WASD, click an unlocked trial, configure the four-skill loadout and behavior tree, then watch the 16x16 battle. The AI proxy is optional: offline play uses a labeled deterministic fallback and remains fully playable.

## Local Web data mode

`battle-poc` runs as an independent local Web project. Supabase runtime access, cloud auth,
cloud maps, Studio Apply/sync, and migration automation are disabled; the legacy code remains
in place for reference. Built-in maps, browser `localStorage`, local AI backends, and PixelLab
generation/resource sync remain available. PixelLab generation returns a browser preview in local
mode and does not authenticate with or persist to Supabase.

Game content lives in TypeScript. When a Keco source is requested, use the `keco-main` MCP at
development time to read that source, validate the complete result, and write typed data under
`src/content/generated/`. The browser reads those generated modules directly; MCP and database
access are not application runtime dependencies.

## Optional: Run the AI Proxy (Chat)

If you want in-game AI chat, start the local proxy as well:

```bash
cp server/.env.example server/.env
npm run dev:ai
```

It listens on `http://localhost:8787` by default. Health check:

```bash
curl http://localhost:8787/health
```

The frontend connects to the proxy via `NEXT_PUBLIC_BATTLE_AI_SERVER_URL` (default: `http://localhost:8787`).

See `server/README.md` for more details.

### MiniMax（经本地代理）

在 `server/.env` 中设置：

```bash
AI_LLM_PROVIDER=minimax
MINIMAX_API_KEY=你的密钥
MINIMAX_MODEL=MiniMax-M2.1
MINIMAX_BASE_URL=https://api.minimax.io
```

前端 `.env.local`：

```bash
NEXT_PUBLIC_BATTLE_LLM_PROVIDER=minimax
NEXT_PUBLIC_BATTLE_LLM_MODEL=MiniMax-M2.1
NEXT_PUBLIC_V3_AI_ENABLED=1
```

然后 `npm run dev:ai` 启动代理。

## Common Commands

```bash
npm run dev                  # start Next.js dev server
npm run dev:ai               # start local AI proxy
npm run test                 # run Vitest
npm run lint                 # run ESLint
npm run build                # build for production
npm run generate:demo-tileset
```

## Project Structure (Core)

```text
battle-poc/
├── app/                     # Next.js App Router (UI + API routes)
│   ├── legacy/              # previous default application
│   ├── battle/              # battle route(s)
│   ├── components/          # UI components (includes GameMap, etc.)
│   └── api/                 # Route Handlers
├── src/v3/                  # deterministic V3 runtime, Phaser presentation, React UI
├── public/assets/v3/        # generated maps, sprites, animation frames, skill FX
├── src/                     # battle/render/engine core logic
├── server/                  # local AI proxy (Node scripts)
├── docs/                    # design/task docs
├── tests/                   # Vitest tests
└── tests/integration/       # Playwright end-to-end tests
```

## Notes

- `server/.env` contains secrets. Do not commit it.
- If you changed functional code, run `npx vitest run` before committing.
