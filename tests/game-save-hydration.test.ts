import { describe, expect, it } from 'vitest'
import { GameSaveHydrationGuard } from '@/src/lib/auth/game-save-hydration'

describe('GameSaveHydrationGuard', () => {
  it('does not permit cloud saves until the matching hydration commits', () => {
    const guard = new GameSaveHydrationGuard()
    const token = guard.begin('user-a')

    expect(guard.canSave('user-a')).toBe(false)
    expect(guard.complete(token)).toBe(true)
    expect(guard.canSave('user-a')).toBe(true)
    expect(guard.currentGeneration).toBe(token.generation)
  })

  it('rejects an older response after another account begins hydration', () => {
    const guard = new GameSaveHydrationGuard()
    const first = guard.begin('user-a')
    const second = guard.begin('user-b')

    expect(guard.complete(first)).toBe(false)
    expect(guard.complete(second)).toBe(true)
    expect(guard.canSave('user-a')).toBe(false)
    expect(guard.canSave('user-b')).toBe(true)
  })

  it('invalidates a ready account before sign-out state is reset', () => {
    const guard = new GameSaveHydrationGuard()
    const token = guard.begin('user-a')
    guard.complete(token)

    guard.toGuest()

    expect(guard.canSave('user-a')).toBe(false)
    expect(guard.isCurrent(token)).toBe(false)
  })

  it('keeps saves paused after a hydration failure', () => {
    const guard = new GameSaveHydrationGuard()
    const token = guard.begin('user-a')

    expect(guard.fail(token)).toBe(true)
    expect(guard.canSave('user-a')).toBe(false)
    expect(guard.complete(token)).toBe(false)
  })
})
