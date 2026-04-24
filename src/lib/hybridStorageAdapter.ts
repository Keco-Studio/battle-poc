/**
 * Hybrid storage adapter for Supabase Auth (same approach as keco-studio).
 * Persists session in cookies and isolates tabs via sessionStorage.
 */

import type { SupportedStorage } from '@supabase/supabase-js'

const TAB_ID_KEY = '__supabase_tab_id__'
const SESSION_COOKIE = 'sb-session'

function getTabId(): string {
  if (typeof window === 'undefined') {
    return 'server'
  }

  let tabId = localStorage.getItem(TAB_ID_KEY)

  if (tabId) {
    try {
      sessionStorage.setItem(TAB_ID_KEY, tabId)
    } catch {
      /* ignore */
    }
    return tabId
  }

  tabId = sessionStorage.getItem(TAB_ID_KEY)

  if (tabId) {
    try {
      localStorage.setItem(TAB_ID_KEY, tabId)
    } catch {
      /* ignore */
    }
    return tabId
  }

  tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`

  try {
    localStorage.setItem(TAB_ID_KEY, tabId)
    sessionStorage.setItem(TAB_ID_KEY, tabId)
  } catch {
    try {
      sessionStorage.setItem(TAB_ID_KEY, tabId)
    } catch {
      /* last resort */
    }
  }

  return tabId
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return decodeURIComponent(parts.pop()?.split(';').shift() || '')
  }
  return null
}

function setCookie(name: string, value: string, days: number = 7): void {
  if (typeof document === 'undefined') return
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${secure}`
}

function removeCookie(name: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
}

function detectBaseStorageKey(): string {
  if (typeof window === 'undefined') {
    return 'sb-auth-token'
  }

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key && /^sb-.*-auth-token/.test(key)) {
      return key.split('_')[0]
    }
  }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && /^sb-.*-auth-token/.test(key)) {
      return key.split('_')[0]
    }
  }

  return 'sb-auth-token'
}

export function createHybridStorageAdapter(): SupportedStorage {
  const tabId = getTabId()
  const baseKey = detectBaseStorageKey()
  const storageKey = `${baseKey}_${tabId}`

  if (typeof window !== 'undefined') {
    try {
      const cookieSession = getCookie(SESSION_COOKIE)
      if (cookieSession) {
        try {
          sessionStorage.setItem(storageKey, cookieSession)
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    getItem: (key: string): string | null => {
      if (typeof window === 'undefined') {
        return null
      }

      try {
        const actualKey =
          key === baseKey || (key.startsWith('sb-') && key.includes('auth-token')) ? storageKey : key

        let value = sessionStorage.getItem(actualKey)

        if (value) {
          if (actualKey === storageKey) {
            try {
              setCookie(SESSION_COOKIE, value, 7)
            } catch {
              /* ignore */
            }
          }
          return value
        }

        if (actualKey === storageKey) {
          const cookieValue = getCookie(SESSION_COOKIE)
          if (cookieValue) {
            try {
              sessionStorage.setItem(actualKey, cookieValue)
            } catch {
              /* ignore */
            }
            return cookieValue
          }
        }

        return null
      } catch (error) {
        console.error('Hybrid storage getItem error:', error)
        return null
      }
    },

    setItem: (key: string, value: string): void => {
      if (typeof window === 'undefined') {
        return
      }

      try {
        const actualKey =
          key === baseKey || (key.startsWith('sb-') && key.includes('auth-token')) ? storageKey : key

        sessionStorage.setItem(actualKey, value)

        if (actualKey === storageKey) {
          setCookie(SESSION_COOKIE, value, 7)
        }
      } catch (error) {
        console.error('Hybrid storage setItem error:', error)
      }
    },

    removeItem: (key: string): void => {
      if (typeof window === 'undefined') {
        return
      }

      try {
        const actualKey =
          key === baseKey || (key.startsWith('sb-') && key.includes('auth-token')) ? storageKey : key

        sessionStorage.removeItem(actualKey)

        if (actualKey === storageKey) {
          removeCookie(SESSION_COOKIE)
        }
      } catch (error) {
        console.error('Hybrid storage removeItem error:', error)
      }
    },
  }
}
