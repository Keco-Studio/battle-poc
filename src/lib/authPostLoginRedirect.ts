/** Default route after OAuth callback when no explicit redirect is provided. */
export const BATTLE_DEFAULT_POST_LOGIN_PATH = '/'

function isSafeRelativePath(path: string): boolean {
  const trimmed = path.trim()
  if (!trimmed.startsWith('/')) return false

  const base = new URL('https://battle.invalid')
  try {
    return new URL(trimmed, base).origin === base.origin
  } catch {
    return false
  }
}

function normalizePathForCompare(path: string): string {
  const [pathname, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.delete('redirect')
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** Resolve post-login navigation (same rules as keco-simulation, battle defaults to `/`). */
export function resolvePostLoginRedirect(options: {
  explicitRedirect?: string | null
  pathname?: string
  search?: string
}): string {
  const { explicitRedirect, pathname = '', search = '' } = options

  if (explicitRedirect && isSafeRelativePath(explicitRedirect)) {
    return explicitRedirect.trim()
  }

  if (pathname && pathname !== '/auth/callback') {
    const raw = search.startsWith('?') ? search.slice(1) : search
    const params = new URLSearchParams(raw)
    params.delete('redirect')
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return BATTLE_DEFAULT_POST_LOGIN_PATH
}

export function isAlreadyOnPostLoginPath(target: string, pathname: string, search: string): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const current = raw ? `${pathname}?${raw}` : pathname
  return normalizePathForCompare(target) === normalizePathForCompare(current)
}
