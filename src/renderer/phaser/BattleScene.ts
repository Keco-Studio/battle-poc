import * as Phaser from 'phaser';
import type { BattleFxKind, BattleSceneInitData, BattleVisualState } from './battleVisualTypes';

const W = 1600;
const H = 900;
const MID_X = W / 2;

/** 左/右半场巡逻范围（留出边距） */
const ZONE = {
  player: { xMin: 90, xMax: MID_X - 90, yMin: 120, yMax: H - 120 },
  enemy: { xMin: MID_X + 90, xMax: W - 90, yMin: 120, yMax: H - 120 },
};

export class BattleScene extends Phaser.Scene {
  private getState!: () => BattleVisualState;

  private player!: Phaser.GameObjects.Sprite;
  private enemy!: Phaser.GameObjects.Sprite;
  private shield!: Phaser.GameObjects.Text;
  private playerNameLabel!: Phaser.GameObjects.Text;
  private enemyNameLabel!: Phaser.GameObjects.Text;

  private playerTarget = { x: 0, y: 0 };
  private enemyTarget = { x: 0, y: 0 };
  private nextPlayerRetargetAt = 0;
  private nextEnemyRetargetAt = 0;

  private readonly processedFloatIds = new Set<number>();
  private lastBattleFx: BattleFxKind = 'none';
  private animBusyUntil = 0;
  private enemyDeathPlayed = false;
  private playerDeathPlayed = false;

  private static readonly PLAYER_PATROL_SPEED = 78;
  private static readonly ENEMY_PATROL_SPEED = 110;
  private static readonly MAX_MOVE_DT = 1 / 45;
  private static readonly PRESENTATION_SLOWDOWN = 1.35;

  private resetSceneState(): void {
    this.animBusyUntil = 0
    this.enemyDeathPlayed = false
    this.playerDeathPlayed = false
    this.lastBattleFx = 'none'
    this.processedFloatIds.clear()
  }

  constructor() {
    super({ key: 'BattleScene' });
  }

  preload(): void {
    this.load.image('battle-player', '/player.png');
    this.load.image('battle-enemy', '/enemy.png');
  }

