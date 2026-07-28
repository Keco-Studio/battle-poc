export const DEFAULT_BUILTIN_MAP_ID =
  'emberwatch-causeway'
export const DEFAULT_BUILTIN_MAP_REF = `builtin:${DEFAULT_BUILTIN_MAP_ID}` as const

export type BuiltinMapRef = `builtin:${string}`
export type UserMapRef = `user:${string}`
export type MapRef = BuiltinMapRef | UserMapRef

export type ParsedMapRef =
  | { source: 'builtin'; id: string; ref: BuiltinMapRef }
  | { source: 'user'; id: string; ref: UserMapRef }

const BUILTIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,127}$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseMapRef(value: unknown): ParsedMapRef | null {
  if (typeof value !== 'string') return null
  if (value.startsWith('builtin:')) {
    const id = value.slice('builtin:'.length)
    if (!BUILTIN_ID_RE.test(id)) return null
    return { source: 'builtin', id, ref: `builtin:${id}` }
  }
  if (value.startsWith('user:')) {
    const id = value.slice('user:'.length).toLowerCase()
    if (!UUID_RE.test(id)) return null
    return { source: 'user', id, ref: `user:${id}` }
  }
  return null
}

export function formatBuiltinMapRef(id: string): BuiltinMapRef {
  const parsed = parseMapRef(`builtin:${id}`)
  if (!parsed || parsed.source !== 'builtin') throw new Error('Invalid built-in map id')
  return parsed.ref
}

export function formatUserMapRef(id: string): UserMapRef {
  const parsed = parseMapRef(`user:${id}`)
  if (!parsed || parsed.source !== 'user') throw new Error('Invalid user map id')
  return parsed.ref
}
