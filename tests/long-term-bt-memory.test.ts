import { describe, it, expect, beforeEach } from 'vitest'
import {
  pickLongTermBtSeed,
  updateLongTermBtAfterBattle,
  readLongTermBtStore,
  saveLongTermBtToLocalStorage,
} from '../src/battle-core/service/ai/long-term-bt-memory'
import { createInitialBehaviorTree } from '../src/battle-core/service/ai/behavior-tree/initial-behavior-tree'

const LS_KEY = 'battle-poc:long-term-bt:v1'

function mockLocalStorage() {
  const map = new Map<string, string>()
  const ls = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => map.clear(),
  } as Storage
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  return map
}

describe('long-term-bt-memory', () => {
  beforeEach(() => {
    mockLocalStorage().clear()
  })

  it('update increments ordinal on draw without storing trees', () => {
    updateLongTermBtAfterBattle({
      result: 'draw',
      opponentKey: 'enemy-a',
      leftActorId: 'poc-player',
      rightActorId: 'enemy-a',
      leftTree: createInitialBehaviorTree({ actorId: 'poc-player', currentTick: 0 }),
      rightTree: createInitialBehaviorTree({ actorId: 'enemy-a', currentTick: 0 }),
    })
    const s = readLongTermBtStore()
    expect(s.globalOrdinal).toBe(1)
    expect(Object.keys(s.humanByOpponent)).toHaveLength(0)
    expect(s.enemy).toBeNull()
  })

  it('left_win stores human entry keyed by opponent; pick returns remapped tree', () => {
    const leftTree = createInitialBehaviorTree({ actorId: 'poc-player', currentTick: 1 })
    updateLongTermBtAfterBattle({
      result: 'left_win',
      opponentKey: 'boss-1',
      leftActorId: 'poc-player',
      rightActorId: 'boss-1',
      leftTree,
      rightTree: null,
    })
    const picked = pickLongTermBtSeed({
      role: 'human',
      opponentKey: 'boss-1',
      currentActorId: 'poc-player',
    })
    expect(picked).not.toBeNull()
    expect(picked!.treeId).toMatch(/^bt_/)
    expect(picked!.root.id).toContain('poc_player')
  })

  it('right_win stores single enemy slot; enemy pick remaps to new enemy id', () => {
    const rightTree = createInitialBehaviorTree({ actorId: 'wolf-old', currentTick: 2 })
    updateLongTermBtAfterBattle({
      result: 'right_win',
      opponentKey: 'wolf-old',
      leftActorId: 'poc-player',
      rightActorId: 'wolf-old',
      leftTree: null,
      rightTree,
    })
    const picked = pickLongTermBtSeed({
      role: 'enemy',
      opponentKey: 'ignored',
      currentActorId: 'wolf-new',
    })
    expect(picked).not.toBeNull()
    expect(picked!.treeId).toBe('bt_wolf_new')
  })

  it('new opponent uses weighted pool from other opponent keys', () => {
    const tA = createInitialBehaviorTree({ actorId: 'poc-player', currentTick: 0 })
    updateLongTermBtAfterBattle({
      result: 'left_win',
      opponentKey: 'a',
      leftActorId: 'poc-player',
      rightActorId: 'a',
      leftTree: tA,
      rightTree: null,
    })
    updateLongTermBtAfterBattle({
      result: 'draw',
      opponentKey: 'b',
      leftActorId: 'poc-player',
      rightActorId: 'b',
      leftTree: tA,
      rightTree: null,
    })
    const tB = createInitialBehaviorTree({ actorId: 'poc-player', currentTick: 0 })
    updateLongTermBtAfterBattle({
      result: 'left_win',
      opponentKey: 'b',
      leftActorId: 'poc-player',
      rightActorId: 'b',
      leftTree: tB,
      rightTree: null,
    })
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const p = pickLongTermBtSeed({
        role: 'human',
        opponentKey: 'c-new',
        currentActorId: 'poc-player',
      })
      expect(p).not.toBeNull()
      seen.add(p!.treeId)
    }
    expect(seen.size).toBeGreaterThanOrEqual(1)
  })

  it('saveLongTermBtToLocalStorage round-trips', () => {
    const s = readLongTermBtStore()
    s.globalOrdinal = 42
    saveLongTermBtToLocalStorage(s)
    expect(readLongTermBtStore().globalOrdinal).toBe(42)
    expect((globalThis as unknown as { localStorage: Storage }).localStorage.getItem(LS_KEY)).toContain('42')
  })
})
