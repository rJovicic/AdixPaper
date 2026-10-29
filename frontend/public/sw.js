/* global clients */
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data.json() } catch { data = { title: 'Adix Paper', body: event.data?.text() || '' } }

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    // Same tag = the same fault: the phone replaces the earlier notification instead of stacking copies.
    tag: data.tag || data.url || undefined,
    vibrate: [200, 100, 200],
    requireInteraction: true
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Adix Paper', options)
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  // Only pages of this app: a notification never takes the user to another site.
  let url = '/'
  try {
    const target = new URL(event.notification.data?.url || '/', self.location.origin)
    if (target.origin === self.location.origin) url = target.pathname + target.search + target.hash
  } catch { /* malformed: open the app's home */ }
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
