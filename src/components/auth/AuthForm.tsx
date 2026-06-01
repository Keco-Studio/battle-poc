'use client'

import { FormEvent, useState, Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useSupabase } from '@/src/lib/SupabaseContext'
import {
  isAlreadyOnPostLoginPath,
  resolvePostLoginRedirect,
} from '@/src/lib/authPostLoginRedirect'
import styles from './AuthForm.module.css'

type Mode = 'login' | 'register'

type RegisterState = {
  email: string
  username: string
  password: string
  confirmPassword: string
}

type LoginState = {
  email: string
  password: string
}

export type AuthFormVariant = 'full' | 'embedded'

type AuthFormContentProps = {
  variant: AuthFormVariant
  /** When true, stay on the current page after email/password login (e.g. in-game profile modal). */
  suppressRedirect?: boolean
  onAuthenticated?: () => void
}

function AuthFormContent({ variant, suppressRedirect, onAuthenticated }: AuthFormContentProps) {
  const embedded = variant === 'embedded'
  const supabase = useSupabase()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const resolveRedirectTarget = () =>
    resolvePostLoginRedirect({
      explicitRedirect: searchParams.get('redirect'),
      pathname,
      search: searchParams.toString() ? `?${searchParams.toString()}` : '',
    })

  const [mode, setMode] = useState<Mode>('login')
  const [regForm, setRegForm] = useState<RegisterState>({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  })
  const [loginForm, setLoginForm] = useState<LoginState>({
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setMessage(null)
    setErrorMsg(null)
    setRegForm({ email: '', username: '', password: '', confirmPassword: '' })
    setLoginForm({ email: '', password: '' })
    setPasswordError(false)
  }

  const updateReg =
    (key: keyof RegisterState) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setRegForm((p) => ({ ...p, [key]: e.target.value }))

  const updateLogin =
    (key: keyof LoginState) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setLoginForm((p) => ({ ...p, [key]: e.target.value }))

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage(null)
    setErrorMsg(null)

    const { email, username, password, confirmPassword } = regForm
    if (!email || !username || !password) {
      setErrorMsg('Email, username and password cannot be empty')
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      })
      if (error) throw error
      setMessage('Sign-up succeeded')
      onAuthenticated?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-up failed'
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage(null)
    setErrorMsg(null)
    setPasswordError(false)

    const { email, password } = loginForm
    if (!email || !password) {
      setErrorMsg('Email and password cannot be empty')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setMessage('Signed in successfully')
      setPasswordError(false)
      onAuthenticated?.()

      if (!suppressRedirect) {
        const target = resolveRedirectTarget()
        const search = searchParams.toString()
        if (!isAlreadyOnPostLoginPath(target, pathname, search ? `?${search}` : '')) {
          router.push(target)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      if (msg.includes('Invalid login credentials')) {
        setErrorMsg('Incorrect password, please try again.')
        setPasswordError(true)
      } else {
        setErrorMsg(msg)
        setPasswordError(false)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setMessage(null)
    setErrorMsg(null)
    setGoogleLoading(true)

    try {
      const currentOrigin = window.location.origin
      const target = resolveRedirectTarget()
      const redirectTo = `${currentOrigin}/auth/callback?redirect=${encodeURIComponent(target)}`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })
      if (error) throw error
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google login failed'
      setErrorMsg(msg)
      setGoogleLoading(false)
    }
  }

  const isRegister = mode === 'register'

  const formBlock = (
    <>
      <div className={embedded ? styles.formSideEmbedded : styles.formSide}>
        <h1 className={embedded ? styles.titleEmbedded : styles.title}>
          {isRegister ? (
            'REGISTER'
          ) : (
            <>
              <span className={styles.titleMain}>Login to </span>
              <span className={styles.titleBrand}>Keco</span>
            </>
          )}
        </h1>

        {isRegister ? (
          <form className={styles.form} onSubmit={handleRegister} autoComplete="off">
            <input type="text" name="fake-email" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} />
            <input type="password" name="fake-password" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} />

            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                name="reg-email-input"
                type="text"
                inputMode="email"
                placeholder="type your email..."
                autoComplete="off"
                value={regForm.email}
                onChange={updateReg('email')}
                required
              />
            </label>
            <label className={styles.label}>
              Username
              <input
                className={styles.input}
                name="reg-username-input"
                type="text"
                placeholder="type your username..."
                autoComplete="off"
                value={regForm.username}
                onChange={updateReg('username')}
                required
              />
            </label>
            <label className={styles.label}>
              Password
              <input
                className={styles.input}
                name="reg-password-input"
                type="password"
                placeholder="type your password..."
                autoComplete="new-password"
                value={regForm.password}
                onChange={updateReg('password')}
                required
              />
            </label>
            <label className={styles.label}>
              Confirm Password
              <input
                className={styles.input}
                name="reg-confirm-password-input"
                type="password"
                placeholder="type your confirm password..."
                autoComplete="new-password"
                value={regForm.confirmPassword}
                onChange={updateReg('confirmPassword')}
                required
              />
            </label>
            {errorMsg ? <div className={styles.error}>{errorMsg}</div> : null}
            <button type="submit" className={`${styles.submit} ${styles.submitRegister}`} disabled={loading}>
              {loading ? 'Registering...' : 'Register'}
            </button>
          </form>
        ) : (
          <>
            <div className={styles.oauthSection}>
              <button
                type="button"
                className={styles.googleButton}
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
              >
                <svg className={styles.googleIcon} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>{googleLoading ? 'Loading...' : 'Log in using Google'}</span>
              </button>
            </div>

            <div className={styles.divider}>
              <span className={styles.dividerText}>or</span>
            </div>

            <form className={styles.form} onSubmit={handleLogin} autoComplete="off">
              <input type="text" name="fake-username" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} />
              <input type="password" name="fake-password" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} />

              <label className={styles.label}>
                Email
                <input
                  className={styles.input}
                  name="login-email-input"
                  type="text"
                  inputMode="email"
                  placeholder="type your email..."
                  autoComplete="off"
                  value={loginForm.email}
                  onChange={updateLogin('email')}
                  required
                />
              </label>
              <label className={styles.label}>
                Password
                <input
                  className={`${styles.input} ${passwordError ? styles.inputError : ''}`}
                  name="login-password-input"
                  type="password"
                  placeholder="type your password..."
                  autoComplete="new-password"
                  value={loginForm.password}
                  onChange={(e) => {
                    updateLogin('password')(e)
                    setPasswordError(false)
                  }}
                  required
                />
              </label>
              {errorMsg ? <div className={styles.error}>{errorMsg}</div> : null}
              <button type="submit" className={`${styles.submit} ${styles.submitLogin}`} disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          </>
        )}

        {message ? <div className={styles.success}>{message}</div> : null}

        <div className={styles.footer}>
          {isRegister ? (
            <>
              <span className={styles.muted}>Have an account?</span>
              <button className={styles.link} type="button" onClick={() => switchMode('login')}>
                Login Now
              </button>
            </>
          ) : (
            <>
              <span className={styles.muted}>Don&apos;t have an account?</span>
              <button className={styles.link} type="button" onClick={() => switchMode('register')}>
                Sign Up Now
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )

  if (embedded) {
    return (
      <div className={styles.embeddedRoot}>
        <div className={styles.embeddedCard}>
          <div className={styles.embeddedBrand}>
            <Image src="/loginProductIcon.svg" alt="Keco" width={96} height={40} />
            <span className={styles.embeddedBrandTagline}>for game designers</span>
          </div>
          <div className={styles.embeddedCardInner}>{formBlock}</div>
        </div>
      </div>
    )
  }

  return <div className={styles.page}>{formBlock}</div>
}

type AuthFormProps = {
  variant?: AuthFormVariant
  suppressRedirect?: boolean
  onAuthenticated?: () => void
}

function AuthFormWithVariant(props: AuthFormProps) {
  const embedded = props.variant === 'embedded'
  return (
    <Suspense
      fallback={
        <div className={embedded ? styles.embeddedRoot : styles.page}>
          <div className={embedded ? styles.embeddedCard : styles.page}>
            <div className={embedded ? styles.embeddedCardInner : styles.page}>Loading...</div>
          </div>
        </div>
      }
    >
      <AuthFormContent {...props} variant={props.variant ?? 'full'} />
    </Suspense>
  )
}

export default function AuthForm(props: AuthFormProps) {
  return <AuthFormWithVariant {...props} />
}
