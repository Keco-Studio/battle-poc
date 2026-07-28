import { describe, expect, it } from 'vitest'
import {
  CloudSaveCoordinator,
  type CloudSaveWriteResult,
} from '@/src/lib/db/cloud-save-coordinator'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function yieldToCoordinator(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('CloudSaveCoordinator', () => {
  it('serializes writes and coalesces pending snapshots to the newest value', async () => {
    const writes: Array<{ value: number; expected: number; userId: string }> = []
    const first = deferred<CloudSaveWriteResult>()
    const coordinator = new CloudSaveCoordinator<{ value: number }>({
      quietMs: 0,
      write: async (snapshot, expected, userId) => {
        writes.push({ value: snapshot.value, expected, userId })
        if (writes.length === 1) return first.promise
        return { applied: true, revision: expected + 1 }
      },
    })

    coordinator.start({ userId: 'user-a', generation: 1, revision: 7 })
    coordinator.enqueue({ value: 1 })
    await yieldToCoordinator()
    coordinator.enqueue({ value: 2 })
    coordinator.enqueue({ value: 3 })

    expect(writes).toEqual([{ value: 1, expected: 7, userId: 'user-a' }])

    first.resolve({ applied: true, revision: 8 })
    await coordinator.whenIdle()

    expect(writes).toEqual([
      { value: 1, expected: 7, userId: 'user-a' },
      { value: 3, expected: 8, userId: 'user-a' },
    ])
  })

  it('does not write before a matching hydration starts', async () => {
    const writes: number[] = []
    const coordinator = new CloudSaveCoordinator<{ value: number }>({
      quietMs: 0,
      write: async (snapshot, expected) => {
        writes.push(snapshot.value)
        return { applied: true, revision: expected + 1 }
      },
    })

    coordinator.enqueue({ value: 1 })
    await coordinator.flush()

    expect(writes).toEqual([])
    expect(coordinator.isReadyFor('user-a', 1)).toBe(false)
  })

  it('discards an old lifecycle result before writing the next account', async () => {
    const writes: Array<{ value: number; expected: number; userId: string }> = []
    const oldWrite = deferred<CloudSaveWriteResult>()
    const coordinator = new CloudSaveCoordinator<{ value: number }>({
      quietMs: 0,
      write: async (snapshot, expected, userId) => {
        writes.push({ value: snapshot.value, expected, userId })
        if (userId === 'user-a') return oldWrite.promise
        return { applied: true, revision: expected + 1 }
      },
    })

    coordinator.start({ userId: 'user-a', generation: 1, revision: 4 })
    coordinator.enqueue({ value: 10 })
    await yieldToCoordinator()
    coordinator.cancel()
    coordinator.start({ userId: 'user-b', generation: 2, revision: 20 })
    coordinator.enqueue({ value: 30 })

    oldWrite.resolve({ applied: true, revision: 5 })
    await coordinator.whenIdle()

    expect(writes).toEqual([
      { value: 10, expected: 4, userId: 'user-a' },
      { value: 30, expected: 20, userId: 'user-b' },
    ])
    expect(coordinator.isReadyFor('user-b', 2)).toBe(true)
  })

  it('suspends after a revision conflict and never retries blindly', async () => {
    const writes: number[] = []
    let conflictCount = 0
    const coordinator = new CloudSaveCoordinator<{ value: number }>({
      quietMs: 0,
      onConflict: () => {
        conflictCount += 1
      },
      write: async (snapshot) => {
        writes.push(snapshot.value)
        return { applied: false, reason: 'conflict' }
      },
    })

    coordinator.start({ userId: 'user-a', generation: 3, revision: 9 })
    coordinator.enqueue({ value: 1 })
    await coordinator.whenIdle()
    coordinator.enqueue({ value: 2 })
    await coordinator.flush()

    expect(writes).toEqual([1])
    expect(conflictCount).toBe(1)
    expect(coordinator.isReadyFor('user-a', 3)).toBe(false)
  })
})
