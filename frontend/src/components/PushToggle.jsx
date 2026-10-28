import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing, Smartphone } from 'lucide-react'
import { useI18n } from '../i18n'
import { useToast } from './ui/Toast'
import { api, errorMessage } from '../api/client'
import { currentSubscription, disablePush, enablePush, getPushKey, pushSupported } from '../lib/push'
import { isStandalone, platform } from '../lib/install'
import { InstallDialog } from './InstallPrompt'

const SUBSCRIPTION_CHECK_MS = 5000

function usePushToggle() {
  const [state, setState] = useState({ ready: false, available: false, enabled: false, busy: false, key: '' })

  useEffect(() => {
    if (!pushSupported()) return undefined
    let active = true
    // A service worker that never becomes ready must not hide the switch for good.
    const subscription = Promise.race([
      currentSubscription().catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), SUBSCRIPTION_CHECK_MS)),
    ])
    Promise.all([getPushKey().catch(() => ''), subscription]).then(([key, existing]) => {
      if (active) setState({ ready: true, available: Boolean(key), enabled: Boolean(existing), busy: false, key })
    })
    return () => { active = false }
  }, [])

  return [state, setState]
}

const rowClass = 'flex min-h-[2.75rem] w-full items-center gap-3 rounded px-3 text-left text-[0.9375rem] font-medium text-ink transition-colors hover:bg-brand-wash disabled:opacity-60'

/**
 * Push notifications on this device: leads hear about new faults, workers about changes to their own.
 * Hidden when the server has no push keys. On an iPhone/iPad outside the home-screen app it explains
 * that push needs the installed app, because Safari tabs cannot receive it at all.
 * `variant="card"`: the prominent version, only while notifications are off (top of the bell panel).
 * `variant="manage"`: only once they are on (turn off, send a test).
 */
export default function PushToggle({ hint, variant = 'row' }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const [push, setPush] = usePushToggle()
  const [showSteps, setShowSteps] = useState(false)
  const ios = platform().startsWith('ios')

  if (ios && !isStandalone()) {
    if (variant === 'manage') return null
    // iOS gives Safari tabs no push at all; say so instead of showing nothing.
    return (
      <>
        <button type="button" className={rowClass} onClick={() => setShowSteps(true)}>
          <Smartphone size={17} aria-hidden="true" className="shrink-0 text-ink-2" />
          <span className="min-w-0">
            {t('notify.iosInstallFirst')}
            <span className="block text-meta font-normal text-ink-2">{t('notify.iosInstallHint')}</span>
          </span>
        </button>
        {showSteps && <InstallDialog onClose={() => setShowSteps(false)} />}
      </>
    )
  }
  if (!push.available) return null
  if (variant === 'card' && push.enabled) return null
  if (variant === 'manage' && !push.enabled) return null

  const toggle = async () => {
    setPush((current) => ({ ...current, busy: true }))
    try {
      if (push.enabled) {
        await disablePush()
        setPush((current) => ({ ...current, enabled: false, busy: false }))
        toast.info(t('notify.off'))
      } else {
        await enablePush(push.key)
        setPush((current) => ({ ...current, enabled: true, busy: false }))
        toast.success(t('notify.onTest'))
      }
    } catch (error) {
      setPush((current) => ({ ...current, busy: false }))
      if (error?.code === 'denied') toast.error(ios ? t('notify.deniedIos') : t('notify.denied'))
      else if (error?.response) toast.error(`${t('notify.failed')} ${errorMessage(error, i18n)}`)
      else toast.error(`${t('notify.failed')} (${error?.name || 'Error'}${error?.message ? `: ${error.message}` : ''})`)
    }
  }

  const sendTest = async () => {
    setPush((current) => ({ ...current, busy: true }))
    try {
      await api.post('/notifikacije/test')
      toast.success(t('notify.testSent'))
    } catch (error) {
      toast.error(`${t('notify.testFailed')} ${errorMessage(error, i18n)}`)
    } finally {
      setPush((current) => ({ ...current, busy: false }))
    }
  }

  if (variant === 'card') {
    return (
      <div className="rounded-lg border border-brand/25 bg-info-wash/60 p-3">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <BellRing size={18} aria-hidden="true" className="text-brand" /> {t('notify.cardTitle')}
        </p>
        {hint && <p className="mt-1 text-meta text-ink-2">{hint}</p>}
        <button type="button" className="btn-primary mt-3 w-full" onClick={toggle} disabled={push.busy}>
          <Bell size={17} aria-hidden="true" /> {t('notify.enable')}
        </button>
      </div>
    )
  }

  const Icon = push.enabled ? BellOff : Bell
  return (
    <>
      <button type="button" onClick={toggle} disabled={push.busy} aria-pressed={push.enabled} className={rowClass}>
        <Icon size={17} aria-hidden="true" className="shrink-0 text-ink-2" />
        <span className="min-w-0">
          {push.enabled ? t('notify.disable') : t('notify.enable')}
          {hint && !push.enabled && <span className="block text-meta font-normal text-ink-2">{hint}</span>}
        </span>
      </button>
      {push.enabled && (
        <button type="button" onClick={sendTest} disabled={push.busy} className={rowClass}>
          <BellRing size={17} aria-hidden="true" className="shrink-0 text-ink-2" />
          {t('notify.test')}
        </button>
      )}
    </>
  )
}
