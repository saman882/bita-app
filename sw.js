// The app moved to https://royaye-bita.github.io/ — remove this old service worker and its caches.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k)
  await self.registration.unregister()
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('https://royaye-bita.github.io/')
})()))
