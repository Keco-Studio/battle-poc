export type CloudSaveWriteResult =
  | { applied: true; revision: number }
  | { applied: false; reason: 'conflict' }

type SaveSession = {
  userId: string
  generation: number
  revision: number
}

type CoordinatorOptions<T> = {
  write: (
    snapshot: Readonly<T>,
    expectedRevision: number,
    userId: string,
  ) => Promise<CloudSaveWriteResult>
  quietMs: number
  onConflict?: () => void
  onError?: (error: unknown) => void
}

export class CloudSaveCoordinator<T> {
  private readonly options: CoordinatorOptions<T>
  private session: SaveSession | null = null
  private pending: Readonly<T> | null = null
  private inFlight = false
  private suspended = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private lifecycle = 0
  private idleWaiters = new Set<() => void>()

  constructor(options: CoordinatorOptions<T>) {
    this.options = options
  }

  start(input: SaveSession): void {
    this.clearTimer()
    this.lifecycle += 1
    this.session = { ...input }
    this.pending = null
    this.suspended = false
    this.notifyIdleIfNeeded()
  }

  enqueue(snapshot: Readonly<T>): void {
    if (!this.session || this.suspended) return
    this.pending = snapshot
    this.schedule(this.options.quietMs)
  }

  cancel(): void {
    this.clearTimer()
    this.lifecycle += 1
    this.session = null
    this.pending = null
    this.suspended = false
    this.notifyIdleIfNeeded()
  }

  async flush(): Promise<void> {
    this.clearTimer()
    await this.drain()
    await this.whenIdle()
  }

  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve()
    return new Promise((resolve) => {
      this.idleWaiters.add(resolve)
    })
  }

  isReadyFor(userId: string, generation: number): boolean {
    return Boolean(
      this.session &&
        !this.suspended &&
        this.session.userId === userId &&
        this.session.generation === generation,
    )
  }

  private schedule(delayMs: number): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.drain()
    }, Math.max(0, delayMs))
  }

  private async drain(): Promise<void> {
    if (this.inFlight || !this.session || this.suspended || !this.pending) {
      this.notifyIdleIfNeeded()
      return
    }

    const lifecycle = this.lifecycle
    const session = this.session
    const snapshot = this.pending
    this.pending = null
    this.inFlight = true

    try {
      const result = await this.options.write(
        snapshot,
        session.revision,
        session.userId,
      )
      if (lifecycle !== this.lifecycle || session !== this.session) return
      if (result.applied) {
        session.revision = result.revision
      } else {
        this.suspended = true
        this.pending = null
        this.clearTimer()
        this.options.onConflict?.()
      }
    } catch (error) {
      if (lifecycle === this.lifecycle && session === this.session) {
        this.options.onError?.(error)
      }
    } finally {
      this.inFlight = false
      if (this.session && !this.suspended && this.pending) {
        this.schedule(0)
      }
      this.notifyIdleIfNeeded()
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private isIdle(): boolean {
    return !this.inFlight && this.pending === null && this.timer === null
  }

  private notifyIdleIfNeeded(): void {
    if (!this.isIdle()) return
    for (const resolve of this.idleWaiters) resolve()
    this.idleWaiters.clear()
  }
}

