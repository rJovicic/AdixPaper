import api from '../api/axios'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export async function subscribeToPush() {
  const reg = await navigator.serviceWorker.ready

  const { data } = await api.get('/notifikacije/vapid-public-key')
  if (!data.public_key) {
    throw new Error('VAPID ključ nije postavljen na serveru')
  }

  const applicationServerKey = urlBase64ToUint8Array(data.public_key.trim())

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
