# Battle-POC Phase 2: 游戏集成任务

> 目标：将 Phase 1 的纯逻辑 battle 引擎与 Phaser 渲染层集成，实现可运行的实时战斗 demo。

## 项目状态

### Phase 1 ✅ 已完成

| 任务 | 内容                               | 状态 |
| ---- | ---------------------------------- | ---- |
| 1    | 添加 Vitest + Playwright 测试框架  | ✅    |
| 2    | 复制 SeededRNG（确定性随机数）     | ✅    |
| 3    | 定义 CombatTypes（战斗类型系统）   | ✅    |
| 4    | TDD 实现伤害公式 + 暴击            | ✅    |
| 5    | TDD 实现状态效果（中毒/烧伤/眩晕） | ✅    |
| 6    | TDD 实现 BattleStateMachine        | ✅    |
| 7    | 编写 battle.contract.md 契约文档   | ✅    |
| 8    | 定义 IBattleInput 接口             | ✅    |
| 9    | 实现 ScriptedAI（脚本化敌人AI）    | ✅    |
| 10   | 创建 Phaser BattleScene 基础       | ✅    |

- `src/engine/combat/` - 战斗逻辑（伤害、暴击、状态效果）
- `src/engine/state/` - 战斗状态机
- `src/engine/input/` - IBattleInput 接口、ScriptedAI
- `src/engine/rng/` - 确定性随机数生成器
- `contracts/battle.contract.md` - 行为契约文档

### Phase 2 ❌ 待完成
本阶段目标：让玩家能**看到并操作**一个实时战斗 demo。

---

## 任务 1: Phaser 游戏容器初始化

### 目标
在 Next.js 页面中嵌入 Phaser 游戏容器。

### 步骤

1. **创建游戏配置**

```typescript
// src/renderer/phaser/config.ts
import Phaser from 'phaser';

export const GAME_CONFIG = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
  scene: [], // 暂空，后续添加 Scene
  physics: {
    default: 'arcade',
    arcade: {
      debug: true, // 开发时显示碰撞箱
    },
  },
};
```

2. **创建 React 组件包装器**

```typescript
// src/renderer/PhaserGame.tsx
'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GAME_CONFIG } from './config';

export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameRef.current) {
      gameRef.current = new Phaser.Game(GAME_CONFIG);
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return <div id="game-container" />;
}
```

3. **创建 Next.js 页面**

```typescript
// app/battle/page.tsx
import { PhaserGame } from '@/renderer/PhaserGame';

export default function BattlePage() {
  return (
    <main>
      <h1>Battle Demo</h1>
      <PhaserGame />
    </main>
  );
}
```

4. **验证**
- 运行 `npm run dev`
- 访问 http://localhost:3000/battle
- 应该看到黑色游戏画布

### 验收标准
- [ ] 游戏画布正确渲染
- [ ] 无 JavaScript 报错
- [ ] 窗口 resize 时画布自适应

---

## 任务 2: 角色渲染基础

### 目标
在屏幕上显示玩家和敌人角色。

### 步骤

1. **创建角色精灵数据**

```typescript
// src/data/characters.json
{
  "player": {
    "id": "player",
    "name": "Hero",
    "sprite": "knight",
    "stats": { "hp": 100, "maxHp": 100, "attack": 15, "defense": 5, "speed": 10, "luck": 5 }
  },
  "enemies": [
    { "id": "slime", "name": "Slime", "sprite": "slime", "stats": { "hp": 30, "maxHp": 30, "attack": 8, "defense": 2, "speed": 3, "luck": 0 } }
  ]
}
```

2. **创建 BattleScene**

