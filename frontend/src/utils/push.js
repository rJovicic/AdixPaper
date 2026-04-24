import api from '../api/axios'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export async function subscribeToPush() {
  const reg = await navigator.serviceWorker.ready

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!publicKey) {
    throw new Error('VAPID ključ nije konfiguriran (VITE_VAPID_PUBLIC_KEY)')
  }

  const applicationServerKey = urlBase64ToUint8Array(publicKey.trim())

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  })

  const j = subscription.toJSON()
  await api.post('/notifikacije/pretplata', {
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth
  })

  return subscription
}
