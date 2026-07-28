import * as Phaser from 'phaser'
import { EmberNullScene } from './EmberNullScene'
import { VIEW } from './content'
import type { ControlMode, SkillId } from './types'

export type EmberGameApi = {
  destroy: () => void
  start: () => void
  restart: () => void
  move: (x: number, y: number) => void
  aim: (x: number, y: number) => void
  shoot: (pressed: boolean) => void
  skill: (skill: SkillId) => void
  mode: (mode: ControlMode) => void
}

export function createEmberNullGame(parent: HTMLElement): EmberGameApi {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW.width,
    height: VIEW.height,
    backgroundColor: '#03060a',
    antialias: true,
    render: { roundPixels: false, antialiasGL: true },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    input: { gamepad: true },
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: VIEW.width,
      height: VIEW.height,
    },
    scene: [EmberNullScene],
    audio: { disableWebAudio: false },
  })

  const scene = () => game.scene.getScene('EmberNull') as EmberNullScene
  return {
    destroy: () => game.destroy(true),
    start: () => scene().startRun(),
    restart: () => scene().restartRun(),
    move: (x, y) => scene().setVirtualMove(x, y),
    aim: (x, y) => scene().setVirtualAim(x, y),
    shoot: (pressed) => scene().setVirtualShoot(pressed),
    skill: (skill) => scene().activateSkill(skill),
    mode: (mode) => scene().setControlMode(mode),
  }
}
