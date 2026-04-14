import Phaser from 'phaser';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    // Background
    this.add.rectangle(400, 300, 800, 600, 0x1a1a2e);

    // Title
    this.add.text(400, 50, 'Battle Arena', {
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Placeholder for actors (will be expanded later)
    this.add.text(400, 300, 'Press SPACE to start battle', {
      fontSize: '20px',
      color: '#888888',
    }).setOrigin(0.5);
  }
}