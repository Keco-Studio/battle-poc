'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { BrainCircuit, Crosshair, Flame, Gauge, RotateCcw, Snowflake, Sparkles, UserRound, Zap } from 'lucide-react'
import type { EmberGameApi } from '@/src/ember-null/bootstrap'
import { EMBER_HUD_EVENT, type EmberHudState, type SkillId } from '@/src/ember-null/types'
import { TACTIC_LABELS } from '@/src/ember-null/content'

const INITIAL_HUD: EmberHudState = {
  phase: 'briefing',
  hp: 100,
  maxHp: 100,
  overload: 0,
  wave: 0,
  waveLabel: 'BREACH READY',
  enemies: 0,
  score: 0,
  combo: 0,
  tactic: 'pressure',
  tacticReason: 'Awaiting live tactical signal.',
  tacticSource: 'connecting',
  controlMode: 'llm',
  pilot: {
    intent: 'engage', movement: 'orbit-left', action: 'fire', target: 'nearest', reason: 'Awaiting MiniMax pilot directive.',
  },
  pilotSource: 'connecting',
  cooldowns: { cinder: 0, frost: 0, dash: 0, overload: 0 },
}

const SKILLS: Array<{ id: SkillId; keyName: string; label: string; icon: typeof Flame }> = [
  { id: 'cinder', keyName: 'Q', label: 'Cinder Chain', icon: Flame },
  { id: 'frost', keyName: 'E', label: 'Frost Break', icon: Snowflake },
  { id: 'dash', keyName: 'SPACE', label: 'Phase Dash', icon: Zap },
  { id: 'overload', keyName: 'R', label: 'Overload Crown', icon: Sparkles },
]

function useVirtualStick(onChange: (x: number, y: number) => void) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const pointerId = useRef<number | null>(null)

  const update = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const rawX = event.clientX - (rect.left + rect.width / 2)
    const rawY = event.clientY - (rect.top + rect.height / 2)
    const max = rect.width * 0.32
    const length = Math.max(1, Math.hypot(rawX, rawY))
    const scale = Math.min(1, max / length)
    const x = rawX * scale
    const y = rawY * scale
    setKnob({ x, y })
    onChange(x / max, y / max)
  }, [onChange])

  const start = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerId.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    update(event)
  }, [update])

  const move = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current === event.pointerId) update(event)
  }, [update])

  const stop = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return
    pointerId.current = null
    setKnob({ x: 0, y: 0 })
    onChange(0, 0)
  }, [onChange])

  return { knob, start, move, stop }
}

