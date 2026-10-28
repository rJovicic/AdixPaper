import { api } from '../api/client'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushKey() {
  const { data } = await api.get('/notifikacije/vapid-public-key')
  return (data?.public_key || '').trim()
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function enablePush(publicKey) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw Object.assign(new Error('denied'), { code: 'denied' })
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  const { endpoint, keys } = subscription.toJSON()
  await api.post('/notifikacije/pretplata', { endpoint, p256dh: keys.p256dh, auth: keys.auth })
  return subscription
}

/**
 * Stops push on this device. With `token` (signing out) the server copy is removed with that
 * token directly, outside the API client, so a failure there never looks like an expired session.
 * The browser-side unsubscribe alone is enough for the push service to report the endpoint gone.
 */
export async function disablePush({ token, localOnly = false } = {}) {
  if (!pushSupported() || !navigator.serviceWorker.controller) return
  const subscription = await currentSubscription()
  if (!subscription) return
  const { endpoint, keys } = subscription.toJSON()
  const body = { endpoint, p256dh: keys.p256dh, auth: keys.auth }
  if (localOnly) {
    // Expired session: the server would refuse; the push service reports the endpoint gone instead.
  } else if (token) {
    await fetch('/api/notifikacije/pretplata', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }).catch(() => {})
  } else {
    await api.delete('/notifikacije/pretplata', { data: body }).catch(() => {})
  }
  await subscription.unsubscribe()
}
