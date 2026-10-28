import { useEffect, useState } from 'react'

/**
 * Installing the app on a phone's home screen.
 * - Android/Chromium: the browser fires `beforeinstallprompt`; we keep it and call `prompt()` on
 *   the user's tap. It may fire before React mounts, so it is captured as soon as this module loads.
 * - iPhone/iPad: there is no prompt; Safari's Share → Add to Home Screen is the only way, so we explain it.
 */
let deferredPrompt = null
const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

const DISMISSED_KEY = 'adix.install.dismissed'

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // we show our own, better-timed banner
    deferredPrompt = event
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    remember()
    notify()
  })
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function platform() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  // iPadOS reports itself as a Mac; touch points give it away.
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (iOS) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

export function wasDismissed() {
  try {
    return Boolean(localStorage.getItem(DISMISSED_KEY))
  } catch {
    return false
  }
}

function remember() {
  try {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString())
  } catch {
    // Storage blocked: the banner may show again next visit, nothing worse.
  }
}

export function dismissInstall() {
  remember()
  notify()
}

/** Shows the browser's own install dialog. Resolves 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return 'unavailable'
  deferredPrompt = null
  notify()
  event.prompt()
  const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' }))
  if (choice?.outcome === 'accepted') remember()
  return choice?.outcome || 'dismissed'
}

export function useInstall() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = () => setTick((n) => n + 1)
    listeners.add(listener)
    const media = window.matchMedia?.('(display-mode: standalone)')
    media?.addEventListener?.('change', listener)
    return () => {
      listeners.delete(listener)
      media?.removeEventListener?.('change', listener)
    }
  }, [])
  const where = platform()
  const installed = isStandalone()
  const canPrompt = Boolean(deferredPrompt)
  return {
    installed,
    platform: where,
    canPrompt,
    // Something useful to offer: the native prompt, or instructions on iOS.
    available: !installed && (canPrompt || where === 'ios-safari' || where === 'ios-other'),
    dismissed: wasDismissed(),
  }
}
