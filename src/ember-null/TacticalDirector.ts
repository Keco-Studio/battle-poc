import type {
  PilotAction,
  PilotIntent,
  PilotMovement,
  PilotTarget,
  PlayerDirective,
  TacticalSnapshot,
  Tactic,
} from './types'

export type TacticResult = {
  tactic: Tactic
  reason: string
  source: 'minimax' | 'fallback'
  pilot: PlayerDirective
}

const TACTICS = new Set<Tactic>(['pressure', 'flank', 'zone', 'recover'])
const PILOT_INTENTS = new Set<PilotIntent>(['engage', 'kite', 'evade', 'combo', 'overload'])
const PILOT_MOVEMENTS = new Set<PilotMovement>(['toward', 'away', 'orbit-left', 'orbit-right', 'hold'])
const PILOT_ACTIONS = new Set<PilotAction>(['fire', 'cinder', 'frost', 'dash', 'overload'])
const PILOT_TARGETS = new Set<PilotTarget>(['nearest', 'weakest', 'boss'])

function parseDecision(raw: unknown): { tactic?: unknown; reason?: unknown; player?: unknown } | null {
  let value = raw
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof value === 'string') {
      const match = value.match(/\{[\s\S]*\}/)
      if (!match) return null
      try {
        value = JSON.parse(match[0])
      } catch {
        return null
      }
      continue
    }
    if (value && typeof value === 'object' && 'decision' in value) {
      value = (value as { decision: unknown }).decision
      continue
    }
    if (value && typeof value === 'object' && 'output' in value) {
      value = (value as { output: unknown }).output
      continue
    }
    break
  }
  return value && typeof value === 'object' ? value as { tactic?: unknown; reason?: unknown; player?: unknown } : null
}

function fallbackPilot(snapshot: TacticalSnapshot): PlayerDirective {
  if (snapshot.overload >= 100 && snapshot.availableSkills.includes('overload')) {
    return { intent: 'overload', movement: 'toward', action: 'overload', target: 'boss', reason: 'Local pilot: discharge full Overload.' }
  }
  if (snapshot.playerHp < 30 && snapshot.availableSkills.includes('dash')) {
    return { intent: 'evade', movement: 'away', action: 'dash', target: 'nearest', reason: 'Local pilot: break contact at critical health.' }
  }
  if (snapshot.burnedEnemies > 0 && snapshot.availableSkills.includes('frost')) {
    return { intent: 'combo', movement: 'orbit-left', action: 'frost', target: 'weakest', reason: 'Local pilot: trigger Thermal Shock.' }
  }
  if (snapshot.availableSkills.includes('cinder')) {
    return { intent: 'combo', movement: 'orbit-right', action: 'cinder', target: 'nearest', reason: 'Local pilot: establish burn marks.' }
  }
  return { intent: 'kite', movement: 'orbit-left', action: 'fire', target: 'nearest', reason: 'Local pilot: maintain firing distance.' }
}

function fallback(snapshot: TacticalSnapshot): TacticResult {
  if (snapshot.bossHp !== null && snapshot.bossHp < 180) {
    return { tactic: 'pressure', reason: 'Local fail-safe: execute low-health assault.', source: 'fallback', pilot: fallbackPilot(snapshot) }
  }
  if (snapshot.playerHp < 32) {
    return { tactic: 'zone', reason: 'Local fail-safe: seal the weakened target.', source: 'fallback', pilot: fallbackPilot(snapshot) }
  }
  const rotation: Tactic[] = ['flank', 'pressure', 'zone', 'recover']
  return {
    tactic: rotation[(snapshot.wave + snapshot.enemyCount) % rotation.length],
    reason: 'Deterministic tactical fallback engaged.',
    source: 'fallback',
    pilot: fallbackPilot(snapshot),
  }
}

export class TacticalDirector {
  private pending: Promise<TacticResult> | null = null
  private controller: AbortController | null = null

  cancel() {
    this.controller?.abort()
    this.controller = null
    this.pending = null
  }

  decide(snapshot: TacticalSnapshot): Promise<TacticResult> {
    if (this.pending) return this.pending
    const pending = this.request(snapshot).finally(() => {
      if (this.pending === pending) this.pending = null
    })
    this.pending = pending
    return pending
  }

  private async request(snapshot: TacticalSnapshot): Promise<TacticResult> {
    const controller = new AbortController()
    this.controller = controller
    const timeout = window.setTimeout(() => controller.abort(), 22000)

    try {
      const response = await fetch('http://localhost:8787/api/ai/battle-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider: 'minimax',
          model: 'MiniMax-M2.1',
          timeoutMs: 20000,
          systemPrompt: 'You direct enemies in a fast top-down action game. Return JSON only. Do not explain outside JSON.',
          prompt: JSON.stringify({
            task: 'Choose the enemy tactic and directly pilot the player for the next five seconds.',
            allowedTactics: ['pressure', 'flank', 'zone', 'recover'],
            output: {
              tactic: 'pressure | flank | zone | recover',
              reason: 'enemy tactic reason, max 10 words',
              player: {
                intent: 'engage | kite | evade | combo | overload',
                movement: 'toward | away | orbit-left | orbit-right | hold',
                action: 'fire | cinder | frost | dash | overload',
                target: 'nearest | weakest | boss',
                reason: 'player action reason, max 12 words',
              },
            },
            battleState: snapshot,
          }),
        }),
      })
      if (!response.ok) throw new Error(`AI proxy returned ${response.status}`)
      const parsed = parseDecision(await response.json())
      if (!parsed || typeof parsed.tactic !== 'string' || !TACTICS.has(parsed.tactic as Tactic)) {
        throw new Error('Invalid tactic response')
      }
      const player = parsed.player && typeof parsed.player === 'object'
        ? parsed.player as Record<string, unknown>
        : null
      if (
        !player ||
        typeof player.intent !== 'string' || !PILOT_INTENTS.has(player.intent as PilotIntent) ||
        typeof player.movement !== 'string' || !PILOT_MOVEMENTS.has(player.movement as PilotMovement) ||
        typeof player.action !== 'string' || !PILOT_ACTIONS.has(player.action as PilotAction) ||
        typeof player.target !== 'string' || !PILOT_TARGETS.has(player.target as PilotTarget)
      ) {
        throw new Error('Invalid player directive')
      }
      return {
        tactic: parsed.tactic as Tactic,
        reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 96) : 'Live battlefield adaptation.',
        source: 'minimax',
        pilot: {
          intent: player.intent as PilotIntent,
          movement: player.movement as PilotMovement,
          action: player.action as PilotAction,
          target: player.target as PilotTarget,
          reason: typeof player.reason === 'string' ? player.reason.slice(0, 96) : 'Live autonomous control.',
        },
      }
    } catch {
      return fallback(snapshot)
    } finally {
      window.clearTimeout(timeout)
      if (this.controller === controller) this.controller = null
    }
  }
}
