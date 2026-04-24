import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/src/lib/supabase/server'

/**
 * Current user from server-side cookies. Returns `configured: false` when Supabase env is missing.
 */
export async function GET() {
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
