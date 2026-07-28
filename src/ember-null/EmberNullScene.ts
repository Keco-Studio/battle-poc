import * as Phaser from 'phaser'
import { ASSETS, ENEMIES, TACTIC_LABELS, VIEW, WAVE_LABELS, WORLD } from './content'
import { TacticalDirector } from './TacticalDirector'
import {
  EMBER_HUD_EVENT,
  type ControlMode,
  type EmberHudState,
  type EnemyKind,
  type PlayerDirective,
  type SkillId,
  type Tactic,
} from './types'

type EnemyUnit = {
  id: number
  kind: EnemyKind
  sprite: Phaser.Physics.Arcade.Sprite
  shadow: Phaser.GameObjects.Ellipse
  hp: number
  maxHp: number
  attackAt: number
  bornAt: number
  burnedUntil: number
  frozenUntil: number
  burnTickAt: number
  armor: number
  phase: number
  facing: -1 | 1
  actionUntil: number
  hitFlashUntil: number
}

type Projectile = {
  image: Phaser.GameObjects.Image
  vx: number
  vy: number
  damage: number
  life: number
  radius: number
}

type Telegraph = {
  graphics: Phaser.GameObjects.Graphics
  x: number
  y: number
  radius: number
  expiresAt: number
  damage: number
  owner: EnemyUnit
  dashScored: boolean
  kind: 'burst' | 'zone'
}

type VirtualInput = {
  x: number
  y: number
  aimX: number
  aimY: number
  shoot: boolean
}

const clamp01 = (value: number) => Phaser.Math.Clamp(value, 0, 1)

