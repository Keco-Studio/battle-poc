import * as Phaser from 'phaser'

import {
  buildV3AssetCatalog,
  characterTextureKey,
  mapTextureKey,
  queueV3Assets,
  registerV3Animations,
  skillFxAnimationKey,
  skillFxTextureKey,
} from './assetLoader'
import {
  V3_BATTLE_LAYOUT,
  V3_EXPLORE_LAYOUT,
  V3_STAGE_HEIGHT,
  V3_STAGE_WIDTH,
  animationKeyFor,
  characterIdFromVisualAsset,
  gridPointToWorld,
  worldPointToGrid,
  type V3BattleActorViewModel,
  type V3Direction,
  type V3MoveIntent,
  type V3ViewModel,
} from './viewModel'

export type V3SceneBridge = {
  getViewModel: () => V3ViewModel
  onMoveIntent: (intent: V3MoveIntent) => void
  onEncounter: (encounterId: string) => void
  onAnimationComplete: (eventId: string) => void
}

const keyDirections: Record<string, V3Direction> = {
  ArrowUp: 'n',
  KeyW: 'n',
  ArrowRight: 'e',
  KeyD: 'e',
  ArrowDown: 's',
  KeyS: 's',
  ArrowLeft: 'w',
  KeyA: 'w',
  KeyQ: 'nw',
  KeyE: 'ne',
  KeyZ: 'sw',
  KeyC: 'se',
}

type ActorSprite = {
  sprite: Phaser.Physics.Arcade.Sprite
  characterId: string
  facing: V3Direction
}

export class V3WorldScene extends Phaser.Scene {
  private bridge: V3SceneBridge
  private mapImage: Phaser.GameObjects.Image | null = null
  private grid: Phaser.GameObjects.Graphics | null = null
  private hpBars: Phaser.GameObjects.Graphics | null = null
  private actionLabel: Phaser.GameObjects.Text | null = null
  private player: ActorSprite | null = null
  private battleActors = new Map<string, ActorSprite>()
  private markerObjects: Phaser.GameObjects.GameObject[] = []
  private lastMapId = ''
  private lastPhase = ''
  private lastFxEventId = ''
  private lastEncounterId = ''

  constructor(bridge: V3SceneBridge) {
    super({ key: 'V3WorldScene' })
    this.bridge = bridge
  }

  preload(): void {
    queueV3Assets(this.load)
  }

  create(): void {
    this.physics.world.setBounds(0, 0, V3_STAGE_WIDTH, V3_STAGE_HEIGHT)
    this.cameras.main.setBounds(0, 0, V3_STAGE_WIDTH, V3_STAGE_HEIGHT)
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)')
    registerV3Animations(this.anims)

    for (const asset of buildV3AssetCatalog().characters.flatMap((character) => character.directions)) {
      this.textures.get(asset.textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST)
    }
    for (const skill of buildV3AssetCatalog().skills) {
      this.textures.get(skill.fxTextureKey).setFilter(Phaser.Textures.FilterMode.NEAREST)
      this.textures.get(skill.iconKey).setFilter(Phaser.Textures.FilterMode.NEAREST)
    }

