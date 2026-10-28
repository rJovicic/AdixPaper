import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { readSession } from '../auth/session'
import { reportUnauthorized } from '../api/client'

/**
 * One live connection per signed-in tab (`GET /api/uzivo`, Server-Sent Events read with fetch so
 * the token travels in the Authorization header). Events say only which fault changed; screens
 * re-read their data through the normal API, so what they show always comes from the server.
 *
 * Missed events are never replayed: after a reconnect, a return from the background, or a
 * server-side "resync", listeners get { type: 'resync' } and re-read everything they show.
 */
const LiveContext = createContext(null)

const MAX_BACKOFF_MS = 30000
const HELLO_TIMEOUT_MS = 15000
// While live, a slow safety re-read catches anything missed; while not live (a proxy buffering
// the stream, a firewall), screens fall back to re-reading every 30 s so they never go stale.
const TICK_MS = 30000
const LIVE_RESYNC_TICKS = 4

function parseBlock(block) {
  let event = 'message'
  const data = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (!data.length) return null
  try {
    return { event, data: JSON.parse(data.join('\n')) }
  } catch {
    return null
  }
}

export function LiveProvider({ userId, children }) {
  const listeners = useRef(new Set())
  const [status, setStatus] = useState('connecting')

  const emit = useCallback((message) => {
    for (const listener of [...listeners.current]) {
      try {
        listener(message)
      } catch {
        // One screen's error must not stop the others from updating.
      }
    }
  }, [])

  useEffect(() => {
    if (!userId) return undefined
    let stopped = false
    let controller = null
    let retryTimer = null
    let backoff = 1000
    let everConnected = false
    let lastSeq = 0
    let live = false

    const scheduleRetry = () => {
      if (stopped) return
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
    }

    const handle = ({ event, data }) => {
      if (event === 'hello') {
        live = true
        backoff = 1000
        lastSeq = 0 // sequence numbers restart with the server
        setStatus('live')
        if (everConnected) emit({ type: 'resync' })
        everConnected = true
      } else if (event === 'kvar') {
        if (typeof data?.seq === 'number' && data.seq <= lastSeq) return // duplicate delivery
        lastSeq = data?.seq ?? lastSeq
        emit({ type: 'kvar', kvarId: data.kvar_id, action: data.akcija })
      } else if (event === 'resync') {
        emit({ type: 'resync' })
      } else if (event === 'auth') {
        stopped = true
        reportUnauthorized()
      }
    }

    async function connect() {
      if (stopped) return
      const token = readSession()?.token
      if (!token) return
      controller?.abort()
      const current = new AbortController()
      controller = current
      live = false
      const helloTimer = window.setTimeout(() => {
        if (!live) current.abort() // no greeting: treat as failed and retry
      }, HELLO_TIMEOUT_MS)
      try {
        const response = await fetch('/api/uzivo', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: controller.signal,
        })
        if (response.status === 401) {
          stopped = true
          reportUnauthorized()
          return
        }
        if (!response.ok || !response.body) throw new Error(`stream ${response.status}`)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
          let split
          while ((split = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, split)
            buffer = buffer.slice(split + 2)
            const message = parseBlock(block)
            if (message) handle(message)
          }
        }
      } catch {
        // Network loss, server restart or abort: handled below.
      } finally {
        window.clearTimeout(helloTimer)
      }
      if (stopped || controller !== current) return
      if (live) emit({ type: 'disconnected' })
      setStatus(navigator.onLine === false ? 'offline' : 'reconnecting')
      scheduleRetry()
    }

    const reconnectNow = () => {
      if (stopped) return
      backoff = 1000
      window.clearTimeout(retryTimer)
      connect()
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || stopped) return
      // Phones suspend background tabs; whatever happened meanwhile is re-read now.
      if (live) emit({ type: 'resync' })
      else reconnectNow()
    }
    const onOffline = () => setStatus('offline')
    let ticks = 0
    const safety = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      ticks += 1
      if (!live || ticks % LIVE_RESYNC_TICKS === 0) emit({ type: 'resync' })
    }, TICK_MS)

    connect()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', reconnectNow)
    window.addEventListener('offline', onOffline)
    return () => {
      stopped = true
      controller?.abort()
      window.clearTimeout(retryTimer)
      window.clearInterval(safety)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', reconnectNow)
      window.removeEventListener('offline', onOffline)
    }
  }, [userId, emit])

  const subscribe = useCallback((listener) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe])
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

const OFFLINE = { status: 'off', subscribe: () => () => {} }

export function useLiveStatus() {
  return (useContext(LiveContext) || OFFLINE).status
}

/** Calls `listener(message)` for every live message while mounted. */
export function useLive(listener) {
  const { subscribe } = useContext(LiveContext) || OFFLINE
  const latest = useRef(listener)
  latest.current = listener
  useEffect(() => subscribe((message) => latest.current(message)), [subscribe])
}

/**
 * Re-reads a screen's data when a relevant fault changes (or on resync), coalescing bursts.
 * `matches(message)` narrows fault events; resync always reloads.
 */
export function useLiveRefresh(refresh, matches = () => true, delay = 250) {
  const timer = useRef(null)
  const latest = useRef({ refresh, matches })
  latest.current = { refresh, matches }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useLive((message) => {
    if (message.type === 'disconnected') return
    if (message.type === 'kvar' && !latest.current.matches(message)) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => latest.current.refresh(), delay)
  })
}
