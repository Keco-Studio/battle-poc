import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/src/lib/supabase/server'
import { LOCAL_WEB_MODE } from '@/src/lib/runtime/localWebMode'
import { localModeUnavailable } from '@/src/lib/runtime/localModeResponse'

/**
 * Current user from server-side cookies. Returns `configured: false` when Supabase env is missing.
 */
export async function GET() {
  if (LOCAL_WEB_MODE) return localModeUnavailable('auth')
  // Legacy Supabase implementation retained below.
  const supabase = await createServerSupabase()
  if (!supabase) {
    return NextResponse.json({ configured: false, user: null })
  }

  const { data, error } = await supabase.auth.getUser()
  if (error) {
    return NextResponse.json({
      configured: true,
      user: null,
      error: error.message,
    })
  }

  const user = data.user
  return NextResponse.json({
    configured: true,
    user: user
      ? {
          id: user.id,
          email: user.email,
        }
      : null,
  })
}