export default function EmberNullGame() {
  const mountRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<EmberGameApi | null>(null)
  const [ready, setReady] = useState(false)
  const [hud, setHud] = useState(INITIAL_HUD)

  useEffect(() => {
    let disposed = false
    const onHud = (event: Event) => setHud((event as CustomEvent<EmberHudState>).detail)
    window.addEventListener(EMBER_HUD_EVENT, onHud)
    void import('@/src/ember-null/bootstrap').then(({ createEmberNullGame }) => {
      if (disposed || !mountRef.current) return
      apiRef.current = createEmberNullGame(mountRef.current)
      setReady(true)
    })
    return () => {
      disposed = true
      window.removeEventListener(EMBER_HUD_EVENT, onHud)
      apiRef.current?.destroy()
      apiRef.current = null
    }
  }, [])

  const move = useCallback((x: number, y: number) => apiRef.current?.move(x, y), [])
  const stick = useVirtualStick(move)
  const hpPercent = `${Math.max(0, (hud.hp / hud.maxHp) * 100)}%`
  const overloadPercent = `${hud.overload}%`
  const isEnd = hud.phase === 'victory' || hud.phase === 'defeat'

  return (
    <main className="en-shell" data-game-phase={hud.phase}>
      <div className="en-canvas" ref={mountRef} data-testid="ember-null-canvas" />
      <div className="en-vignette" aria-hidden="true" />

      <header className="en-topbar">
        <div className="en-brand">
          <span className="en-brand-mark"><span /> <span /> <span /></span>
          <div><strong>{'EMBER//NULL'}</strong><small>RELAY BREACH 01</small></div>
        </div>
        <div className="en-wave">
          <small>SECTOR {String(Math.max(1, hud.wave)).padStart(2, '0')} / 04</small>
          <strong>{hud.waveLabel}</strong>
          <span>{hud.enemies} HOSTILES</span>
        </div>
        <div className={`en-director en-director-${hud.pilotSource}`} data-testid="llm-tactic">
          <div className="en-director-pulse" />
          <div>
            <small>MINIMAX-M2.1 // {hud.controlMode === 'llm' ? hud.pilotSource.toUpperCase() : 'STANDBY'}</small>
            <strong>{hud.controlMode === 'llm' ? `PILOT ${hud.pilot.intent.toUpperCase()} // ${hud.pilot.action.toUpperCase()}` : 'MANUAL CONTROL'}</strong>
          </div>
          <p>{hud.controlMode === 'llm' ? hud.pilot.reason : `Enemy: ${TACTIC_LABELS[hud.tactic]}`}</p>
        </div>
      </header>

      <section className="en-side-metrics" aria-label="Run metrics">
        <div><small>SCORE</small><strong>{hud.score.toString().padStart(6, '0')}</strong></div>
        <div><small>CHAIN</small><strong>x{hud.combo}</strong></div>
        <div className="en-mode-switch" role="group" aria-label="Control mode">
          <button
            type="button"
            className={hud.controlMode === 'llm' ? 'is-active' : ''}
            onClick={() => apiRef.current?.mode('llm')}
            title="MiniMax Pilot"
            aria-label="MiniMax Pilot"
          ><BrainCircuit size={15} /><span>LLM PILOT</span></button>
          <button
            type="button"
            className={hud.controlMode === 'human' ? 'is-active' : ''}
            onClick={() => apiRef.current?.mode('human')}
            title="Manual Control"
            aria-label="Manual Control"
          ><UserRound size={15} /><span>MANUAL</span></button>
        </div>
      </section>

      <section className="en-bottom-hud">
        <div className="en-vital">
          <div className="en-vital-title"><span>RELAY WARDEN</span><strong>{Math.ceil(hud.hp)} / {hud.maxHp}</strong></div>
          <div className="en-bar en-health"><i style={{ width: hpPercent }} /></div>
          <div className="en-vital-title en-overload-label"><span><Gauge size={14} /> OVERLOAD</span><strong>{Math.floor(hud.overload)}%</strong></div>
          <div className="en-bar en-overload"><i style={{ width: overloadPercent }} /></div>
        </div>
        <div className="en-skills">
          {SKILLS.map(({ id, keyName, label, icon: Icon }) => {
            const cooldown = hud.cooldowns[id]
            const locked = id === 'overload' && hud.overload < 100
            return (
              <button
                key={id}
                type="button"
                disabled={hud.controlMode === 'llm'}
                className={`en-skill en-skill-${id} ${locked ? 'is-locked' : ''}`}
                onPointerDown={(event) => { event.preventDefault(); apiRef.current?.skill(id) }}
                title={`${label} (${keyName})`}
                aria-label={label}
                data-testid={`skill-${id}`}
              >
                <span className="en-skill-icon"><Icon size={23} strokeWidth={1.8} />{cooldown > 0 && <b>{cooldown.toFixed(1)}</b>}</span>
                <span><strong>{label}</strong><small>{keyName}</small></span>
              </button>
            )
          })}
        </div>
      </section>

      <section className={`en-touch ${hud.controlMode === 'llm' ? 'is-piloted' : ''}`} aria-label="Touch controls">
        <div
          className="en-stick"
          onPointerDown={stick.start}
          onPointerMove={stick.move}
          onPointerUp={stick.stop}
          onPointerCancel={stick.stop}
        >
          <span style={{ transform: `translate(${stick.knob.x}px, ${stick.knob.y}px)` }} />
        </div>
        <button
          className="en-fire"
          type="button"
          aria-label="Relay Bolt"
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); apiRef.current?.shoot(true) }}
          onPointerUp={() => apiRef.current?.shoot(false)}
          onPointerCancel={() => apiRef.current?.shoot(false)}
        ><Crosshair size={31} /></button>
      </section>

      {hud.phase === 'briefing' && (
        <section className="en-overlay en-intro">
          <div className="en-intro-glyph" aria-hidden="true"><i /><i /><i /></div>
          <p>RELAY WARDEN // CERAMIC UNIT 07</p>
          <h1>EMBER<span>{'//'}</span>NULL</h1>
          <div className="en-intro-line" />
          <h2>ENTER THE DEAD SIGNAL</h2>
          <button type="button" disabled={!ready} onClick={() => apiRef.current?.start()}>
            <Zap size={19} fill="currentColor" /> {ready ? 'BREACH RELAY' : 'CALIBRATING'}
          </button>
          <footer><span>WASD</span><span>AIM + FIRE</span><span>Q / E / SPACE / R</span><span>GAMEPAD</span></footer>
        </section>
      )}

      {isEnd && (
        <section className={`en-overlay en-result ${hud.phase}`}>
          <p>{hud.phase === 'victory' ? 'RELAY STABILIZED' : 'CONNECTION TERMINATED'}</p>
          <h2>{hud.phase === 'victory' ? 'NULL FRACTURED' : 'SIGNAL LOST'}</h2>
          <div className="en-result-score"><small>FINAL SCORE</small><strong>{hud.score.toString().padStart(6, '0')}</strong></div>
          <button type="button" onClick={() => apiRef.current?.restart()}><RotateCcw size={18} /> RE-ENTER</button>
        </section>
      )}
    </main>
  )
}
