# Battle POC

Battle prototype built with Next.js 15 + React 19 + Phaser. Includes a playable battle/map UI and an optional local AI proxy (used to forward chat requests without exposing API keys in the browser).

## Requirements

- Node.js 20+
- npm 10+

## Quick Start

From the project root:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

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
│   ├── battle/              # battle route(s)
│   ├── components/          # UI components (includes GameMap, etc.)
│   └── api/                 # Route Handlers
├── src/                     # battle/render/engine core logic
├── server/                  # local AI proxy (Node scripts)
├── docs/                    # design/task docs
├── tests/                   # Vitest tests
└── e2e/                     # Playwright e2e tests
```

## Notes

- `server/.env` contains secrets. Do not commit it.
- If you changed functional code, run `npx vitest run` before committing.
