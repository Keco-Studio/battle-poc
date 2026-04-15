import Phaser from 'phaser';
import type { CombatActor } from '@/engine/combat/CombatTypes';

interface ActorData {
  player: CombatActor;
  enemies: CombatActor[];
}

export class BattleScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private enemies: Phaser.GameObjects.Sprite[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private static readonly MOVE_SPEED_PX_PER_SEC = 160;
  private static readonly MAX_MOVE_DT_SEC = 1 / 30;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(data: ActorData): void {
    // Background
    this.add.rectangle(400, 300, 800, 600, 0x1a1a2e);

    // Title
    this.add.text(400, 50, 'Battle Arena', {
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);

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
    this.add.text(200, 480, data.player.name, { color: '#00ff00', fontSize: '16px' }).setOrigin(0.5);
    this.add.text(600, 480, data.enemies[0].name, { color: '#ff0000', fontSize: '16px' }).setOrigin(0.5);

    // 启用键盘输入（单独 addKey，避免 addKeys 在部分环境下的映射问题）
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }

  update(): void {
    let mx = 0;
    let my = 0;
    if (this.keyA.isDown) mx -= 1;
    if (this.keyD.isDown) mx += 1;
    if (this.keyW.isDown) my -= 1;
    if (this.keyS.isDown) my += 1;

    if (mx === 0 && my === 0) {
      return;
    }

    if (mx !== 0 && my !== 0) {
      const inv = 1 / Math.SQRT2;
      mx *= inv;
      my *= inv;
    }

    const rawDt = this.game.loop.delta / 1000;
    const dt = Math.min(Math.max(rawDt, 0), BattleScene.MAX_MOVE_DT_SEC);
    const step = BattleScene.MOVE_SPEED_PX_PER_SEC * dt;
    const nextX = this.player.x + mx * step;
    const nextY = this.player.y + my * step;
    this.player.x = Phaser.Math.Clamp(nextX, 50, 750);
    this.player.y = Phaser.Math.Clamp(nextY, 50, 550);
  }
}