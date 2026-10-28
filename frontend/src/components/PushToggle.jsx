import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { useI18n } from '../i18n'
import { useToast } from './ui/Toast'
import { currentSubscription, disablePush, enablePush, getPushKey, pushSupported } from '../lib/push'

function usePushToggle() {
  const [state, setState] = useState({ available: false, enabled: false, busy: false, key: '' })

  useEffect(() => {
    if (!pushSupported()) return
    let active = true
    Promise.all([getPushKey().catch(() => ''), currentSubscription().catch(() => null)]).then(([key, subscription]) => {
      if (active) setState({ available: Boolean(key), enabled: Boolean(subscription), busy: false, key })
    })
    return () => { active = false }
  }, [])

  return [state, setState]
}

/** Push notifications on this device: leads hear about new faults, workers about changes to their own. Hidden unless the server has VAPID keys. */
export default function PushToggle() {
  const { t } = useI18n()
  const toast = useToast()
  const [push, setPush] = usePushToggle()
  if (!push.available) return null

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
        toast.success(t('notify.on'))
      }
    } catch (error) {
      setPush((current) => ({ ...current, busy: false }))
      toast.error(error?.code === 'denied' ? t('notify.denied') : t('notify.failed'))
    }
  }

  const Icon = push.enabled ? BellOff : Bell
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={push.busy}
      aria-pressed={push.enabled}
      className="flex min-h-[2.75rem] w-full items-center gap-3 rounded px-3 text-left text-[0.9375rem] font-medium text-ink transition-colors hover:bg-brand-wash disabled:opacity-60"
    >
      <Icon size={17} aria-hidden="true" className="text-ink-2" />
      {push.enabled ? t('notify.disable') : t('notify.enable')}
    </button>
  )
}
