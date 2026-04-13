# Battle Demo

基于 Next.js + React 的 Battle 项目。

## 快速开始

```bash
npm install
npm run dev
```

访问 http://localhost:3000

## 项目结构

```
battle-demo/
├── app/
│   ├── page.tsx          # 首页（背景 + home-left + 登录按钮）
│   └── layout.tsx        # 根布局
├── public/
│   ├── home-bg.png       # 全屏背景图
│   └── home-left.png     # 左下角面板
├── package.json
└── tsconfig.json
```

## UI 设计规范（参考设计稿）

- 全屏背景图：`public/home-bg.png`
- 左下角面板：`public/home-left.png`
- 右上角登录按钮，点击弹出登录面板

## 待开发

- [ ] Battle 战斗页面
- [ ] 登录逻辑
- [ ] 其他业务页面