export class EmberNullScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private playerShadow!: Phaser.GameObjects.Ellipse
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'Q' | 'E' | 'R' | 'SPACE' | 'J' | 'P', Phaser.Input.Keyboard.Key>
  private enemies: EnemyUnit[] = []
  private projectiles: Projectile[] = []
  private telegraphs: Telegraph[] = []
  private director = new TacticalDirector()
  private tactic: Tactic = 'pressure'
  private tacticReason = 'Awaiting live tactical signal.'
  private tacticSource: EmberHudState['tacticSource'] = 'connecting'
  private controlMode: ControlMode = 'llm'
  private pilot: PlayerDirective = {
    intent: 'engage',
    movement: 'orbit-left',
    action: 'fire',
    target: 'nearest',
    reason: 'Awaiting MiniMax pilot directive.',
  }
  private pilotSource: EmberHudState['pilotSource'] = 'connecting'
  private pilotActionConsumed = false
  private pilotTargetId: number | null = null
  private pilotVelocity = new Phaser.Math.Vector2()
  private directorAt = 0
  private phase: EmberHudState['phase'] = 'briefing'
  private hp = 100
  private overload = 0
  private score = 0
  private combo = 0
  private wave = 0
  private enemySerial = 0
  private lastShotAt = 0
  private lastDamageAt = 0
  private recentDamage = 0
  private wavePending = false
  private invulnerableUntil = 0
  private dashingUntil = 0
  private dashVector = new Phaser.Math.Vector2(1, 0)
  private aimVector = new Phaser.Math.Vector2(1, 0)
  private cooldownReady: Record<SkillId, number> = { cinder: 0, frost: 0, dash: 0, overload: 0 }
  private virtual: VirtualInput = { x: 0, y: 0, aimX: 0, aimY: 0, shoot: false }
  private hudAt = 0
  private music?: Phaser.Sound.BaseSound
  private bossBar?: Phaser.GameObjects.Graphics
  private enemyBars?: Phaser.GameObjects.Graphics
  private pausedByVisibility = false
  private runToken = 0
  private autoStartOnCreate = false
  private playerFacing: -1 | 1 = 1
  private playerPoseUntil = 0

  init(data?: { autoStart?: boolean; controlMode?: ControlMode }) {
    this.autoStartOnCreate = Boolean(data?.autoStart)
    if (data?.controlMode) this.controlMode = data.controlMode
    this.enemies = []
    this.projectiles = []
    this.telegraphs = []
    this.music = undefined
  }

  constructor() {
    super('EmberNull')
  }

  preload() {
    this.load.image('arena', ASSETS.arena)
    this.load.image('hero', ASSETS.hero)
    this.load.spritesheet('hero-move', ASSETS.heroMove, { frameWidth: 256, frameHeight: 256 })
    this.load.image('cinder', ASSETS.cinder)
    this.load.spritesheet('cinder-move', ASSETS.cinderMove, { frameWidth: 256, frameHeight: 256 })
    this.load.image('husk', ASSETS.husk)
    this.load.spritesheet('husk-move', ASSETS.huskMove, { frameWidth: 256, frameHeight: 256 })
    this.load.image('revenant', ASSETS.revenant)
    this.load.spritesheet('revenant-move', ASSETS.revenantMove, { frameWidth: 256, frameHeight: 256 })
    this.load.image('boss', ASSETS.boss)
    this.load.spritesheet('boss-move', ASSETS.bossMove, { frameWidth: 256, frameHeight: 256 })
    this.load.image('bolt-fx', ASSETS.boltFx)
    this.load.image('cinder-fx', ASSETS.cinderFx)
    this.load.image('frost-fx', ASSETS.frostFx)
    this.load.image('overload-fx', ASSETS.overloadFx)
    this.load.audio('music', ASSETS.music)
    this.load.audio('bolt-sfx', ASSETS.boltSfx)
    this.load.audio('dash-sfx', ASSETS.dashSfx)
    this.load.audio('shock-sfx', ASSETS.shockSfx)
    this.load.audio('impact-sfx', ASSETS.impactSfx)
    this.load.audio('boss-sfx', ASSETS.bossSfx)
  }

  create() {
    for (const texture of ['hero-move', 'cinder-move', 'husk-move', 'revenant-move', 'boss-move']) {
      this.textures.get(texture).setFilter(Phaser.Textures.FilterMode.NEAREST)
    }
    this.createMotionAnimations()
    this.physics.world.setBounds(90, 82, WORLD.width - 180, WORLD.height - 164)
    this.add.image(WORLD.width / 2, WORLD.height / 2, 'arena').setDisplaySize(WORLD.width, WORLD.height)
    this.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0x02050b, 0.14)

    this.drawTraversableFloor()

    const scan = this.add.graphics().setDepth(2)
    scan.lineStyle(1, 0x43f3e8, 0.08)
    for (let x = 180; x < WORLD.width - 100; x += 96) scan.lineBetween(x, 120, x - 190, WORLD.height - 120)

    this.playerShadow = this.add.ellipse(WORLD.width / 2, WORLD.height / 2 + 29, 92, 32, 0x000000, 0.5).setDepth(8)
    this.player = this.physics.add.sprite(WORLD.width / 2, WORLD.height / 2, 'hero-move', 0).setScale(0.45).setDepth(10)
    this.player.setCircle(67, 61, 69).setCollideWorldBounds(true)
    this.player.setData('role', 'player')
    this.player.setData('testX', WORLD.width / 2)
    this.player.setData('testY', WORLD.height / 2)

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cameras.main.centerOn(this.player.x, this.player.y)
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09)

    this.bossBar = this.add.graphics().setDepth(40).setScrollFactor(0)
    this.enemyBars = this.add.graphics().setDepth(31)
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,Q,E,R,SPACE,J,P') as typeof this.keys
    this.input.keyboard!.on('keydown-Q', () => { if (this.controlMode === 'human') this.castCinder() })
    this.input.keyboard!.on('keydown-E', () => { if (this.controlMode === 'human') this.castFrost() })
    this.input.keyboard!.on('keydown-SPACE', () => { if (this.controlMode === 'human') this.phaseDash() })
    this.input.keyboard!.on('keydown-R', () => { if (this.controlMode === 'human') this.castOverload() })
    this.input.keyboard!.on('keydown-P', () => {
      if (this.phase === 'combat') this.spawnBossWave(true)
    })
    this.input.on('pointerdown', () => {
      if (this.phase === 'combat' && this.controlMode === 'human') this.fireBolt()
    })

    document.addEventListener('visibilitychange', this.onVisibility)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', this.onVisibility)
      this.director.cancel()
    })
    this.emitHud(true)
    if (this.autoStartOnCreate) this.time.delayedCall(0, () => this.startRun())
  }

  private createMotionAnimations() {
    const animations = [
      { key: 'hero-move-loop', texture: 'hero-move', frameRate: 12 },
      { key: 'cinder-move-loop', texture: 'cinder-move', frameRate: 12 },
      { key: 'husk-move-loop', texture: 'husk-move', frameRate: 9 },
      { key: 'revenant-move-loop', texture: 'revenant-move', frameRate: 11 },
      { key: 'boss-move-loop', texture: 'boss-move', frameRate: 8 },
    ]
    for (const animation of animations) {
      if (this.anims.exists(animation.key)) continue
      this.anims.create({
        key: animation.key,
        frames: this.anims.generateFrameNumbers(animation.texture, { start: 0, end: 7 }),
        frameRate: animation.frameRate,
        repeat: -1,
      })
    }
  }

  private drawTraversableFloor() {
    const floor = this.add.graphics().setDepth(1)
    const points = [
      new Phaser.Geom.Point(120, 310),
      new Phaser.Geom.Point(390, 86),
      new Phaser.Geom.Point(WORLD.width - 390, 86),
      new Phaser.Geom.Point(WORLD.width - 120, 310),
      new Phaser.Geom.Point(WORLD.width - 120, WORLD.height - 310),
      new Phaser.Geom.Point(WORLD.width - 390, WORLD.height - 86),
      new Phaser.Geom.Point(390, WORLD.height - 86),
      new Phaser.Geom.Point(120, WORLD.height - 310),
    ]
    floor.fillStyle(0x10191d, 0.86).fillPoints(points, true)
    floor.lineStyle(7, 0x071013, 0.92).strokePoints(points, true)
    floor.lineStyle(2, 0x52e8dc, 0.42).strokePoints(points.map((point) => new Phaser.Geom.Point(
      Phaser.Math.Linear(point.x, WORLD.width / 2, 0.035),
      Phaser.Math.Linear(point.y, WORLD.height / 2, 0.035),
    )), true)

    floor.lineStyle(2, 0x4ce7dd, 0.17)
    for (let x = 270; x < WORLD.width - 200; x += 180) floor.lineBetween(x, 130, x - 250, WORLD.height - 130)
    floor.lineStyle(1, 0xff4f8b, 0.16)
    for (let y = 210; y < WORLD.height - 150; y += 170) floor.lineBetween(175, y, WORLD.width - 175, y)

    floor.lineStyle(5, 0x51fff0, 0.22)
    floor.strokeCircle(WORLD.width / 2, WORLD.height / 2, 330)
    floor.lineStyle(2, 0xff4b88, 0.34)
    floor.strokeCircle(WORLD.width / 2, WORLD.height / 2, 240)
    floor.fillStyle(0x5affec, 0.14).fillCircle(WORLD.width / 2, WORLD.height / 2, 54)
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4
      const x = WORLD.width / 2 + Math.cos(angle) * 450
      const y = WORLD.height / 2 + Math.sin(angle) * 330
      floor.fillStyle(index % 2 ? 0xff4f86 : 0x64fff0, 0.28).fillCircle(x, y, 10)
      floor.lineStyle(2, index % 2 ? 0xff4f86 : 0x64fff0, 0.22).strokeCircle(x, y, 34)
    }
  }

  private onVisibility = () => {
    if (document.hidden && !this.scene.isPaused()) {
      this.pausedByVisibility = true
      this.scene.pause()
      this.music?.pause()
    } else if (!document.hidden && this.pausedByVisibility) {
      this.pausedByVisibility = false
      this.scene.resume()
      this.music?.resume()
    }
  }

  startRun() {
    this.runToken += 1
    this.clearRunObjects()
    this.phase = 'combat'
    this.hp = 100
    this.overload = 0
    this.score = 0
    this.combo = 0
    this.wave = 0
    this.tactic = 'pressure'
    this.tacticSource = 'connecting'
    this.tacticReason = 'MiniMax is reading the combat state.'
    this.pilot = {
      intent: 'engage', movement: 'orbit-left', action: 'fire', target: 'nearest', reason: 'MiniMax is taking control.',
    }
    this.pilotSource = 'connecting'
    this.pilotActionConsumed = false
    this.pilotTargetId = null
    this.pilotVelocity.set(0, 0)
    this.recentDamage = 0
    this.lastShotAt = 0
    this.lastDamageAt = 0
    this.invulnerableUntil = 0
    this.dashingUntil = 0
    this.directorAt = 0
    this.playerFacing = 1
    this.playerPoseUntil = 0
    this.cooldownReady = { cinder: 0, frost: 0, dash: 0, overload: 0 }
    this.wavePending = true
    this.cameras.main.resetFX()
    this.cameras.main.setAlpha(1)
    this.player.setPosition(WORLD.width / 2, WORLD.height / 2 + 80).setAlpha(1).setScale(0.45).clearTint()
    this.player.stop().setFrame(0)
    this.playerShadow.setPosition(this.player.x, this.player.y + 31).setVisible(true)
    this.player.body!.enable = true
    this.physics.world.resume()
    if (!this.music) this.music = this.sound.add('music', { loop: true, volume: 0.3 })
    if (!this.music.isPlaying) this.music.play()
    this.flashTitle('BREACH THE RELAY', 'Burn. Freeze. Fracture.')
    this.advanceWave()
    this.emitHud(true)
  }

  restartRun() {
    this.sound.stopAll()
    this.director.cancel()
    this.scene.restart({ autoStart: true, controlMode: this.controlMode })
  }

  setVirtualMove(x: number, y: number) {
    this.virtual.x = Phaser.Math.Clamp(x, -1, 1)
    this.virtual.y = Phaser.Math.Clamp(y, -1, 1)
  }

  setVirtualAim(x: number, y: number) {
    this.virtual.aimX = Phaser.Math.Clamp(x, -1, 1)
    this.virtual.aimY = Phaser.Math.Clamp(y, -1, 1)
  }

  setVirtualShoot(pressed: boolean) {
    if (this.controlMode !== 'human') return
    this.virtual.shoot = pressed
    if (pressed) this.fireBolt()
  }

  activateSkill(skill: SkillId) {
    if (this.controlMode !== 'human') return
    if (skill === 'cinder') this.castCinder()
    else if (skill === 'frost') this.castFrost()
    else if (skill === 'dash') this.phaseDash()
    else this.castOverload()
  }

  setControlMode(mode: ControlMode) {
    this.controlMode = mode
    this.virtual = { x: 0, y: 0, aimX: 0, aimY: 0, shoot: false }
    this.pilotTargetId = null
    this.pilotVelocity.set(0, 0)
    this.player.setVelocity(0)
    this.floatingText(
      this.player.x,
      this.player.y - 72,
      mode === 'llm' ? 'MINIMAX PILOT ONLINE' : 'MANUAL CONTROL',
      mode === 'llm' ? '#70fff1' : '#ffffff',
      18,
    )
    this.emitHud(true)
  }

  update(time: number, delta: number) {
    if (this.phase !== 'combat') return
    const dt = Math.min(delta, 34) / 1000
    if (this.controlMode === 'llm') this.updateLlmPilot(time, dt)
    else this.updateAim()
    this.updatePlayer(time)
    this.updateProjectiles(dt)
    this.updateEnemies(time, dt)
    this.updateTelegraphs(time)
    this.checkWave(time)
    this.updateDirector(time)
    this.drawBossBar()
    this.drawEnemyBars()
    if (time >= this.hudAt) this.emitHud()
  }

  private updateAim() {
    const gamepad = this.input.gamepad?.gamepads.find(Boolean)
    const rightX = gamepad?.rightStick.x ?? 0
    const rightY = gamepad?.rightStick.y ?? 0
    if (Math.hypot(rightX, rightY) > 0.25) {
      this.aimVector.set(rightX, rightY).normalize()
    } else if (Math.hypot(this.virtual.aimX, this.virtual.aimY) > 0.2) {
      this.aimVector.set(this.virtual.aimX, this.virtual.aimY).normalize()
    } else if (!this.sys.game.device.input.touch) {
      this.aimVector.set(this.input.activePointer.worldX - this.player.x, this.input.activePointer.worldY - this.player.y)
      if (this.aimVector.lengthSq() > 1) this.aimVector.normalize()
    } else {
      const target = this.nearestEnemy()
      if (target) this.aimVector.set(target.sprite.x - this.player.x, target.sprite.y - this.player.y).normalize()
    }
    this.updatePlayerFacing(this.aimVector.x)
    const pointerFire = this.input.activePointer.isDown
    if (pointerFire || this.keys.J.isDown || this.virtual.shoot || gamepad?.A) this.fireBolt()
    if (gamepad?.buttons[2]?.pressed) this.castCinder()
    if (gamepad?.buttons[3]?.pressed) this.castFrost()
    if (gamepad?.buttons[1]?.pressed) this.phaseDash()
    if (gamepad?.buttons[5]?.pressed) this.castOverload()
  }

  private updateLlmPilot(time: number, dt: number) {
    const target = this.pilotTarget()
    if (!target) {
      this.pilotVelocity.scale(Math.max(0, 1 - dt * 9))
      this.player.setVelocity(this.pilotVelocity.x, this.pilotVelocity.y)
      return
    }
    const toward = new Phaser.Math.Vector2(target.sprite.x - this.player.x, target.sprite.y - this.player.y)
    const distance = Math.max(1, toward.length())
    toward.normalize()
    this.aimVector.copy(toward)
    this.updatePlayerFacing(this.aimVector.x)

    if (this.pilot.action === 'fire' || this.pilot.intent === 'engage' || this.pilot.intent === 'kite') {
      this.fireBolt()
    }
    if (!this.pilotActionConsumed) {
      this.pilotActionConsumed = true
      if (this.pilot.action === 'cinder') this.castCinder()
      else if (this.pilot.action === 'frost') this.castFrost()
      else if (this.pilot.action === 'dash') this.phaseDash(toward)
      else if (this.pilot.action === 'overload') this.castOverload()
    }

    const danger = this.telegraphs.find((telegraph) =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, telegraph.x, telegraph.y) < telegraph.radius + 45,
    )
    if (danger && time >= this.cooldownReady.dash) {
      const escape = new Phaser.Math.Vector2(this.player.x - danger.x, this.player.y - danger.y)
      if (escape.lengthSq() < 1) escape.set(-toward.y, toward.x)
      this.phaseDash(escape.normalize())
    }

    if (time < this.dashingUntil) return
    const preferredRange = target.kind === 'boss' ? 270 : 220
    const rangeError = distance - preferredRange
    const tangentSide = this.pilot.movement === 'orbit-right' ? -1 : 1
    const tangent = new Phaser.Math.Vector2(-toward.y * tangentSide, toward.x * tangentSide)
    const movement = new Phaser.Math.Vector2()

    if (this.pilot.movement === 'away') {
      movement.copy(toward).scale(-1)
    } else if (this.pilot.movement === 'hold') {
      if (distance < preferredRange - 38) movement.copy(toward).scale(-1)
    } else if (this.pilot.movement === 'orbit-left' || this.pilot.movement === 'orbit-right') {
      movement.copy(tangent)
      movement.add(toward.clone().scale(Phaser.Math.Clamp(rangeError / 105, -1.15, 1.15)))
    } else if (rangeError > 30) {
      movement.copy(toward)
    } else if (rangeError < -32) {
      movement.copy(toward).scale(-1)
    } else {
      movement.copy(tangent).scale(0.72)
    }

    if (distance < 145) {
      movement.copy(toward).scale(-1.35).add(tangent.scale(0.45))
    }
    if (movement.lengthSq() > 1) movement.normalize()
    const desiredSpeed = movement.lengthSq() < 0.01 ? 0 : 250
    movement.scale(desiredSpeed)
    const blend = 1 - Math.exp(-dt * 9)
    this.pilotVelocity.lerp(movement, blend)
    if (this.pilotVelocity.lengthSq() < 9) this.pilotVelocity.set(0, 0)
    this.player.setVelocity(this.pilotVelocity.x, this.pilotVelocity.y)
  }

  private pilotTarget() {
    const locked = this.pilotTargetId == null
      ? undefined
      : this.enemies.find((enemy) => enemy.id === this.pilotTargetId && enemy.hp > 0 && enemy.sprite.active)
    if (locked) return locked

    let target: EnemyUnit | undefined
    if (this.pilot.target === 'boss') {
      const boss = this.enemies.find((enemy) => enemy.kind === 'boss')
      if (boss) target = boss
    }
    if (!target && this.pilot.target === 'weakest') {
      target = [...this.enemies].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
    }
    if (!target) target = this.nearestEnemy()
    this.pilotTargetId = target?.id ?? null
    return target
  }

  private updatePlayer(time: number) {
    if (time < this.dashingUntil) {
      this.player.anims.play('hero-move-loop', true)
      this.player.anims.timeScale = 1.65
      this.player.setVelocity(this.dashVector.x * 720, this.dashVector.y * 720)
      if (Phaser.Math.Between(0, 2) === 0) {
        const ghost = this.add.image(this.player.x, this.player.y, 'hero-move', this.player.frame.name)
          .setScale(this.player.scaleX, this.player.scaleY)
          .setFlipX(this.player.flipX)
          .setTint(0x50f5e7)
          .setAlpha(0.36)
          .setDepth(9)
        this.tweens.add({ targets: ghost, alpha: 0, scaleX: 0.25, scaleY: 0.25, duration: 230, onComplete: () => ghost.destroy() })
      }
    } else {
      this.player.anims.timeScale = 1
      const movement = this.controlMode === 'llm'
        ? new Phaser.Math.Vector2(
          (this.player.body as Phaser.Physics.Arcade.Body).velocity.x,
          (this.player.body as Phaser.Physics.Arcade.Body).velocity.y,
        )
        : this.readHumanMovement()
      if (movement.lengthSq() > 1) movement.normalize()
      if (this.controlMode === 'human') this.player.setVelocity(movement.x * 260, movement.y * 260)
      if (time < this.playerPoseUntil) {
        this.player.anims.pause()
        this.player.rotation = Phaser.Math.Linear(this.player.rotation, -this.aimVector.x * 0.09, 0.2)
      } else if (movement.lengthSq() > 0.05) {
        this.player.anims.resume()
        this.player.anims.play('hero-move-loop', true)
        this.player.rotation = Phaser.Math.Linear(this.player.rotation, 0, 0.24)
        this.player.setScale(0.45)
      } else {
        this.player.anims.stop()
        this.player.setFrame(0)
        this.player.rotation = Math.sin(time * 0.003) * 0.018
        this.player.setScale(0.45 + Math.sin(time * 0.004) * 0.007)
      }
    }
    this.playerShadow.setPosition(this.player.x, this.player.y + 29)
    this.player.setData('testX', Math.round(this.player.x))
    this.player.setData('testY', Math.round(this.player.y))
  }

  private readHumanMovement() {
    const gamepad = this.input.gamepad?.gamepads.find(Boolean)
    let x = Number(this.keys.D.isDown) - Number(this.keys.A.isDown)
    let y = Number(this.keys.S.isDown) - Number(this.keys.W.isDown)
    if (Math.hypot(gamepad?.leftStick.x ?? 0, gamepad?.leftStick.y ?? 0) > 0.2) {
      x = gamepad!.leftStick.x
      y = gamepad!.leftStick.y
    } else if (Math.hypot(this.virtual.x, this.virtual.y) > 0.1) {
      x = this.virtual.x
      y = this.virtual.y
    }
    return new Phaser.Math.Vector2(x, y)
  }

  private updatePlayerFacing(horizontal: number) {
    if (horizontal > 0.18) this.playerFacing = 1
    else if (horizontal < -0.18) this.playerFacing = -1
    this.player.setFlipX(this.playerFacing < 0)
  }

  private fireBolt() {
    const now = this.time.now
    if (this.phase !== 'combat' || now - this.lastShotAt < 135) return
    this.lastShotAt = now
    const muzzleX = this.player.x + this.aimVector.x * 46
    const muzzleY = this.player.y + this.aimVector.y * 30
    const image = this.add.image(muzzleX, muzzleY, 'bolt-fx')
      .setScale(0.18, 0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(this.aimVector.angle())
      .setDepth(18)
    this.projectiles.push({ image, vx: this.aimVector.x * 760, vy: this.aimVector.y * 760, damage: 13, life: 0.92, radius: 20 })
    this.sound.play('bolt-sfx', { volume: 0.16, rate: Phaser.Math.FloatBetween(0.94, 1.08) })
    this.player.rotation = -this.aimVector.x * 0.075
  }

  private castCinder() {
    const now = this.time.now
    if (this.phase !== 'combat' || now < this.cooldownReady.cinder) return
    this.cooldownReady.cinder = now + 3600
    const targets = [...this.enemies]
      .sort((a, b) => Phaser.Math.Distance.Squared(this.player.x, this.player.y, a.sprite.x, a.sprite.y) - Phaser.Math.Distance.Squared(this.player.x, this.player.y, b.sprite.x, b.sprite.y))
      .slice(0, 4)
    let fromX = this.player.x
    let fromY = this.player.y
    for (const [index, enemy] of targets.entries()) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y) > 560) continue
      const fx = this.add.image(enemy.sprite.x, enemy.sprite.y, 'cinder-fx').setScale(0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(22).setAlpha(0)
      this.tweens.add({ targets: fx, alpha: 1, scale: 0.56, angle: 110, duration: 260, delay: index * 80, yoyo: true, hold: 90, onComplete: () => fx.destroy() })
      const arc = this.add.graphics().setDepth(21).setBlendMode(Phaser.BlendModes.ADD)
      arc.lineStyle(7, 0xff653a, 0.9)
      arc.lineBetween(fromX, fromY, enemy.sprite.x, enemy.sprite.y)
      this.tweens.add({ targets: arc, alpha: 0, duration: 300, delay: index * 70, onComplete: () => arc.destroy() })
      this.damageEnemy(enemy, 22, 'burn')
      enemy.burnedUntil = now + 5200
      fromX = enemy.sprite.x
      fromY = enemy.sprite.y
    }
    this.castPose(0xff7a35)
    this.flashScreen(0xff3f1f, 0.1, 140)
  }

  private castFrost() {
    const now = this.time.now
    if (this.phase !== 'combat' || now < this.cooldownReady.frost) return
    this.cooldownReady.frost = now + 5100
    const centerX = this.player.x + this.aimVector.x * 145
    const centerY = this.player.y + this.aimVector.y * 145
    const fx = this.add.image(centerX, centerY, 'frost-fx').setScale(0.12).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(23)
    this.tweens.add({ targets: fx, scale: 1.05, alpha: 0.92, angle: -70, duration: 300, yoyo: true, hold: 120, onComplete: () => fx.destroy() })
    for (const enemy of [...this.enemies]) {
      if (Phaser.Math.Distance.Between(centerX, centerY, enemy.sprite.x, enemy.sprite.y) > 205) continue
      enemy.frozenUntil = now + 2700
      this.damageEnemy(enemy, 28, 'frost')
      if (enemy.burnedUntil > now && enemy.hp > 0) this.thermalShock(enemy)
    }
    this.castPose(0x8cefff)
    this.flashScreen(0x5cddff, 0.11, 180)
  }

  private phaseDash(forcedDirection?: Phaser.Math.Vector2) {
    const now = this.time.now
    if (this.phase !== 'combat' || now < this.cooldownReady.dash) return
    this.cooldownReady.dash = now + 1800
    let x = forcedDirection?.x ?? Number(this.keys.D.isDown) - Number(this.keys.A.isDown) + this.virtual.x
    let y = forcedDirection?.y ?? Number(this.keys.S.isDown) - Number(this.keys.W.isDown) + this.virtual.y
    if (Math.hypot(x, y) < 0.1) {
      x = this.aimVector.x
      y = this.aimVector.y
    }
    this.dashVector.set(x, y).normalize()
    this.dashingUntil = now + 230
    this.invulnerableUntil = now + 340
    this.sound.play('dash-sfx', { volume: 0.32 })
    const ring = this.add.image(this.player.x, this.player.y, 'frost-fx').setScale(0.12).setTint(0x36ffe8).setBlendMode(Phaser.BlendModes.ADD).setDepth(18)
    this.tweens.add({ targets: ring, scale: 0.7, alpha: 0, angle: 90, duration: 360, onComplete: () => ring.destroy() })
  }

  private castOverload() {
    const now = this.time.now
    if (this.phase !== 'combat' || this.overload < 100 || now < this.cooldownReady.overload) return
    this.overload = 0
    this.cooldownReady.overload = now + 1000
    const fx = this.add.image(this.player.x, this.player.y, 'overload-fx').setScale(0.15).setBlendMode(Phaser.BlendModes.ADD).setDepth(25)
    this.tweens.add({ targets: fx, scale: 2.2, angle: 180, duration: 560, alpha: 0.8, yoyo: true, hold: 180, onComplete: () => fx.destroy() })
    const ring = this.add.circle(this.player.x, this.player.y, 25, 0x77fff2, 0).setStrokeStyle(8, 0x77fff2, 0.9).setDepth(24)
    this.tweens.add({ targets: ring, radius: 460, alpha: 0, duration: 650, onComplete: () => ring.destroy() })
    for (const enemy of [...this.enemies]) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y) < 470) {
        this.damageEnemy(enemy, enemy.kind === 'boss' ? 110 : 180, 'overload')
      }
    }
    this.cameras.main.shake(430, 0.015)
    this.cameras.main.flash(240, 110, 255, 235, false)
    this.sound.play('shock-sfx', { volume: 0.56, rate: 0.72 })
    this.flashTitle('OVERLOAD CROWN', 'The relay answers in kind.')
  }

  private thermalShock(enemy: EnemyUnit) {
    enemy.burnedUntil = 0
    enemy.frozenUntil = 0
    this.damageEnemy(enemy, 62, 'shock')
    this.overload = Math.min(100, this.overload + 28)
    this.combo += 1
    const fxA = this.add.image(enemy.sprite.x, enemy.sprite.y, 'cinder-fx').setScale(0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(26)
    const fxB = this.add.image(enemy.sprite.x, enemy.sprite.y, 'frost-fx').setScale(0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(27)
    this.tweens.add({ targets: [fxA, fxB], scale: 1.35, alpha: 0, angle: 160, duration: 480, onComplete: () => { fxA.destroy(); fxB.destroy() } })
    this.floatingText(enemy.sprite.x, enemy.sprite.y - 72, 'THERMAL SHOCK', '#ffffff', 26)
    this.sound.play('shock-sfx', { volume: 0.42 })
    this.cameras.main.shake(180, 0.009)
  }

  private castPose(tint: number) {
    this.playerPoseUntil = this.time.now + 280
    this.player.setTint(tint).setScale(0.55, 0.34)
    const aura = this.add.circle(this.player.x, this.player.y + 5, 22, tint, 0.22)
      .setStrokeStyle(4, tint, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(17)
    this.tweens.add({ targets: aura, radius: 82, alpha: 0, duration: 300, onComplete: () => aura.destroy() })
    this.tweens.add({ targets: this.player, scaleX: 0.45, scaleY: 0.45, duration: 260, ease: 'Back.Out', onComplete: () => this.player.clearTint() })
  }

  private updateProjectiles(dt: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index]
      projectile.image.x += projectile.vx * dt
      projectile.image.y += projectile.vy * dt
      projectile.image.rotation += dt * 2.8
      projectile.life -= dt
      let hit: EnemyUnit | undefined
      for (const enemy of this.enemies) {
        const radius = enemy.kind === 'boss' ? 76 : 42
        if (Phaser.Math.Distance.Between(projectile.image.x, projectile.image.y, enemy.sprite.x, enemy.sprite.y) < radius + projectile.radius) {
          hit = enemy
          break
        }
      }
      if (hit) {
        this.damageEnemy(hit, projectile.damage, 'bolt')
        projectile.life = 0
      }
      if (projectile.life <= 0 || projectile.image.x < 60 || projectile.image.x > WORLD.width - 60 || projectile.image.y < 50 || projectile.image.y > WORLD.height - 50) {
        projectile.image.destroy()
        this.projectiles.splice(index, 1)
      }
    }
  }

  private updateEnemies(time: number, dt: number) {
    for (const enemy of [...this.enemies]) {
      if (!enemy.sprite.active || enemy.hp <= 0) continue
      enemy.shadow.setPosition(enemy.sprite.x, enemy.sprite.y + (enemy.kind === 'boss' ? 52 : 31))
      const dx = this.player.x - enemy.sprite.x
      const dy = this.player.y - enemy.sprite.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const towardX = dx / distance
      const towardY = dy / distance
      let nx = towardX
      let ny = towardY
      const side = enemy.id % 2 === 0 ? 1 : -1
      if (this.tactic === 'flank') {
        const baseX = nx
        nx = nx * 0.45 - ny * side * 0.88
        ny = ny * 0.45 + baseX * side * 0.88
      } else if (this.tactic === 'zone' && distance < 330) {
        nx *= -0.8
        ny *= -0.8
      } else if (this.tactic === 'recover' && enemy.kind === 'boss' && enemy.hp < enemy.maxHp * 0.55) {
        nx *= -0.55
        ny *= -0.55
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + dt * 1.8)
      }
      const frozen = enemy.frozenUntil > time
      const speed = ENEMIES[enemy.kind].speed * (frozen ? 0.28 : 1) * (this.tactic === 'pressure' ? 1.18 : 1)
      if (enemy.kind === 'cinder' && distance < 210) {
        nx *= -0.5
        ny *= -0.5
      }
      const separationRange = enemy.kind === 'boss' ? 165 : 118
      if (distance < separationRange) {
        const tangentWeight = enemy.kind === 'boss' ? 0.22 : 0.38
        nx = -towardX - towardY * side * tangentWeight
        ny = -towardY + towardX * side * tangentWeight
      }
      const steeringLength = Math.hypot(nx, ny)
      if (steeringLength > 1) {
        nx /= steeringLength
        ny /= steeringLength
      }
      enemy.sprite.setVelocity(nx * speed, ny * speed)
      if (nx > 0.16) enemy.facing = 1
      else if (nx < -0.16) enemy.facing = -1
      enemy.sprite.setFlipX(enemy.facing < 0)
      if (time >= enemy.actionUntil && time - enemy.bornAt > 430) {
        const baseScale = ENEMIES[enemy.kind].scale
        const travel = Math.min(1, Math.hypot(enemy.sprite.body!.velocity.x, enemy.sprite.body!.velocity.y) / Math.max(1, speed))
        if (travel > 0.08) {
          enemy.sprite.anims.resume()
          enemy.sprite.anims.play(`${enemy.kind}-move-loop`, true)
        } else {
          enemy.sprite.anims.stop()
          enemy.sprite.setFrame(0)
        }
        enemy.sprite.setScale(baseScale)
        const targetLean = Phaser.Math.Clamp(enemy.sprite.body!.velocity.x / 1800, -0.045, 0.045)
        enemy.sprite.rotation = Phaser.Math.Linear(enemy.sprite.rotation, targetLean, 0.16)
      } else {
        enemy.sprite.anims.pause()
      }
      if (enemy.hitFlashUntil > time) enemy.sprite.setTintFill(0xffffff)
      else if (frozen) enemy.sprite.setTint(0x8eeeff)
      else if (enemy.burnedUntil > time) enemy.sprite.setTint(0xff8738)
      else enemy.sprite.clearTint()

      if (enemy.burnedUntil > time && time >= enemy.burnTickAt) {
        enemy.burnTickAt = time + 600
        this.damageEnemy(enemy, 3, 'burn')
      }
      if (time >= enemy.attackAt && time - enemy.bornAt > 900) this.beginEnemyAttack(enemy, distance)
    }
  }

  private beginEnemyAttack(enemy: EnemyUnit, distance: number) {
    const now = this.time.now
    const tacticRate = this.tactic === 'pressure' ? 0.82 : this.tactic === 'recover' ? 1.25 : 1
    if (enemy.kind === 'cinder') {
      enemy.attackAt = now + 1950 * tacticRate
      this.createTelegraph(enemy, this.player.x, this.player.y, 82, 760, ENEMIES.cinder.damage, 'burst')
      this.attackSquash(enemy, 0xff4a91)
    } else if (enemy.kind === 'husk') {
      if (distance > 520) { enemy.attackAt = now + 500; return }
      enemy.attackAt = now + 3000 * tacticRate
      const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.x, this.player.y)
      const line = this.add.rectangle(enemy.sprite.x, enemy.sprite.y, 390, 74, 0xff365f, 0.13).setStrokeStyle(3, 0xff665c, 0.8).setRotation(angle).setOrigin(0, 0.5).setDepth(7)
      this.tweens.add({ targets: line, alpha: 0.55, duration: 620, yoyo: true, onComplete: () => line.destroy() })
      this.time.delayedCall(650, () => {
        if (!enemy.sprite.active) return
        enemy.sprite.setVelocity(Math.cos(angle) * 610, Math.sin(angle) * 610)
        this.tweens.add({ targets: enemy.sprite, x: enemy.sprite.x + Math.cos(angle) * 240, y: enemy.sprite.y + Math.sin(angle) * 240, duration: 310, ease: 'Cubic.In', onUpdate: () => {
          if (this.playerDamageDistance(enemy.sprite.x, enemy.sprite.y, 62, ENEMIES.husk.damage)) return
        } })
      })
      this.attackSquash(enemy, 0xff784c)
    } else if (enemy.kind === 'revenant') {
      enemy.attackAt = now + 2800 * tacticRate
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * 80, 140, WORLD.width - 140)
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * 80, 120, WORLD.height - 120)
      this.createTelegraph(enemy, x, y, 135, 1150, ENEMIES.revenant.damage, 'zone')
      this.attackSquash(enemy, 0x8bdfff)
    } else {
      this.beginBossAttack(enemy)
    }
  }

  private beginBossAttack(enemy: EnemyUnit) {
    const now = this.time.now
    enemy.attackAt = now + (this.tactic === 'pressure' ? 1800 : 2600)
    if (this.tactic === 'flank') {
      this.attackSquash(enemy, 0xff46a7)
      this.time.delayedCall(420, () => {
        if (!enemy.sprite.active) return
        enemy.sprite.setPosition(
          Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-260, 260), 180, WORLD.width - 180),
          Phaser.Math.Clamp(this.player.y + Phaser.Math.Between(-210, 210), 150, WORLD.height - 150),
        )
        this.createTelegraph(enemy, this.player.x, this.player.y, 150, 620, 20, 'burst')
        this.spawnBurst(enemy.sprite.x, enemy.sprite.y, 0xff3e9e)
      })
    } else if (this.tactic === 'zone') {
      for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3)
        this.createTelegraph(enemy, this.player.x + Math.cos(angle) * (120 + index * 55), this.player.y + Math.sin(angle) * (120 + index * 55), 105, 900 + index * 140, 14, 'zone')
      }
      this.attackSquash(enemy, 0xae48ff)
    } else if (this.tactic === 'recover') {
      this.attackSquash(enemy, 0x64fff0)
      this.spawnEnemy('cinder', enemy.sprite.x - 110, enemy.sprite.y + 70)
      this.spawnEnemy('revenant', enemy.sprite.x + 110, enemy.sprite.y + 70)
      this.spawnBurst(enemy.sprite.x, enemy.sprite.y, 0x58ffe4)
    } else {
      this.createTelegraph(enemy, enemy.sprite.x, enemy.sprite.y, 230, 720, 22, 'burst')
      this.createTelegraph(enemy, this.player.x, this.player.y, 95, 930, 16, 'burst')
      this.attackSquash(enemy, 0xff365f)
    }
  }

  private createTelegraph(owner: EnemyUnit, x: number, y: number, radius: number, delay: number, damage: number, kind: Telegraph['kind']) {
    const graphics = this.add.graphics().setDepth(6)
    graphics.fillStyle(kind === 'zone' ? 0x813cff : 0xff285f, 0.12)
    graphics.fillCircle(x, y, radius)
    graphics.lineStyle(4, kind === 'zone' ? 0xb66cff : 0xff5676, 0.85)
    graphics.strokeCircle(x, y, radius)
    graphics.lineStyle(2, 0xffffff, 0.5)
    graphics.beginPath()
    graphics.arc(x, y, radius * 0.72, 0, Math.PI * 1.65)
    graphics.strokePath()
    const telegraph: Telegraph = { graphics, x, y, radius, expiresAt: this.time.now + delay, damage, owner, dashScored: false, kind }
    this.telegraphs.push(telegraph)
    this.tweens.add({ targets: graphics, alpha: 0.34, duration: 130, yoyo: true, repeat: Math.max(1, Math.floor(delay / 260)) })
  }

  private updateTelegraphs(time: number) {
    for (let index = this.telegraphs.length - 1; index >= 0; index -= 1) {
      const telegraph = this.telegraphs[index]
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, telegraph.x, telegraph.y)
      if (!telegraph.dashScored && time < this.dashingUntil && distance < telegraph.radius + 30) {
        telegraph.dashScored = true
        this.overload = Math.min(100, this.overload + 24)
        this.score += 75
        this.floatingText(this.player.x, this.player.y - 58, '+OVERLOAD', '#70fff1', 20)
      }
      if (time < telegraph.expiresAt) continue
      telegraph.graphics.destroy()
      this.spawnBurst(telegraph.x, telegraph.y, telegraph.kind === 'zone' ? 0x9d57ff : 0xff315e, telegraph.radius)
      if (distance < telegraph.radius) this.hurtPlayer(telegraph.damage)
      this.telegraphs.splice(index, 1)
    }
  }

  private spawnBurst(x: number, y: number, color: number, radius = 100) {
    const burst = this.add.circle(x, y, 16, color, 0.4).setStrokeStyle(5, 0xffffff, 0.65).setBlendMode(Phaser.BlendModes.ADD).setDepth(20)
    this.tweens.add({ targets: burst, radius, alpha: 0, duration: 280, ease: 'Cubic.Out', onComplete: () => burst.destroy() })
    const shard = this.add.image(x, y, color === 0x58ffe4 ? 'frost-fx' : 'cinder-fx').setScale(0.12).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(19)
    this.tweens.add({ targets: shard, scale: Math.max(0.5, radius / 130), alpha: 0, angle: 100, duration: 360, onComplete: () => shard.destroy() })
  }

  private attackSquash(enemy: EnemyUnit, tint: number) {
    const base = ENEMIES[enemy.kind].scale
    enemy.actionUntil = this.time.now + 340
    enemy.sprite.anims.pause()
    enemy.sprite.setTint(tint)
    const windup = this.add.circle(enemy.sprite.x, enemy.sprite.y, 20, tint, 0.12)
      .setStrokeStyle(3, tint, 0.78)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9)
    this.tweens.add({ targets: windup, radius: enemy.kind === 'boss' ? 105 : 62, alpha: 0, duration: 330, onComplete: () => windup.destroy() })
    this.tweens.add({ targets: enemy.sprite, scaleX: base * 1.3, scaleY: base * 0.66, duration: 145, yoyo: true, hold: 35, onComplete: () => enemy.sprite.clearTint() })
  }

  private playerDamageDistance(x: number, y: number, radius: number, damage: number) {
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) > radius) return false
    this.hurtPlayer(damage)
    return true
  }

  private hurtPlayer(damage: number) {
    const now = this.time.now
    if (now < this.invulnerableUntil || this.phase !== 'combat') return
    this.invulnerableUntil = now + 520
    this.hp = Math.max(0, this.hp - damage)
    this.recentDamage += damage
    this.lastDamageAt = now
    this.combo = 0
    this.player.setTint(0xff3f68)
    this.tweens.add({ targets: this.player, alpha: 0.38, duration: 70, yoyo: true, repeat: 2, onComplete: () => { this.player.clearTint(); this.player.setAlpha(1) } })
    this.floatingText(this.player.x, this.player.y - 55, `-${damage}`, '#ff6688', 24)
    this.cameras.main.shake(130, 0.008)
    this.flashScreen(0xff183e, 0.16, 120)
    if (this.hp <= 0) this.finishRun(false)
  }

  private damageEnemy(enemy: EnemyUnit, rawDamage: number, source: string) {
    if (!enemy.sprite.active || enemy.hp <= 0) return
    const damage = Math.max(1, Math.round(rawDamage * (1 - enemy.armor)))
    enemy.hp -= damage
    if (source === 'frost' && enemy.kind === 'husk') enemy.armor = Math.max(0, enemy.armor - 0.28)
    const color = source === 'burn' ? '#ff8a42' : source === 'frost' ? '#83edff' : source === 'shock' ? '#ffffff' : '#d8fffb'
    this.floatingText(enemy.sprite.x + Phaser.Math.Between(-12, 12), enemy.sprite.y - 52, String(damage), color, source === 'shock' ? 27 : 19)
    enemy.hitFlashUntil = this.time.now + (source === 'bolt' ? 105 : 155)
    this.spawnHitSpark(enemy.sprite.x, enemy.sprite.y, source)
    this.sound.play('impact-sfx', { volume: 0.1, rate: Phaser.Math.FloatBetween(0.9, 1.14) })
    if (enemy.hp <= 0) this.killEnemy(enemy)
  }

  private killEnemy(enemy: EnemyUnit) {
    enemy.hp = 0
    const index = this.enemies.indexOf(enemy)
    if (index >= 0) this.enemies.splice(index, 1)
    this.score += enemy.kind === 'boss' ? 5000 : 250 + this.combo * 25
    this.combo += 1
    this.overload = Math.min(100, this.overload + (enemy.kind === 'boss' ? 35 : 9))
    enemy.sprite.body!.enable = false
    enemy.sprite.anims.stop()
    if (this.pilotTargetId === enemy.id) this.pilotTargetId = null
    this.spawnBurst(enemy.sprite.x, enemy.sprite.y, enemy.kind === 'revenant' ? 0x7eefff : 0xff4f59, enemy.kind === 'boss' ? 210 : 90)
    this.tweens.add({ targets: [enemy.sprite, enemy.shadow], alpha: 0, scaleX: 0.05, scaleY: 0.7, angle: enemy.id % 2 ? 45 : -45, duration: enemy.kind === 'boss' ? 850 : 310, ease: 'Back.In', onComplete: () => { enemy.sprite.destroy(); enemy.shadow.destroy() } })
    if (enemy.kind === 'boss') this.finishRun(true)
  }

  private spawnEnemy(kind: EnemyKind, x?: number, y?: number) {
    if (x == null || y == null) {
      const side = Phaser.Math.Between(0, 3)
      const horizontal = Phaser.Math.Between(480, 650)
      const vertical = Phaser.Math.Between(330, 460)
      if (side === 0) { x = this.player.x + Phaser.Math.Between(-520, 520); y = this.player.y - vertical }
      else if (side === 1) { x = this.player.x + horizontal; y = this.player.y + Phaser.Math.Between(-360, 360) }
      else if (side === 2) { x = this.player.x + Phaser.Math.Between(-520, 520); y = this.player.y + vertical }
      else { x = this.player.x - horizontal; y = this.player.y + Phaser.Math.Between(-360, 360) }
      x = Phaser.Math.Clamp(x, 140, WORLD.width - 140)
      y = Phaser.Math.Clamp(y, 120, WORLD.height - 120)
    }
    const config = ENEMIES[kind]
    const shadow = this.add.ellipse(x, y + (kind === 'boss' ? 52 : 31), kind === 'boss' ? 150 : 78, kind === 'boss' ? 46 : 27, 0x000000, 0.54).setDepth(8)
    const sprite = this.physics.add.sprite(x, y, `${kind}-move`, 0).setScale(config.scale).setDepth(kind === 'boss' ? 11 : 10).setAlpha(0)
    sprite.setCircle(kind === 'boss' ? 77 : 65, kind === 'boss' ? 50 : 62, kind === 'boss' ? 54 : 66).setCollideWorldBounds(true)
    sprite.setData('enemyKind', kind)
    const unit: EnemyUnit = {
      id: ++this.enemySerial,
      kind,
      sprite,
      shadow,
      hp: config.hp,
      maxHp: config.hp,
      attackAt: this.time.now + Phaser.Math.Between(900, 1700),
      bornAt: this.time.now,
      burnedUntil: 0,
      frozenUntil: 0,
      burnTickAt: 0,
      armor: kind === 'husk' ? 0.42 : 0,
      phase: Phaser.Math.Between(0, 1000),
      facing: 1,
      actionUntil: this.time.now + 430,
      hitFlashUntil: 0,
    }
    this.enemies.push(unit)
    sprite.setScale(0.05).setTint(0x66fff0)
    this.tweens.add({ targets: sprite, alpha: 1, scale: config.scale, duration: 430, ease: 'Back.Out', onComplete: () => sprite.clearTint() })
    const gate = this.add.circle(x, y + 12, 20, 0x45ffe8, 0).setStrokeStyle(4, 0x45ffe8, 0.8).setDepth(7)
    this.tweens.add({ targets: gate, radius: kind === 'boss' ? 135 : 68, alpha: 0, duration: 470, onComplete: () => gate.destroy() })
  }

  private advanceWave() {
    if (this.phase !== 'combat') return
    this.wave += 1
    this.wavePending = false
    if (this.wave === 1) {
      this.flashTitle('WAVE 01 // CINDER', 'Dash through the marked blast.')
      for (let i = 0; i < 5; i += 1) this.spawnEnemy('cinder')
    } else if (this.wave === 2) {
      this.flashTitle('WAVE 02 // IRON', 'Frost breaks armor. Fire marks the breach.')
      for (let i = 0; i < 3; i += 1) this.spawnEnemy('husk')
      for (let i = 0; i < 2; i += 1) this.spawnEnemy('cinder')
    } else if (this.wave === 3) {
      this.flashTitle('WAVE 03 // ZERO', 'Stack burn and freeze for Thermal Shock.')
      for (let i = 0; i < 3; i += 1) this.spawnEnemy('revenant')
      this.spawnEnemy('husk')
      this.spawnEnemy('cinder')
    } else {
      this.spawnBossWave(false)
    }
    void this.requestTactic()
  }

  private spawnBossWave(fromShortcut: boolean) {
    if (fromShortcut) {
      for (const enemy of [...this.enemies]) this.killEnemy(enemy)
      this.wave = 4
      this.wavePending = false
      this.overload = 100
    }
    if (this.enemies.some((enemy) => enemy.kind === 'boss')) return
    this.sound.play('boss-sfx', { volume: 0.65 })
    this.flashTitle('NULL CUSTODIAN', 'MiniMax has assumed tactical control.')
    this.cameras.main.flash(480, 255, 28, 90, false)
    this.spawnEnemy(
      'boss',
      Phaser.Math.Clamp(this.player.x, 220, WORLD.width - 220),
      Phaser.Math.Clamp(this.player.y - 500, 170, WORLD.height - 170),
    )
    this.time.delayedCall(500, () => {
      this.spawnEnemy('cinder', 600, 230)
      this.spawnEnemy('revenant', 1000, 230)
    })
    void this.requestTactic()
  }

  private checkWave(time: number) {
    if (this.wave === 0 || this.enemies.length > 0 || this.wavePending || this.wave >= 4) return
    this.wavePending = true
    this.score += 600
    this.flashTitle('SECTOR CLEARED', `Relay integrity ${Math.round(this.hp)}%.`)
    const token = this.runToken
    this.time.delayedCall(1550, () => {
      if (token === this.runToken && this.phase === 'combat') this.advanceWave()
    })
  }

  private updateDirector(time: number) {
    if (time >= this.directorAt) {
      this.directorAt = time + 5200
      void this.requestTactic()
    }
    if (time - this.lastDamageAt > 4000) this.recentDamage = Math.max(0, this.recentDamage - 0.04)
  }

  private async requestTactic() {
    if (this.phase !== 'combat') return
    const token = this.runToken
    this.emitHud(true)
    const boss = this.enemies.find((enemy) => enemy.kind === 'boss')
    const result = await this.director.decide({
      wave: this.wave,
      playerHp: this.hp,
      overload: this.overload,
      enemyCount: this.enemies.length,
      bossHp: boss ? boss.hp : null,
      recentDamage: Math.round(this.recentDamage),
      currentTactic: this.tactic,
      availableSkills: (Object.keys(this.cooldownReady) as SkillId[]).filter((skill) =>
        this.cooldownReady[skill] <= this.time.now && (skill !== 'overload' || this.overload >= 100),
      ),
      burnedEnemies: this.enemies.filter((enemy) => enemy.burnedUntil > this.time.now).length,
      frozenEnemies: this.enemies.filter((enemy) => enemy.frozenUntil > this.time.now).length,
    })
    if (this.phase !== 'combat' || token !== this.runToken) return
    this.tactic = result.tactic
    this.tacticReason = result.reason
    this.tacticSource = result.source
    this.pilot = result.pilot
    this.pilotSource = result.source
    this.pilotActionConsumed = false
    this.pilotTargetId = null
    this.floatingText(this.player.x, this.player.y - 112, `TACTIC // ${TACTIC_LABELS[result.tactic]}`, result.source === 'minimax' ? '#63fff1' : '#ffcc66', 18)
    if (this.controlMode === 'llm') {
      this.floatingText(this.player.x, this.player.y - 78, `PILOT // ${result.pilot.intent.toUpperCase()}`, result.source === 'minimax' ? '#63fff1' : '#ffcc66', 17)
    }
    this.emitHud(true)
  }

  private drawBossBar() {
    this.bossBar?.clear()
    const boss = this.enemies.find((enemy) => enemy.kind === 'boss')
    if (!boss || !this.bossBar) return
    const x = 460
    const y = 72
    const width = 680
    this.bossBar.fillStyle(0x070812, 0.86).fillRoundedRect(x, y, width, 18, 4)
    this.bossBar.fillStyle(0xff326f, 0.95).fillRoundedRect(x + 3, y + 3, (width - 6) * clamp01(boss.hp / boss.maxHp), 12, 3)
    this.bossBar.lineStyle(2, 0xff76a2, 0.72).strokeRoundedRect(x, y, width, 18, 4)
  }

  private drawEnemyBars() {
    this.enemyBars?.clear()
    if (!this.enemyBars) return
    for (const enemy of this.enemies) {
      if (enemy.kind === 'boss' || enemy.hp <= 0 || !enemy.sprite.active) continue
      const width = enemy.kind === 'husk' ? 64 : 52
      const x = enemy.sprite.x - width / 2
      const y = enemy.sprite.y - (enemy.kind === 'husk' ? 62 : 54)
      this.enemyBars.fillStyle(0x02070a, 0.72).fillRect(x, y, width, 5)
      this.enemyBars.fillStyle(enemy.frozenUntil > this.time.now ? 0x75eaff : enemy.burnedUntil > this.time.now ? 0xff6a35 : 0xff4f78, 0.95)
        .fillRect(x + 1, y + 1, (width - 2) * clamp01(enemy.hp / enemy.maxHp), 3)
    }
  }

  private spawnHitSpark(x: number, y: number, source: string) {
    const texture = source === 'frost' ? 'frost-fx' : source === 'burn' || source === 'shock' ? 'cinder-fx' : 'bolt-fx'
    const tint = source === 'frost' ? 0x9df5ff : source === 'burn' ? 0xff7338 : source === 'shock' ? 0xffffff : 0x9ffff5
    const spark = this.add.image(x, y, texture)
      .setScale(source === 'shock' ? 0.16 : 0.07)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(29)
    this.tweens.add({
      targets: spark,
      scale: source === 'shock' ? 0.72 : 0.3,
      alpha: 0,
      angle: Phaser.Math.Between(-80, 80),
      duration: source === 'shock' ? 260 : 145,
      ease: 'Cubic.Out',
      onComplete: () => spark.destroy(),
    })
    if (source !== 'burn') this.cameras.main.shake(source === 'shock' ? 100 : 34, source === 'shock' ? 0.005 : 0.0012)
  }

  private nearestEnemy() {
    let closest: EnemyUnit | undefined
    let distance = Number.POSITIVE_INFINITY
    for (const enemy of this.enemies) {
      const candidate = Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y)
      if (candidate < distance) { distance = candidate; closest = enemy }
    }
    return closest
  }

  private finishRun(victory: boolean) {
    if (this.phase !== 'combat') return
    this.phase = victory ? 'victory' : 'defeat'
    this.pilotTargetId = null
    this.pilotVelocity.set(0, 0)
    this.player.setVelocity(0)
    this.player.anims.stop()
    this.virtual.shoot = false
    this.music?.stop()
    if (victory) {
      this.score += Math.round(this.hp * 30) + this.combo * 50
      this.cameras.main.flash(700, 84, 255, 224, false)
      this.flashTitle('NULL FRACTURED', 'The relay remembers your signal.')
    } else {
      this.cameras.main.fade(450, 30, 0, 18, false)
      this.flashTitle('SIGNAL LOST', 'Re-enter before the relay closes.')
    }
    this.emitHud(true)
  }

  private clearRunObjects() {
    for (const enemy of this.enemies) { enemy.sprite.destroy(); enemy.shadow.destroy() }
    for (const projectile of this.projectiles) projectile.image.destroy()
    for (const telegraph of this.telegraphs) telegraph.graphics.destroy()
    this.enemies = []
    this.projectiles = []
    this.telegraphs = []
    this.wavePending = false
    this.bossBar?.clear()
    this.enemyBars?.clear()
  }

  private flashTitle(title: string, subtitle: string) {
    const heading = this.add.text(VIEW.width / 2, 350, title, {
      fontFamily: 'Arial, sans-serif', fontSize: '42px', fontStyle: 'bold', color: '#ffffff', stroke: '#071015', strokeThickness: 8, align: 'center',
    }).setOrigin(0.5).setDepth(50).setAlpha(0).setLetterSpacing(3).setScrollFactor(0)
    const sub = this.add.text(VIEW.width / 2, 404, subtitle, {
      fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#8dfff4', stroke: '#071015', strokeThickness: 5, align: 'center',
    }).setOrigin(0.5).setDepth(50).setAlpha(0).setLetterSpacing(1).setScrollFactor(0)
    this.tweens.add({ targets: [heading, sub], alpha: 1, y: '-=8', duration: 200, hold: 1050, yoyo: true, onComplete: () => { heading.destroy(); sub.destroy() } })
  }

  private floatingText(x: number, y: number, value: string, color: string, size: number) {
    const text = this.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#05070c', strokeThickness: 5 }).setOrigin(0.5).setDepth(45)
    this.tweens.add({ targets: text, y: y - 48, alpha: 0, scale: 1.16, duration: 650, ease: 'Cubic.Out', onComplete: () => text.destroy() })
  }

  private flashScreen(color: number, alpha: number, duration: number) {
    const overlay = this.add.rectangle(VIEW.width / 2, VIEW.height / 2, VIEW.width, VIEW.height, color, alpha).setDepth(60).setScrollFactor(0)
    this.tweens.add({ targets: overlay, alpha: 0, duration, onComplete: () => overlay.destroy() })
  }

  private emitHud(force = false) {
    const now = this.time.now
    if (!force && now < this.hudAt) return
    this.hudAt = now + 100
    const cooldown = (skill: SkillId) => Math.max(0, (this.cooldownReady[skill] - now) / 1000)
    const detail: EmberHudState = {
      phase: this.phase,
      hp: this.hp,
      maxHp: 100,
      overload: this.overload,
      wave: this.wave,
      waveLabel: this.wave > 0 ? WAVE_LABELS[Math.min(3, this.wave - 1)] : 'BREACH READY',
      enemies: this.enemies.length,
      score: this.score,
      combo: this.combo,
      tactic: this.tactic,
      tacticReason: this.tacticReason,
      tacticSource: this.tacticSource,
      controlMode: this.controlMode,
      pilot: this.pilot,
      pilotSource: this.pilotSource,
      cooldowns: { cinder: cooldown('cinder'), frost: cooldown('frost'), dash: cooldown('dash'), overload: cooldown('overload') },
    }
    window.dispatchEvent(new CustomEvent(EMBER_HUD_EVENT, { detail }))
  }
}
