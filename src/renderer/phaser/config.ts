import Phaser from 'phaser';

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  scene: [], // 手动启动场景并传递数据
  physics: {
    default: 'arcade',
    arcade: {
      debug: true,
    },
  },
  seed: [12345],
};
