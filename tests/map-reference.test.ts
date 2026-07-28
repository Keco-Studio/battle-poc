import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUILTIN_MAP_REF,
  formatBuiltinMapRef,
  formatUserMapRef,
  parseMapRef,
} from '@/src/lib/maps/map-reference'

describe('map references', () => {
  it('parses canonical built-in and user references', () => {
    expect(parseMapRef('builtin:demo-project')).toEqual({
      source: 'builtin',
      id: 'demo-project',
      ref: 'builtin:demo-project',
    })
    expect(parseMapRef('user:47f7596d-5cb4-4a14-ae19-d1d2191ad782')).toEqual({
      source: 'user',
      id: '47f7596d-5cb4-4a14-ae19-d1d2191ad782',
      ref: 'user:47f7596d-5cb4-4a14-ae19-d1d2191ad782',
    })
  })

  it('rejects traversal, malformed UUIDs, and unqualified legacy values', () => {
    expect(parseMapRef('builtin:../secret')).toBeNull()
    expect(parseMapRef('builtin:a/b')).toBeNull()
    expect(parseMapRef('user:not-a-uuid')).toBeNull()
    expect(parseMapRef('demo-project')).toBeNull()
  })

  it('formats references and exposes one canonical home map', () => {
    expect(formatBuiltinMapRef('demo-project')).toBe('builtin:demo-project')
    expect(formatUserMapRef('47F7596D-5CB4-4A14-AE19-D1D2191AD782')).toBe(
      'user:47f7596d-5cb4-4a14-ae19-d1d2191ad782',
    )
    expect(parseMapRef(DEFAULT_BUILTIN_MAP_REF)?.source).toBe('builtin')
  })
})

