import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { useToast } from '../components/ui/Toast'

const INTERVAL_MS = 20000

/** Polls for faults reported since the last check and announces them to leads. */
export function useNewFaultAlerts(enabled) {
  const { t } = useI18n()
  const toast = useToast()
  const lastId = useRef(null)
  const messages = useRef({ t, toast })
  messages.current = { t, toast }

  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false

    const check = async () => {
      try {
        const { data } = await api.get('/kvarovi/novi', { params: { since_id: lastId.current ?? 0 } })
        const faults = Array.isArray(data) ? data : []
        if (stopped) return
        if (lastId.current === null) {
          // First poll only records where we are; nothing reported before opening the app is "new".
          lastId.current = faults.length ? Math.max(...faults.map((fault) => fault.id)) : 0
          return
        }
        if (faults.length === 0) return
        const newest = faults[0]
        lastId.current = Math.max(...faults.map((fault) => fault.id))

        const { t: translate, toast: notify } = messages.current
        const title = faults.length > 1 ? translate('notify.newFaults', { n: faults.length }) : translate('notify.newFault', { id: newest.id })
        const body = `${newest.oprema?.naziv ?? ''}: ${newest.naslov}`
        notify.info(`${title} — ${body}`, { action: { to: `/admin/kvarovi/${newest.id}`, label: translate('notify.open') } })

        if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const notification = new Notification(title, { body, tag: `kvar-${newest.id}`, icon: '/icon-192.png' })
            notification.onclick = () => {
              window.focus()
              window.location.assign(`/admin/kvarovi/${newest.id}`)
            }
          } catch {
            // Some browsers only allow notifications from the service worker; the in-app toast still shows.
          }
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
    }

    check()
    const timer = window.setInterval(check, INTERVAL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [enabled])
}