```typescript
// src/renderer/phaser/BattleScene.ts
import Phaser from 'phaser';
import type { CombatActor } from '@/engine/combat/CombatTypes';

export class BattleScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private enemies: Phaser.GameObjects.Sprite[] = [];

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(data: { player: CombatActor; enemies: CombatActor[] }) {
    // 背景
    this.add.rectangle(400, 300, 800, 600, 0x1a1a2e);

    // 渲染玩家（屏幕左侧）
    this.player = this.add.sprite(200, 400, 'knight');
    this.player.setScale(2);

    // 渲染敌人（屏幕右侧）
    data.enemies.forEach((enemy, i) => {
      const sprite = this.add.sprite(600, 150 + i * 100, enemy.id);
      sprite.setScale(2);
      this.enemies.push(sprite);
    });

    // 显示名称
    this.add.text(200, 480, data.player.name, { color: '#00ff00' }).setOrigin(0.5);
    this.add.text(600, 480, data.enemies[0].name, { color: '#ff0000' }).setOrigin(0.5);
  }
}
```

3. **添加占位符精灵**（在 public/sprites/ 放置 32x32 纯色方块 PNG）

4. **更新游戏配置加载 Scene**

### 验收标准
- [ ] 玩家角色显示在左侧
- [ ] 敌人显示在右侧
- [ ] 角色下方显示名称

---

## 任务 3: 玩家输入控制

### 目标
让玩家能用 WASD 移动角色。

### 步骤

1. **添加输入状态管理**

```typescript
// src/renderer/phaser/BattleScene.ts 添加

private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
private wasd!: { [key: string]: Phaser.Input.Keyboard.Key };
private playerVelocity = { x: 0, y: 0 };
private moveSpeed = 200;

create() {
  // ... 现有代码 ...

  // 启用键盘输入
  this.cursors = this.input.keyboard!.createCursorKeys();
  this.wasd = this.input.keyboard!.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D,
  }) as any;
}

update() {
  // 处理移动输入
  this.playerVelocity.x = 0;
  this.playerVelocity.y = 0;

  if (this.wasd.left.isDown) this.playerVelocity.x = -this.moveSpeed;
  if (this.wasd.right.isDown) this.playerVelocity.x = this.moveSpeed;
  if (this.wasd.up.isDown) this.playerVelocity.y = -this.moveSpeed;
  if (this.wasd.down.isDown) this.playerVelocity.y = this.moveSpeed;

  // 应用移动（带边界限制）
  const newX = Phaser.Math.Clamp(
    this.player.x + this.playerVelocity.x * this.game.loop.delta / 1000,
    50, 350
  );
  const newY = Phaser.Math.Clamp(
    this.player.y + this.playerVelocity.y * this.game.loop.delta / 1000,
    200, 500
  );

  this.player.x = newX;
  this.player.y = newY;
}
```

### 验收标准
- [ ] W/A/S/D 键可以移动玩家
- [ ] 玩家不能移出屏幕边界
- [ ] 移动流畅无卡顿

---

## 任务 4: 攻击系统

### 目标
玩家按空格键攻击敌人，触发战斗逻辑。

### 步骤

1. **在 BattleScene 中添加攻击逻辑**

```typescript
// src/renderer/phaser/BattleScene.ts 添加

private spaceKey!: Phaser.Input.Keyboard.Key;
private isAttacking = false;

create() {
  // ... 现有代码 ...
  this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
}

update() {
  // 攻击检测
  if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.isAttacking) {
    this.performAttack();
  }
}

private performAttack() {
  this.isAttacking = true;

  // 攻击动画：向右冲刺
  this.tweens.add({
    targets: this.player,
    x: this.player.x + 50,
    duration: 100,
    yoyo: true,
    onComplete: () => {
      this.isAttacking = false;
      // 触发战斗系统伤害计算
      this.events.emit('playerAttack');
    },
  });

  // 伤害数字效果（示例）
  this.showDamageNumber(600, 300, 15);
}

private showDamageNumber(x: number, y: number, damage: number) {
  const text = this.add.text(x, y, `-${damage}`, {
    fontSize: '24px',
    color: '#ff0000',
    stroke: '#000000',
    strokeThickness: 2,
  });

  this.tweens.add({
    targets: text,
    y: y - 50,
    alpha: 0,
    duration: 800,
    onComplete: () => text.destroy(),
  });
}
```

