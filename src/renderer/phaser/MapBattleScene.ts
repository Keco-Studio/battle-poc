import * as Phaser from 'phaser'
import type { BattleFxKind, MapBattleSceneInitData, MapBattleVisualState } from './battleVisualTypes'

/** Map battle: sprites follow mapLayout, preserving floating text and light hit feedback (no half-field patrol movement) */
export class MapBattleScene extends Phaser.Scene {
  private getState!: () => MapBattleVisualState

  private player!: Phaser.GameObjects.Sprite
  private enemy!: Phaser.GameObjects.Sprite
  private shield!: Phaser.GameObjects.Text
  private playerNameLabel!: Phaser.GameObjects.Text
  private enemyNameLabel!: Phaser.GameObjects.Text

  private readonly processedFloatIds = new Set<number>()
  private lastBattleFx: BattleFxKind = 'none'
  private enemyDeathPlayed = false
  private playerDeathPlayed = false

  constructor() {
    super({ key: 'MapBattleScene' })
  }

  preload(): void {
    this.load.image('map-battle-player', '/player.png')
    this.load.image('map-battle-enemy', '/enemy.png')
  }

  create(data: MapBattleSceneInitData): void {
    this.getState = data.getState
    this.enemyDeathPlayed = false
    this.playerDeathPlayed = false
    this.lastBattleFx = 'none'
    this.processedFloatIds.clear()

    const s = this.getState()
    const L = s.mapLayout
    // No longer laying opaque/high alpha full-screen rectangle, otherwise it would block the underlying map canvas; if slight battle feel is needed, add a very low alpha mask separately
    this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.12)
      .setDepth(-1)

    this.player = this.add.sprite(L.playerX, L.playerY, 'map-battle-player')
    this.player.setScale(0.38)
    this.player.setDepth(5)

    this.enemy = this.add.sprite(L.enemyX, L.enemyY, 'map-battle-enemy')
    this.enemy.setScale(0.34)
    this.enemy.setDepth(5)

    this.shield = this.add
      .text(0, 0, '🛡️', { fontSize: '56px' })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(20)

    this.playerNameLabel = this.add
      .text(L.playerX, L.playerY - 72, s.playerName, { fontSize: '14px', color: '#a7f3d0' })
      .setOrigin(0.5)
      .setDepth(15)
    this.enemyNameLabel = this.add
      .text(L.enemyX, L.enemyY - 72, s.enemyName, { fontSize: '14px', color: '#fecaca' })
      .setOrigin(0.5)
      .setDepth(15)
  }

  private spawnFloatText(text: string, worldX: number, worldY: number, color: string): void {
    const t = this.add
      .text(worldX, worldY, text, {
        fontSize: '22px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(100)
    this.tweens.add({
      targets: t,
      y: worldY - 56,
      alpha: 0,
      duration: 780,
      ease: 'Sine.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  private processNewFloats(state: MapBattleVisualState): void {
    for (const f of state.floatTexts) {
      if (this.processedFloatIds.has(f.id)) continue
      this.processedFloatIds.add(f.id)
      const isHeal = f.text.startsWith('+')
      const color = isHeal ? '#86efac' : f.side === 'left' ? '#fcd34d' : '#fca5a5'
      const x = f.side === 'left' ? state.mapLayout.playerX : state.mapLayout.enemyX
      const y = f.side === 'left' ? state.mapLayout.playerY - 28 : state.mapLayout.enemyY - 28
      this.spawnFloatText(f.text, x, y, color)
    }
    if (state.floatTexts.length === 0) this.processedFloatIds.clear()
  }

  private flashSprite(sprite: Phaser.GameObjects.Sprite, duration = 140): void {
    sprite.setTint(0xffffff)
    this.time.delayedCall(duration, () => sprite.clearTint())
  }

  private lightFx(kind: BattleFxKind, state: MapBattleVisualState): void {
    if (kind === 'none') return
    if (kind === 'player-hit') {
      this.flashSprite(this.player)
      return
    }
    if (kind === 'enemy-hit' || kind === 'player-skill-offense') {
      this.flashSprite(this.enemy)
      return
    }
    if (kind === 'player-skill-support') {
      this.player.setTint(0xa5f3fc)
      this.time.delayedCall(160, () => this.player.clearTint())
    }
  }

  private syncFx(state: MapBattleVisualState): void {
    if (state.battleFx === this.lastBattleFx) return
    if (state.battleFx === 'none') {
      this.lastBattleFx = 'none'
      return
    }
    this.lightFx(state.battleFx, state)
    this.lastBattleFx = state.battleFx
  }

  private syncShield(state: MapBattleVisualState): void {
    if (state.isDefending) {
      this.shield.setAlpha(0.55)
      this.shield.setPosition(this.player.x, this.player.y)
    } else {
      this.shield.setAlpha(0)
    }
  }

  private syncLayout(state: MapBattleVisualState): void {
    const L = state.mapLayout
    this.player.setPosition(L.playerX, L.playerY)
    this.enemy.setPosition(L.enemyX, L.enemyY)
    this.playerNameLabel.setText(state.playerName || 'Player')
    this.enemyNameLabel.setText(state.enemyName || 'Enemy')
    this.playerNameLabel.setPosition(L.playerX, L.playerY - 72)
    this.enemyNameLabel.setPosition(L.enemyX, L.enemyY - 72)
  }

  private handleDeath(state: MapBattleVisualState): void {
    if (state.enemyHP <= 0 && !this.enemyDeathPlayed) {
      this.enemyDeathPlayed = true
      this.tweens.add({
        targets: this.enemy,
        alpha: 0,
        scale: this.enemy.scale * 0.4,
        duration: 480,
        ease: 'Cubic.easeIn',
        onComplete: () => this.enemy.setVisible(false),
      })
      this.enemyNameLabel.setVisible(false)
    }
    if (state.isGameOver && state.battleResult === 'lose' && !this.playerDeathPlayed) {
      this.playerDeathPlayed = true
      this.tweens.add({
        targets: this.player,
        alpha: 0.35,
        scale: this.player.scale * 0.72,
        duration: 560,
        ease: 'Cubic.easeIn',
      })
      this.playerNameLabel.setVisible(false)
    }
  }

  update(): void {
    const state = this.getState()
    this.syncLayout(state)
    this.processNewFloats(state)
    this.syncFx(state)
    this.syncShield(state)
    this.handleDeath(state)
  }
}
