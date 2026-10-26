/* global clients */
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data.json() } catch { data = { title: 'Adix Paper', body: event.data?.text() || '' } }

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: true
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Adix Paper', options)
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