    this.input.keyboard?.on('keydown', this.handleKeyDown, this)
    this.input.on('pointerdown', this.handlePointerDown, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleKeyDown, this)
      this.input.off('pointerdown', this.handlePointerDown, this)
    })
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const direction = keyDirections[event.code]
    if (!direction || this.bridge.getViewModel().phase !== 'explore') return
    event.preventDefault()
    this.bridge.onMoveIntent({ kind: 'direction', direction })
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.bridge.getViewModel().phase !== 'explore') return
    this.bridge.onMoveIntent({
      kind: 'target',
      to: worldPointToGrid({ x: pointer.worldX, y: pointer.worldY }, V3_EXPLORE_LAYOUT),
    })
  }

  private clearMarkers(): void {
    for (const object of this.markerObjects) object.destroy()
    this.markerObjects = []
  }

  private setMap(mapId: string, battle: boolean): void {
    if (this.lastMapId === mapId && this.lastPhase === (battle ? 'battle' : 'explore')) return
    this.lastMapId = mapId
    this.lastPhase = battle ? 'battle' : 'explore'
    this.mapImage?.destroy()
    this.grid?.destroy()
    this.clearMarkers()

    const layout = battle ? V3_BATTLE_LAYOUT : V3_EXPLORE_LAYOUT
    this.mapImage = this.add.image(
      layout.offsetX + layout.width / 2,
      layout.offsetY + layout.height / 2,
      mapTextureKey(mapId),
    )
    this.mapImage.setDisplaySize(layout.width, layout.height).setDepth(-20)

    this.grid = this.add.graphics().setDepth(-5)
    if (battle) {
      this.grid.lineStyle(1, 0xffffff, 0.16)
      const cellWidth = layout.width / layout.columns
      const cellHeight = layout.height / layout.rows
      for (let x = 0; x <= layout.columns; x += 1) {
        this.grid.lineBetween(layout.offsetX + x * cellWidth, 0, layout.offsetX + x * cellWidth, layout.height)
      }
      for (let y = 0; y <= layout.rows; y += 1) {
        this.grid.lineBetween(layout.offsetX, y * cellHeight, layout.offsetX + layout.width, y * cellHeight)
      }
    }
  }

  private createActor(
    visualAssetId: string,
    facing: V3Direction,
    position: { x: number; y: number },
    layout: typeof V3_EXPLORE_LAYOUT,
  ): ActorSprite {
    const characterId = characterIdFromVisualAsset(visualAssetId)
    const world = gridPointToWorld(position, layout)
    const sprite = this.physics.add.sprite(world.x, world.y, characterTextureKey(characterId, facing), 0)
    sprite.setCollideWorldBounds(true).setDepth(20)
    sprite.body?.setSize(28, 20).setOffset(18, 40)
    return { sprite, characterId, facing }
  }

  private playFacing(actor: ActorSprite, facing: V3Direction, moving: boolean): void {
    if (actor.facing !== facing) {
      actor.facing = facing
      actor.sprite.setTexture(characterTextureKey(actor.characterId, facing), 0)
    }
    if (moving) actor.sprite.play(animationKeyFor(actor.characterId, facing), true)
    else if (actor.sprite.anims.isPlaying) {
      actor.sprite.anims.stop()
      actor.sprite.setFrame(0)
    }
  }

  private moveSpriteTo(
    actor: ActorSprite,
    target: { x: number; y: number },
    facing: V3Direction,
    speed: number,
  ): boolean {
    const deltaX = target.x - actor.sprite.x
    const deltaY = target.y - actor.sprite.y
    const distance = Math.hypot(deltaX, deltaY)
    if (distance <= 3) {
      actor.sprite.body?.reset(target.x, target.y)
      this.playFacing(actor, facing, false)
      return true
    }
    actor.sprite.setVelocity((deltaX / distance) * speed, (deltaY / distance) * speed)
    this.playFacing(actor, facing, true)
    return false
  }

  private renderExplore(viewModel: V3ViewModel): void {
    const explore = viewModel.exploration
    this.setMap(explore.mapId, false)
    this.hpBars?.clear()
    this.actionLabel?.setVisible(false)
    for (const actor of this.battleActors.values()) actor.sprite.setVisible(false).setVelocity(0)

    if (!this.player || this.player.characterId !== characterIdFromVisualAsset(explore.playerVisualAssetId)) {
      this.player?.sprite.destroy()
      this.player = this.createActor(
        explore.playerVisualAssetId,
        explore.playerFacing,
        explore.playerPosition,
        V3_EXPLORE_LAYOUT,
      )
    }
    this.player.sprite.setVisible(true).setScale(1.15)
    const playerWorld = gridPointToWorld(explore.playerPosition, V3_EXPLORE_LAYOUT)
    const arrived = this.moveSpriteTo(this.player, playerWorld, explore.playerFacing, 260)

    if (this.markerObjects.length === 0) {
      const beaconWorld = gridPointToWorld(explore.safeBeacon, V3_EXPLORE_LAYOUT)
      const beacon = this.add.circle(beaconWorld.x, beaconWorld.y, 13, 0xffe66d, 0.8).setDepth(6)
      const beaconCore = this.add.circle(beaconWorld.x, beaconWorld.y, 5, 0xffffff, 1).setDepth(7)
      this.markerObjects.push(beacon, beaconCore)
      for (const encounter of explore.encounters) {
        const world = gridPointToWorld(encounter.position, V3_EXPLORE_LAYOUT)
        const color = encounter.cleared ? 0x79d98c : encounter.unlocked ? (encounter.boss ? 0xffd45a : 0x68ddf0) : 0x6f7891
        const marker = this.add.circle(world.x, world.y, encounter.boss ? 18 : 14, color, 0.9).setStrokeStyle(3, 0xffffff, 0.8).setDepth(8)
        const label = this.add.text(world.x, world.y - 25, encounter.name, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          backgroundColor: '#16233cdd',
          padding: { x: 6, y: 3 },
        }).setOrigin(0.5).setDepth(9)
        this.markerObjects.push(marker, label)
      }
      for (const pickup of explore.pickups.filter((item) => !item.collected)) {
        const world = gridPointToWorld(pickup.position, V3_EXPLORE_LAYOUT)
        this.markerObjects.push(this.add.star(world.x, world.y, 5, 5, 11, 0xfff176, 1).setDepth(8))
      }
    }

    if (arrived) {
      const encounter = explore.encounters.find((item) => item.unlocked && !item.cleared && item.position.x === explore.playerPosition.x && item.position.y === explore.playerPosition.y)
      if (encounter && encounter.id !== this.lastEncounterId) {
        this.lastEncounterId = encounter.id
        this.bridge.onEncounter(encounter.id)
      }
      if (!encounter) this.lastEncounterId = ''
    }
  }

  private actorForBattle(view: V3BattleActorViewModel): ActorSprite {
    const existing = this.battleActors.get(view.id)
    const characterId = characterIdFromVisualAsset(view.visualAssetId)
    if (existing?.characterId === characterId) return existing
    existing?.sprite.destroy()
    const actor = this.createActor(view.visualAssetId, view.facing, view.position, V3_BATTLE_LAYOUT)
    actor.sprite.setScale(1.05)
    this.battleActors.set(view.id, actor)
    return actor
  }

  private drawBattleOverlay(viewModel: NonNullable<V3ViewModel['battle']>): void {
    this.hpBars ??= this.add.graphics().setDepth(35)
    this.hpBars.clear()
    for (const point of viewModel.obstacles) {
      const world = gridPointToWorld(point, V3_BATTLE_LAYOUT)
      this.hpBars.fillStyle(0x20385c, 0.68).fillRect(world.x - 18, world.y - 18, 36, 36)
      this.hpBars.lineStyle(2, 0x9ce6c2, 0.7).strokeRect(world.x - 18, world.y - 18, 36, 36)
    }
    for (const actor of Object.values(viewModel.actors)) {
      const world = gridPointToWorld(actor.position, V3_BATTLE_LAYOUT)
      const ratio = Math.max(0, Math.min(1, actor.hp / actor.maxHp))
      this.hpBars.fillStyle(0x102039, 0.95).fillRect(world.x - 28, world.y - 39, 56, 7)
      this.hpBars.fillStyle(actor.id === 'left' ? 0x71e59b : 0xff7b6f, 1).fillRect(world.x - 27, world.y - 38, 54 * ratio, 5)
      if (actor.shield > 0) this.hpBars.lineStyle(2, 0x72ddff, 0.9).strokeCircle(world.x, world.y, 30)
      if (actor.path.length > 1) {
        this.hpBars.lineStyle(3, actor.id === 'left' ? 0xffdc72 : 0xff9f92, 0.65)
        for (let index = 1; index < actor.path.length; index += 1) {
          const from = gridPointToWorld(actor.path[index - 1], V3_BATTLE_LAYOUT)
          const to = gridPointToWorld(actor.path[index], V3_BATTLE_LAYOUT)
          this.hpBars.lineBetween(from.x, from.y, to.x, to.y)
        }
      }
    }
  }

  private playBattleFx(viewModel: NonNullable<V3ViewModel['battle']>): void {
    const event = viewModel.activeEvent
    if (!event || event.id === this.lastFxEventId || !event.skillId) return
    this.lastFxEventId = event.id
    const target = event.targetId ? viewModel.actors[event.targetId] : event.actorId ? viewModel.actors[event.actorId] : null
    const position = event.position ?? target?.position
    if (!position) return
    const world = gridPointToWorld(position, V3_BATTLE_LAYOUT)
    const fx = this.add.sprite(world.x, world.y, skillFxTextureKey(event.skillId), 0).setScale(1.65).setDepth(45)
    fx.play(skillFxAnimationKey(event.skillId))
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      fx.destroy()
      this.bridge.onAnimationComplete(event.id)
    })
  }

  private renderBattle(viewModel: V3ViewModel): void {
    const battle = viewModel.battle
    if (!battle) return
    this.setMap(battle.mapId, true)
    this.player?.sprite.setVisible(false).setVelocity(0)
    for (const actorView of Object.values(battle.actors)) {
      const actor = this.actorForBattle(actorView)
      actor.sprite.setVisible(true)
      const world = gridPointToWorld(actorView.position, V3_BATTLE_LAYOUT)
      this.moveSpriteTo(actor, world, actorView.facing, 360 * battle.speed)
    }
    this.drawBattleOverlay(battle)
    this.actionLabel ??= this.add.text(V3_STAGE_WIDTH / 2, 18, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#fff8d6',
      backgroundColor: '#13213ee6',
      padding: { x: 12, y: 7 },
    }).setOrigin(0.5, 0).setDepth(60)
    this.actionLabel.setVisible(true).setText(battle.activeActionLabel || '等待下一行动')
    if (battle.paused) this.anims.pauseAll()
    else {
      this.anims.resumeAll()
      this.anims.globalTimeScale = battle.speed
      this.playBattleFx(battle)
    }
  }

  update(): void {
    const viewModel = this.bridge.getViewModel()
    if (viewModel.phase === 'battle' || viewModel.phase === 'report') this.renderBattle(viewModel)
    else this.renderExplore(viewModel)
  }
}
