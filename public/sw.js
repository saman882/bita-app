// App shell cache. Data (Supabase) always goes to the network.
const CACHE = 'bita-v3'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  // Pages: try the network, but if it is slow (>4s) open the cached copy and refresh it in the background
  if (e.request.mode === 'navigate') {
    const net = fetch(e.request).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put('./index.html', c)) } return res })
    e.respondWith(Promise.race([net, timeout(4000)]).catch(() => caches.match('./index.html').then((hit) => hit || net)))
    return
  }
  // Code, fonts, icons (file names change on every release): cache first, then network
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)) }
    return res
  })))
})