  create(data: BattleSceneInitData): void {
    this.getState = data.getState;
    this.resetSceneState()

    this.add.rectangle(W / 2, H / 2, W, H, 0x1a1a2e);

    this.player = this.add.sprite(ZONE.player.xMin + 220, H * 0.52, 'battle-player');
    this.player.setScale(0.42);
    this.player.setAlpha(1)
    this.player.setVisible(true)
    this.player.setAngle(0)
    this.player.setDepth(5);

    this.enemy = this.add.sprite(ZONE.enemy.xMax - 220, H * 0.48, 'battle-enemy');
    this.enemy.setScale(0.38);
    this.enemy.setAlpha(1)
    this.enemy.setVisible(true)
    this.enemy.setAngle(0)
    this.enemy.setDepth(5);

    this.pickPatrolTarget('player');
    this.pickPatrolTarget('enemy');

    this.shield = this.add
      .text(0, 0, '🛡️', { fontSize: '72px' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(20);

    this.tweens.add({
      targets: this.shield,
      angle: 360,
      duration: 4200,
      repeat: -1,
    });

    this.playerNameLabel = this.add
      .text(this.player.x, this.player.y - 110, '玩家', { fontSize: '16px', color: '#a7f3d0' })
      .setOrigin(0.5)
      .setVisible(true)
      .setDepth(15);
    this.enemyNameLabel = this.add
      .text(this.enemy.x, this.enemy.y - 110, '敌人', { fontSize: '16px', color: '#fecaca' })
      .setOrigin(0.5)
      .setVisible(true)
      .setDepth(15);

  }

  private pickPatrolTarget(which: 'player' | 'enemy'): void {
    const z = which === 'player' ? ZONE.player : ZONE.enemy;
    const tx = Phaser.Math.FloatBetween(z.xMin, z.xMax);
    const ty = Phaser.Math.FloatBetween(z.yMin, z.yMax);
    if (which === 'player') {
      this.playerTarget.x = tx;
      this.playerTarget.y = ty;
    } else {
      this.enemyTarget.x = tx;
      this.enemyTarget.y = ty;
    }
  }

  private nudgeChaseTowardOpponent(): void {
    const px = this.player.x;
    const py = this.player.y;
    const ex = this.enemy.x;
    const ey = this.enemy.y;
    // 偶尔把巡逻点拉向对手方向，形成「追逐」感
    if (Math.random() < 0.35) {
      this.playerTarget.x = Phaser.Math.Linear(ZONE.player.xMin, ZONE.player.xMax, Phaser.Math.FloatBetween(0.35, 0.85));
      this.playerTarget.y = Phaser.Math.Clamp(Phaser.Math.Linear(py, ey, 0.22), ZONE.player.yMin, ZONE.player.yMax);
    }
    if (Math.random() < 0.35) {
      this.enemyTarget.x = Phaser.Math.Linear(ZONE.enemy.xMin, ZONE.enemy.xMax, Phaser.Math.FloatBetween(0.15, 0.75));
      this.enemyTarget.y = Phaser.Math.Clamp(Phaser.Math.Linear(ey, py, 0.22), ZONE.enemy.yMin, ZONE.enemy.yMax);
    }
  }

  private moveToward(
    sprite: Phaser.GameObjects.Sprite,
    tx: number,
    ty: number,
    speed: number,
    dt: number,
    bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  ): void {
    const dx = tx - sprite.x;
    const dy = ty - sprite.y;
    const len = Math.hypot(dx, dy);
    if (len < 14) return;
    const nx = dx / len;
    const ny = dy / len;
    const step = speed * dt;
    sprite.x = Phaser.Math.Clamp(sprite.x + nx * step, bounds.xMin, bounds.xMax);
    sprite.y = Phaser.Math.Clamp(sprite.y + ny * step, bounds.yMin, bounds.yMax);
  }

  private spawnFloatText(text: string, worldX: number, worldY: number, color: string): void {
    const t = this.add
      .text(worldX, worldY, text, {
        fontSize: '28px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(100);
    this.tweens.add({
      targets: t,
      y: worldY - 70,
      alpha: 0,
      duration: 820,
      ease: 'Sine.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private processNewFloats(state: BattleVisualState): void {
    for (const f of state.floatTexts) {
      if (this.processedFloatIds.has(f.id)) continue;
      this.processedFloatIds.add(f.id);
      const isHeal = f.text.startsWith('+');
      const color = isHeal ? '#86efac' : f.side === 'left' ? '#fcd34d' : '#fca5a5';
      const x = f.side === 'left' ? this.player.x : this.enemy.x;
      const y = f.side === 'left' ? this.player.y - 40 : this.enemy.y - 40;
      this.spawnFloatText(f.text, x, y, color);
    }
    if (state.floatTexts.length === 0) this.processedFloatIds.clear();
  }

  private flashSprite(sprite: Phaser.GameObjects.Sprite, duration = 140): void {
    sprite.setTint(0xffffff);
    this.time.delayedCall(duration, () => sprite.clearTint());
  }

  private knockback(sprite: Phaser.GameObjects.Sprite, deltaX: number): void {
    this.tweens.add({
      targets: sprite,
      x: sprite.x + deltaX,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private shakeSprite(sprite: Phaser.GameObjects.Sprite): void {
    const ox = sprite.x;
    this.tweens.add({
      targets: sprite,
      x: ox - 6,
      duration: 40,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        sprite.x = ox;
      },
    });
  }

  private pickImpactPoint(): { y: number; playerX: number; enemyX: number } {
    const impactY = Phaser.Math.Between(Math.floor(H * 0.34), Math.floor(H * 0.68))
    return {
      y: impactY,
      playerX: Phaser.Math.Clamp(MID_X - Phaser.Math.Between(70, 130), ZONE.player.xMin + 30, ZONE.player.xMax),
      enemyX: Phaser.Math.Clamp(MID_X + Phaser.Math.Between(70, 130), ZONE.enemy.xMin, ZONE.enemy.xMax - 30),
    }
  }

  private playAttackSequence(kind: BattleFxKind, state: BattleVisualState): void {
    const heavy = state.heavyStrikePlaying;
    const slow = BattleScene.PRESENTATION_SLOWDOWN;
    const wind = Math.round((heavy ? 220 : 120) * slow);
    const retreat = Math.round((heavy ? 260 : 200) * slow);
    const settle = Math.round(110 * slow);
    this.animBusyUntil = this.time.now + wind + retreat + settle;

    if (kind === 'player-hit') {
      // 敌人打玩家：敌人前冲，玩家受击
      const ex = this.enemy.x;
      const ey = this.enemy.y;
      const px = this.player.x;
      const py = this.player.y;
      const impact = this.pickImpactPoint();
      this.tweens.add({
        targets: this.enemy,
        x: impact.enemyX,
        y: impact.y,
        duration: wind,
        ease: heavy ? 'Cubic.easeIn' : 'Quad.easeIn',
        onComplete: () => {
          this.player.y = impact.y;
          this.hitFlash(this.player);
          this.knockback(this.player, -38);
          this.shakeSprite(this.player);
          this.tweens.add({
            targets: this.enemy,
            x: ex,
            y: ey,
            duration: retreat,
            ease: 'Sine.easeOut',
          });
          this.tweens.add({
            targets: this.player,
            y: py,
            duration: retreat,
            ease: 'Sine.easeOut',
          });
        },
      });
      return;
    }

    if (kind === 'enemy-hit' || kind === 'player-skill-offense') {
      const px = this.player.x;
      const py = this.player.y;
      const ex = this.enemy.x;
      const ey = this.enemy.y;
      const impact = this.pickImpactPoint();
      this.tweens.add({
        targets: this.player,
        x: impact.playerX,
        y: impact.y,
        duration: wind,
        ease: heavy ? 'Cubic.easeIn' : 'Quad.easeIn',
        onComplete: () => {
          this.enemy.y = impact.y;
          this.hitFlash(this.enemy);
          this.knockback(this.enemy, 42);
          this.shakeSprite(this.enemy);
          this.tweens.add({
            targets: this.player,
            x: px,
            y: py,
            duration: retreat,
            ease: 'Sine.easeOut',
          });
          this.tweens.add({
            targets: this.enemy,
            y: ey,
            duration: retreat,
            ease: 'Sine.easeOut',
          });
        },
      });
      return;
    }

    if (kind === 'player-skill-support') {
      const s0 = this.player.scaleX;
      this.player.setTint(0xa5f3fc);
      this.tweens.add({
        targets: this.player,
        scaleX: s0 * 1.06,
        scaleY: s0 * 1.06,
        duration: Math.round(100 * slow),
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          this.player.setScale(s0);
          this.player.clearTint();
        },
      });
    }
  }

  private hitFlash(sprite: Phaser.GameObjects.Sprite): void {
    this.flashSprite(sprite);
  }

  private syncFx(state: BattleVisualState): void {
    if (state.battleFx === this.lastBattleFx) return;
    if (state.battleFx === 'none') {
      this.lastBattleFx = 'none';
      return;
    }
    this.playAttackSequence(state.battleFx, state);
    this.lastBattleFx = state.battleFx;
  }

  private syncShield(state: BattleVisualState): void {
    if (state.isDefending) {
      this.shield.setAlpha(0.5);
      this.shield.setPosition(this.player.x, this.player.y);
    } else {
      this.shield.setAlpha(0);
    }
  }

  private syncLabels(state: BattleVisualState): void {
    this.playerNameLabel.setText(state.playerName || '玩家');
    this.enemyNameLabel.setText(state.enemyName || '敌人');
    this.playerNameLabel.setPosition(this.player.x, this.player.y - 110);
    this.enemyNameLabel.setPosition(this.enemy.x, this.enemy.y - 110);
  }

  private updatePatrol(dt: number, state: BattleVisualState): void {
    if (state.isGameOver) return;
    if (this.time.now < this.animBusyUntil) return;

    const now = this.time.now;
    if (now >= this.nextPlayerRetargetAt) {
      this.pickPatrolTarget('player');
      this.nextPlayerRetargetAt = now + Phaser.Math.Between(1600, 3200);
    }
    if (now >= this.nextEnemyRetargetAt) {
      this.pickPatrolTarget('enemy');
      this.nextEnemyRetargetAt = now + Phaser.Math.Between(1400, 2800);
    }
    this.nudgeChaseTowardOpponent();

    this.moveToward(this.player, this.playerTarget.x, this.playerTarget.y, BattleScene.PLAYER_PATROL_SPEED, dt, ZONE.player);
    this.moveToward(this.enemy, this.enemyTarget.x, this.enemyTarget.y, BattleScene.ENEMY_PATROL_SPEED, dt, ZONE.enemy);
  }

  private handleDeath(state: BattleVisualState): void {
    if (state.enemyHP <= 0 && !this.enemyDeathPlayed) {
      this.enemyDeathPlayed = true;
      this.tweens.add({
        targets: this.enemy,
        alpha: 0,
        scale: this.enemy.scale * 0.4,
        angle: 88,
        duration: 520,
        ease: 'Cubic.easeIn',
        onComplete: () => this.enemy.setVisible(false),
      });
      this.enemyNameLabel.setVisible(false);
    }
    if (state.isGameOver && state.battleResult === 'lose' && !this.playerDeathPlayed) {
      this.playerDeathPlayed = true;
      this.tweens.add({
        targets: this.player,
        alpha: 0.35,
        scale: this.player.scale * 0.68,
        angle: -90,
        duration: 600,
        ease: 'Cubic.easeIn',
      });
      this.playerNameLabel.setVisible(false);
    }
  }

  update(): void {
    const rawDt = this.game.loop.delta / 1000;
    const dt = Math.min(Math.max(rawDt, 0), BattleScene.MAX_MOVE_DT);
    const state = this.getState();

    this.processNewFloats(state);
    this.syncFx(state);
    this.syncShield(state);
    this.updatePatrol(dt, state);

    this.syncLabels(state);
    this.handleDeath(state);
  }
}
