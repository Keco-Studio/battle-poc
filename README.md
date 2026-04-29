# Battle POC

基于 Next.js 15 + React 19 + Phaser 的战斗原型项目，包含前端战斗场景与本地 AI 代理（用于对话请求转发，避免在客户端暴露 API Key）。

## 环境要求

- Node.js 20+
- npm 10+

## 快速开始

在项目根目录执行：

```bash
npm install
npm run dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)。

## 可选：启动 AI Proxy（聊天能力）

如果你需要游戏内 AI 聊天能力，再额外启动本地代理：

```bash
cp server/.env.example server/.env
npm run dev:ai
```

默认监听 `http://localhost:8787`，健康检查：

```bash
curl http://localhost:8787/health
```

前端通过 `NEXT_PUBLIC_BATTLE_AI_SERVER_URL`（默认 `http://localhost:8787`）连接代理。

更多细节见 `server/README.md`。

## 常用命令

```bash
npm run dev                  # 启动 Next.js 开发服务
npm run dev:ai               # 启动本地 AI 代理
npm run test                 # 运行 Vitest 单元测试
npm run lint                 # 运行 ESLint
npm run build                # 构建生产版本
npm run generate:demo-tileset
```

## 目录结构（核心）

```text
battle-poc/
├── app/                     # Next.js App Router 页面与 API
│   ├── battle/              # 战斗相关页面
│   ├── components/          # 前端组件（含 GameMap 等）
│   └── api/                 # API Route
├── src/                     # 战斗/渲染/引擎核心逻辑
├── server/                  # 本地 AI 代理（Node 脚本）
├── docs/                    # 设计与任务文档
├── tests/                   # Vitest 测试
└── e2e/                     # Playwright 端到端测试
```

## 说明

- `server/.env` 包含密钥信息，不要提交到仓库。
- 若修改了功能代码，建议先执行 `npx vitest run` 再提交。