### 验收标准
- [ ] 空格键触发攻击动画
- [ ] 攻击动画播放时玩家不能再次攻击
- [ ] 显示伤害数字飘字

---

## 任务 5: 敌人 AI 响应

### 目标
敌人被攻击后，AI 做出反击。

### 步骤

1. **连接 ScriptedAI 到 BattleScene**

```typescript
// 在 BattleScene 或专门的 BattleManager 中

import { ScriptedAI } from '@/engine/input/ScriptedAI';
import { BattleStateMachine } from '@/engine/state/BattleStateMachine';
import { SeededRNG } from '@/engine/rng/SeededRNG';

class BattleManager {
  private stateMachine: BattleStateMachine;
  private playerAI = new ScriptedAI();
  private enemyAI = new ScriptedAI();

  constructor(actors: CombatActor[]) {
    this.stateMachine = new BattleStateMachine(actors, new SeededRNG(12345));
  }

  onPlayerAttack() {
    // 获取敌人应该执行的动作
    const enemy = actors.find(a => a.side === 'enemy');
    const action = this.enemyAI.getAction(enemy);

    if (action) {
      // 敌人反击动画
      scene.events.emit('enemyAttack');
    }
  }
}
```

### 验收标准
- [ ] 玩家攻击后敌人会反击
- [ ] 敌人按 ScriptedAI 逻辑攻击玩家
- [ ] 双方血量正确减少

---

## 任务 6: HP 条显示

### 目标
显示玩家和敌人的 HP 条。

### 步骤

```typescript
// HP 条组件
private createHpBar(x: number, y: number, currentHp: number, maxHp: number) {
  // 背景（灰色）
  this.add.rectangle(x, y, 100, 10, 0x333333);

  // 前景（绿色，HP 比例）
  const hpRatio = currentHp / maxHp;
  const hpBar = this.add.rectangle(x - 50 + (100 * hpRatio) / 2, y, 100 * hpRatio, 10, 0x00ff00);

  // HP 文字
  this.add.text(x, y - 15, `${currentHp}/${maxHp}`, {
    fontSize: '12px',
    color: '#ffffff',
  }).setOrigin(0.5);
}
```

### 验收标准
- [ ] HP 条正确显示当前/最大 HP
- [ ] HP 变化时条长度同步更新
- [ ] HP < 30% 时条变红色

---

## Phase 2 完成后预期效果

```
     [Hero HP: 100/100]                    [Slime HP: 30/30]
          ██████████                            ████
           🧙‍♂️                                    👾
     玩家可移动 + 空格攻击              ←  敌人被攻击后反击
```

**可玩点：**
- WASD 移动
- 空格攻击
- 看到伤害数字
- 敌人死亡后显示胜利

---

## 技术栈参考

- **Phaser 3.80+** - 游戏引擎
- **React 19** - UI 框架
- **Next.js 15** - 应用框架
- **TypeScript 5** - 类型安全

## 目录结构（Phase 2 完成后）

```
src/
├── engine/           ← Phase 1 纯逻辑（不依赖渲染）
│   ├── combat/
│   ├── state/
│   ├── input/
│   └── rng/
├── renderer/         ← Phase 2 新增
│   └── phaser/
│       ├── BattleScene.ts
│       ├── config.ts
│       └── components/
└── data/
    └── characters.json
```

---

## 注意事项

1. **逻辑与渲染分离**：`src/engine/` 下的代码**不能** import 任何 Phaser 或 DOM 代码
2. **测试通过再集成**：每次修改 engine 层逻辑前，确保 `npm test` 通过
3. **Seed 固定**：使用固定 seed（如 12345）确保每次运行结果一致，方便调试