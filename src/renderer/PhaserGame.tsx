'use client';

import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { GAME_CONFIG } from './phaser/config';
import { BattleScene } from './phaser/BattleScene';
import type { BattleVisualState } from './phaser/battleVisualTypes';

const DEMO_STATE: BattleVisualState = {
  playerName: 'Hero',
  enemyName: 'Slime',
  playerHP: 100,
  playerMaxHp: 100,
  enemyHP: 30,
  enemyMaxHp: 30,
  isDefending: false,
  battleFx: 'none',
  heavyStrikePlaying: false,
  isGameOver: false,
  battleResult: null,
  floatTexts: [],
};

export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<BattleVisualState>(DEMO_STATE);

  useEffect(() => {
    if (!gameRef.current && containerRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        ...GAME_CONFIG,
        parent: containerRef.current,
      };
      gameRef.current = new Phaser.Game(config);

      gameRef.current.events.once('ready', () => {
        if (gameRef.current) {
          const battleScene = new BattleScene();
          gameRef.current.scene.add('BattleScene', battleScene, true, {
            getState: () => stateRef.current,
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
      className="outline-none cursor-default select-none w-[1600px] h-[900px]"
      onPointerDown={(e) => {
        e.currentTarget.focus({ preventScroll: true });
      }}
    />
  );
}
