'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/src/lib/SupabaseContext'
import { resolvePostLoginRedirect } from '@/src/lib/authPostLoginRedirect'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useSupabase()

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')

      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code)

          if (error) {
            console.error('Error exchanging code for session:', error)
            router.push('/?error=auth_error')
            return
          }

          const target = resolvePostLoginRedirect({
            explicitRedirect: searchParams.get('redirect'),
          })
          router.push(target)
        } catch (err) {
          console.error('Auth callback error:', err)
          router.push('/?error=auth_error')
        }
      } else {
        router.push('/?error=auth_error')
      }
    }

    void handleCallback()
  }, [searchParams, supabase, router])

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ fontSize: '18px', fontWeight: 500 }}>Completing sign-in…</div>
      <div style={{ fontSize: '14px', color: '#64748b' }}>Please wait</div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
          }}
        >
          Loading…
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  )
}
