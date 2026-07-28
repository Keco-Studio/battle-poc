export type GameSaveHydrationToken = Readonly<{
  userId: string
  generation: number
}>

type HydrationPhase =
  | { kind: 'guest'; generation: number }
  | { kind: 'hydrating'; token: GameSaveHydrationToken }
  | { kind: 'ready'; token: GameSaveHydrationToken }
  | { kind: 'failed'; token: GameSaveHydrationToken }

export class GameSaveHydrationGuard {
  private phase: HydrationPhase = { kind: 'guest', generation: 0 }

  get currentGeneration(): number {
    return this.phase.kind === 'guest'
      ? this.phase.generation
      : this.phase.token.generation
  }

  begin(userId: string): GameSaveHydrationToken {
    const token = Object.freeze({
      userId,
      generation: this.currentGeneration + 1,
    })
    this.phase = { kind: 'hydrating', token }
    return token
  }

  complete(token: GameSaveHydrationToken): boolean {
    if (this.phase.kind !== 'hydrating' || !this.sameToken(this.phase.token, token)) {
      return false
    }
    this.phase = { kind: 'ready', token }
    return true
  }

  fail(token: GameSaveHydrationToken): boolean {
    if (this.phase.kind !== 'hydrating' || !this.sameToken(this.phase.token, token)) {
      return false
    }
    this.phase = { kind: 'failed', token }
    return true
  }

  toGuest(): void {
    this.phase = { kind: 'guest', generation: this.currentGeneration + 1 }
  }

  isCurrent(token: GameSaveHydrationToken): boolean {
    return this.phase.kind !== 'guest' && this.sameToken(this.phase.token, token)
  }

  canSave(userId: string): boolean {
    return this.phase.kind === 'ready' && this.phase.token.userId === userId
  }

  private sameToken(a: GameSaveHydrationToken, b: GameSaveHydrationToken): boolean {
    return a.userId === b.userId && a.generation === b.generation
  }
}
