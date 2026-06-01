'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import type { UserProfile } from '@/src/lib/types/user'

async function clearAllCaches() {
  const { globalRequestCache } = await import('@/src/lib/hooks/useRequestCache')
  globalRequestCache.invalidate()

  window.dispatchEvent(
    new CustomEvent('authStateChanged', {
      detail: { type: 'signOut' },
    }),
  )
}

function formatSupabaseLikeError(error: unknown): string {
  if (error == null) return '(null/undefined)'
  if (typeof error === 'string') return error
  if (typeof error !== 'object') return String(error)
  const obj = error as Record<string, unknown>
  const parts: string[] = []
  const msg =
    (typeof obj.message === 'string' && obj.message) ||
    (error instanceof Error ? error.message : '')
  if (msg) parts.push(`message=${msg}`)
  if (obj.code != null && String(obj.code) !== '') parts.push(`code=${String(obj.code)}`)
  try {
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(obj)
  } catch {
    return String(error)
  }
}

type AuthContextType = {
  isAuthenticated: boolean
  isLoading: boolean
  userProfile: UserProfile | null
  signOut: () => Promise<void>
}

const guestAuthValue: AuthContextType = {
  isAuthenticated: false,
  isLoading: false,
  userProfile: null,
  signOut: async () => {},
}

const AuthContext = createContext<AuthContextType | null>(null)

function AuthProviderInner({ children }: { children: ReactNode }) {
  const supabase = useSupabaseOptional()!
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const profileFetchInProgress = useRef(false)
  const currentUserId = useRef<string | null>(null)

  const fetchUserProfile = useCallback(
    async (userId: string): Promise<void> => {
      if (profileFetchInProgress.current) return

      profileFetchInProgress.current = true
      currentUserId.current = userId

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (error) {
          if (error.code === 'PGRST116') {
            const {
              data: { user },
              error: userError,
            } = await supabase.auth.getUser()

            if (!userError && user && user.id === userId) {
              const { data: newProfile, error: insertError } = await supabase
                .from('profiles')
                .insert({
                  id: userId,
                  email: user.email || '',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .select()
                .single()

              if (!insertError && newProfile) {
                setUserProfile(newProfile as UserProfile)
                profileFetchInProgress.current = false
                return
              }
            }
          } else {
            console.error(`Failed to fetch profile: ${formatSupabaseLikeError(error)}`)
          }
          currentUserId.current = null
          setUserProfile(null)
        } else if (profile) {
          setUserProfile(profile as UserProfile)
        } else {
          currentUserId.current = null
          setUserProfile(null)
        }
      } catch (err) {
        console.error(`Failed to fetch profile (exception): ${formatSupabaseLikeError(err)}`)
        currentUserId.current = null
        setUserProfile(null)
      } finally {
        profileFetchInProgress.current = false
      }
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    try {
      // Local scope clears browser session immediately (same as battle-poc profile panel).
      await supabase.auth.signOut({ scope: 'local' })
      setIsAuthenticated(false)
      setUserProfile(null)
      currentUserId.current = null
      await clearAllCaches()
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingInvitationToken')
      }
    } catch (e) {
      console.error('Logout failed', e)
    }
  }, [supabase])

  useEffect(() => {
    let mounted = true
    let initializationComplete = false

    setIsLoading(true)
    setIsAuthenticated(false)
    setUserProfile(null)

    const initializeAuth = async () => {
      if (!mounted) return

      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (mounted) {
          if (session?.user && !error) {
            setIsAuthenticated(true)
            currentUserId.current = session.user.id
            void fetchUserProfile(session.user.id)
          } else {
            setIsAuthenticated(false)
            setUserProfile(null)
            currentUserId.current = null
          }
        }
      } catch (err) {
        console.error('Failed to initialize auth session:', err)
        if (mounted) {
          setIsAuthenticated(false)
          setUserProfile(null)
          currentUserId.current = null
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
          initializationComplete = true
        }
      }
    }

    void initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (!initializationComplete && event === 'INITIAL_SESSION') {
        return
      }

      try {
        const prevUserId = currentUserId.current

        if (session?.user) {
          setIsAuthenticated(true)
          const newUserId = session.user.id

          if (currentUserId.current !== null && currentUserId.current !== newUserId) {
            await clearAllCaches()
          }

          if (currentUserId.current !== newUserId) {
            currentUserId.current = null
          }
          currentUserId.current = newUserId
          void fetchUserProfile(newUserId)
        } else {
          if (prevUserId !== null) {
            await clearAllCaches()
          }
          setIsAuthenticated(false)
          setUserProfile(null)
          currentUserId.current = null
        }
      } catch (err) {
        console.error('Auth state change failed:', err)
        setIsAuthenticated(false)
        setUserProfile(null)
        currentUserId.current = null
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchUserProfile, supabase])

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    userProfile,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabaseOptional()

  if (!supabase) {
    return <AuthContext.Provider value={guestAuthValue}>{children}</AuthContext.Provider>
  }

  return <AuthProviderInner>{children}</AuthProviderInner>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

/** Safe when guest mode — returns guest defaults outside AuthProvider. */
export function useAuthOptional(): AuthContextType {
  const context = useContext(AuthContext)
  return context ?? guestAuthValue
}
