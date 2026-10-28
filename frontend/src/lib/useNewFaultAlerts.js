import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { useToast } from '../components/ui/Toast'
import { useLive } from './live'
import { currentSubscription } from './push'

const seenKey = (userId) => `adix.inbox.${userId}`

function readSeen(userId) {
  try {
    const value = Number(localStorage.getItem(seenKey(userId)))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function writeSeen(userId, id) {
  try {
    localStorage.setItem(seenKey(userId), String(id))
  } catch {
    // Storage unavailable: the unread count resets on reload, nothing else breaks.
  }
}

/**
 * Leads' inbox of newly reported faults: the latest 20 reports from the server, an unread count
 * (per device: reports newer than the last one opened or marked read), and a toast the moment a
 * report arrives over the live connection. Each fault is announced once, however often its
 * event is delivered.
 */
export function useNewFaultAlerts(user) {
  const { t } = useI18n()
  const toast = useToast()
  const userId = user?.id
  const [items, setItems] = useState([])
  const [seen, setSeen] = useState(() => readSeen(userId))
  const announced = useRef(new Set())
  const strings = useRef({ t, toast })
  strings.current = { t, toast }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/kvarovi/novi', { params: { since_id: 0 } })
      const list = Array.isArray(data) ? data : []
      setItems(list)
      list.forEach((fault) => announced.current.add(fault.id))
      // First use on this device: what was reported before is not "unread".
      setSeen((current) => {
        if (current !== null) return current
        const newest = list.length ? Math.max(...list.map((fault) => fault.id)) : 0
        writeSeen(userId, newest)
        return newest
      })
    } catch {
      // Kept as is; the next live event or resync tries again.
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setSeen(readSeen(userId))
    load()
  }, [userId, load])

  useLive(async (message) => {
    if (message.type === 'resync') {
      load()
      return
    }
    if (message.type !== 'kvar') return
    if (message.action === 'deleted') {
      setItems((list) => list.filter((fault) => fault.id !== message.kvarId))
      return
    }
    if (message.action !== 'created' || announced.current.has(message.kvarId)) return
    announced.current.add(message.kvarId)
    let fault
    try {
      fault = (await api.get(`/kvarovi/${message.kvarId}`)).data
    } catch {
      return
    }
    setItems((list) => [fault, ...list.filter((item) => item.id !== fault.id)].slice(0, 20))
    if (fault.prijavio?.id === userId) return // their own report needs no alert

    const { t: translate, toast: notify } = strings.current
    const title = translate('notify.newFault', { id: fault.id })
    const body = `${fault.oprema?.naziv ?? ''}: ${fault.naslov}`
    notify.info(`${title} — ${body}`, { action: { to: `/admin/kvarovi/${fault.id}`, label: translate('notify.open') } })

    // In a background tab without push, a system notification is the only way to be seen.
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
      const subscribed = await currentSubscription().catch(() => null)
      if (subscribed) return // the server's push already shows one
      try {
        const notification = new Notification(title, { body, tag: `kvar-${fault.id}`, icon: '/icon-192.png' })
        notification.onclick = () => {
          window.focus()
          window.location.assign(`/admin/kvarovi/${fault.id}`)
        }
      } catch {
        // Some browsers only allow notifications from a service worker; the toast still shows.
      }
    }
  })

  const unread = seen === null ? 0 : items.filter((fault) => fault.id > seen && (fault.prijavio_id ?? fault.prijavio?.id) !== userId).length

  const markRead = useCallback((upTo) => {
    setSeen((current) => {
      const newest = upTo ?? Math.max(0, ...items.map((fault) => fault.id))
      const next = Math.max(current ?? 0, newest)
      writeSeen(userId, next)
      return next
    })
  }, [items, userId])

  return { items, unread, seen: seen ?? 0, markRead }
}
