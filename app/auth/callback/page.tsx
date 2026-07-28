'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/src/lib/SupabaseContext'
import { resolvePostLoginRedirect } from '@/src/lib/authPostLoginRedirect'
import { waitForAuthCallbackSession } from '@/src/lib/auth/auth-callback-session'
import Link from 'next/link'
import { LOCAL_WEB_MODE } from '@/src/lib/runtime/localWebMode'
import { LocalModeNotice } from '@/app/components/LocalModeNotice'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useSupabase()

  useEffect(() => {
    const controller = new AbortController()
    if (searchParams.get('error')) {
      router.replace('/?error=auth_error')
      return () => controller.abort()
    }

    void waitForAuthCallbackSession(supabase.auth, {
      hasCode: Boolean(searchParams.get('code')),
      signal: controller.signal,
    }).then((result) => {
      if (result === 'aborted') return
      if (result === 'authenticated') {
        router.replace(
          resolvePostLoginRedirect({
            explicitRedirect: searchParams.get('redirect'),
          }),
        )
        return
      }

      console.error(`Auth callback failed: ${result}`)
      router.replace('/?error=auth_error')
    })

    return () => controller.abort()
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
  if (LOCAL_WEB_MODE) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <LocalModeNotice />
        <Link href="/" className="text-sm font-semibold text-sky-700 hover:underline">
          Return to battle
        </Link>
      </main>
    )
  }

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
