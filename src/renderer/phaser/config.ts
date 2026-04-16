import * as Phaser from 'phaser';

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1600,
  height: 900,
  backgroundColor: '#1a1a2e',
  scene: [],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
};
