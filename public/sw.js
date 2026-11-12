// App shell cache. Data (Supabase) always goes to the network.
const CACHE = 'bita-v4'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

// A new version took over: drop old caches and reload open pages so nobody keeps running old code.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    const hadOld = keys.some((k) => k !== CACHE)
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
    if (hadOld) {
      const wins = await self.clients.matchAll({ type: 'window' })
      for (const w of wins) { try { await w.navigate(w.url) } catch (err) { /* ignore */ } }
    }
  })())
})

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
const entry = (html) => (html.match(/assets\/index-[\w-]+\.js/) || [''])[0]

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return
  // Pages: network first. If the network is slow (>4s) open the cached copy; when the fresh page
  // arrives and it is a newer release, store it and tell the open page to reload.
  if (e.request.mode === 'navigate') {
    let servedCache = false
    const net = fetch(e.request, { cache: 'no-store' }).then(async (res) => {
      if (res.ok) {
        const html = await res.clone().text()
        const cache = await caches.open(CACHE)
        const old = await cache.match('./index.html')
        const oldHtml = old ? await old.text() : ''
        await cache.put('./index.html', res.clone())
        if (servedCache && entry(html) && entry(html) !== entry(oldHtml)) {
          const wins = await self.clients.matchAll({ type: 'window' })
          wins.forEach((w) => w.postMessage('bita-update'))
        }
      }
      return res
    })
    e.respondWith(Promise.race([net, timeout(4000)]).catch(() =>
      caches.match('./index.html').then((hit) => { if (hit) { servedCache = true; return hit } return net })))
    e.waitUntil(net.catch(() => {}))
    return
  }
  // Code, fonts, icons (file names change on every release): cache first, then network
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)) }
    return res
  })))
})
