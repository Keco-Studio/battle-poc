interface VerifiedServerUser {
  id: string
  email?: string
}

interface ServerAuthClient {
  auth: {
    getUser(): Promise<{
      data: { user: VerifiedServerUser | null }
      error: { message: string } | null
    }>
  }
}

export type RequireServerUserResult =
  | { ok: true; user: VerifiedServerUser }
  | { ok: false; status: 401 | 503; error: string }

export async function requireServerUser(
  supabase: ServerAuthClient | null,
): Promise<RequireServerUserResult> {
  if (!supabase) {
    return { ok: false, status: 503, error: 'supabase_not_configured' }
  }

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return {
      ok: false,
      status: 401,
      error: error?.message ?? 'authentication_required',
    }
  }

  return { ok: true, user: data.user }
}
