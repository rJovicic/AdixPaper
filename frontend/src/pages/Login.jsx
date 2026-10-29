import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import Field from '../components/ui/Field'
import LanguageSwitch from '../components/ui/LanguageSwitch'
import { useAuth } from '../auth/AuthProvider'
import { homeForRole } from '../auth/session'
import { errorMessage } from '../api/client'
import { useI18n } from '../i18n'

export default function Login() {
  const i18n = useI18n()
  const { t } = i18n
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const usernameRef = useRef(null)
  const passwordRef = useRef(null)
  const reason = params.get('reason')

  useEffect(() => {
    document.title = `${t('login.title')} · ${t('app.name')}`
  }, [t])

  if (user && !submitting) return <Navigate to={homeForRole(user.rola)} replace />

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!username.trim()) nextErrors.username = t('errors.required')
    if (!password) nextErrors.password = t('errors.required')
    setErrors(nextErrors)
    setFormError('')
    if (nextErrors.username) return usernameRef.current?.focus()
    if (nextErrors.password) return passwordRef.current?.focus()

    setSubmitting(true)
    try {
      const signedIn = await signIn(username.trim(), password)
      const from = location.state?.from
      // Return to where the user was headed: a screen of their own role, or a machine QR link.
      // Only in-app paths: the role's own screens and machine/component labels (never "//host").
      const allowed = typeof from === 'string' && /^\/(?!\/)/.test(from)
        && (from.startsWith(homeForRole(signedIn.rola)) || /^\/(m\/\d+|q\/[A-Za-z0-9_-]{8,32})$/.test(from))
      const target = allowed ? from : homeForRole(signedIn.rola)
      navigate(target, { replace: true })
    } catch (error) {
      setFormError(error?.message === 'bad-response' ? t('login.badResponse') : errorMessage(error, i18n))
      setPassword('')
      setSubmitting(false)
      passwordRef.current?.focus()
    }
  }

  const notice = reason === 'expired' ? t('login.expired') : reason === 'signedOut' ? t('login.signedOut') : ''

  return (
    <div className="flex min-h-dvh flex-col bg-stock sm:bg-ground">
      <div className="flex justify-end px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <LanguageSwitch />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:pt-0">
        <div className="enter-rise w-full max-w-[24rem]">
          <section aria-labelledby="login-title" className="sm:surface sm:px-2 sm:py-2">
            <header className="flex flex-col items-center px-6 pb-2 pt-6 text-center">
              <BrandLogo size="lg" />
              <p className="mt-4 text-2xl font-semibold tracking-[-0.01em] text-ink">{t('app.name')}</p>
              <p className="mt-1 text-ink-2">{t('app.tagline')}</p>
            </header>

            <form onSubmit={submit} noValidate className="space-y-5 px-6 pb-6 pt-4">
              <h1 id="login-title" className="sr-only">{t('login.title')}</h1>

              {notice && !formError && (
                <p role="status" className="rounded border border-rule bg-ground/60 px-3 py-2.5 text-sm text-ink-2">{notice}</p>
              )}
              {formError && (
                <p role="alert" className="flex items-start gap-2 rounded border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent">
                  <AlertTriangle size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {formError}
                </p>
              )}

              <Field label={t('login.username')} error={errors.username} required>
                {(props) => (
                  <input
                    {...props}
                    ref={usernameRef}
                    className="control"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                )}
              </Field>

              <Field label={t('login.password')} error={errors.password} required>
                {(props) => (
                  <div className="relative">
                    <input
                      {...props}
                      ref={passwordRef}
                      className="control pr-12"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="btn-icon absolute right-0.5 top-1/2 -translate-y-1/2"
                      aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                    </button>
                  </div>
                )}
              </Field>

              <button type="submit" disabled={submitting} className="btn-primary btn-lg w-full">
                {submitting ? t('login.submitting') : t('login.submit')}
              </button>
              <p className="text-center text-sm text-ink-3">{t('login.help')}</p>
            </form>
          </section>
          <p className="mt-5 text-center text-meta text-ink-3">{t('app.companies')}</p>
        </div>
      </main>
    </div>
  )
}
