'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GAME_CONFIG } from './phaser/config';
import { BattleScene } from './phaser/BattleScene';
import type { CombatActor } from './engine/combat/CombatTypes';

// 临时测试数据
const TEST_PLAYER: CombatActor = {
  id: 'player',
  name: 'Hero',
  side: 'player',
  stats: { hp: 100, maxHp: 100, attack: 15, defense: 5, speed: 10, luck: 5 },
  statusEffects: [],
};

const TEST_ENEMY: CombatActor = {
  id: 'slime',
  name: 'Slime',
  side: 'enemy',
  stats: { hp: 30, maxHp: 30, attack: 8, defense: 2, speed: 3, luck: 0 },
  statusEffects: [],
};

export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameRef.current && containerRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        ...GAME_CONFIG,
        parent: containerRef.current,
      };
      gameRef.current = new Phaser.Game(config);

      // 场景加载后启动并传递数据
      gameRef.current.events.once('ready', () => {
        if (gameRef.current) {
          const battleScene = new BattleScene();
          gameRef.current.scene.add('BattleScene', battleScene, true, {
            player: TEST_PLAYER,
            enemies: [TEST_ENEMY],
          });
        }
      });
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="game-container"
      tabIndex={0}
      role="application"
      aria-label="Battle game canvas"
      className="outline-none cursor-default select-none"
      onPointerDown={(e) => {
        e.currentTarget.focus({ preventScroll: true });
      }}
    />
  );
}
