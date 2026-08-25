/**
 * Service Worker — Driver Finance App
 *
 * Responsibilities:
 *  1. App-shell caching so the driver UI loads instantly, even offline
 *  2. Background Sync: retries pending Dexie records even after the app is closed
 *     - 'sync-pending-rides'    → messages open app clients to trigger syncEngine
 *     - 'sync-pending-expenses' → same for expenses
 *  3. Cache invalidation: removes stale caches on activate
 */

const CACHE_NAME = 'driver-finance-v2';

const APP_SHELL = [
  '/',
  '/driver',
  '/manifest.json',
];

// ─── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  // Take control immediately — don't wait for old SW to retire
  self.skipWaiting();
});

// ─── Activate: remove old caches ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: stale-while-revalidate for shell, network-only for API/Supabase ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for API routes and Supabase (never cache auth/data)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      // Serve cached immediately, update cache in background
      return cached || networkFetch;
    })
  );
});

// ─── Background Sync ──────────────────────────────────────────────────────────
// The browser will fire 'sync' events when connectivity is restored,
// even if the app tab is not open. We message all open app clients
// to run the sync engine (which reads from Dexie and upserts to Supabase).
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-rides') {
    event.waitUntil(notifyClientsToSync('rides'));
  }
  if (event.tag === 'sync-pending-expenses') {
    event.waitUntil(notifyClientsToSync('expenses'));
  }
});

async function notifyClientsToSync(type) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clients.length === 0) {
    // No open tabs — we can't run the JS sync engine.
    // Throw so the browser keeps the sync event queued and retries later.
    throw new Error('[SW] No open clients to handle sync');
  }
  for (const client of clients) {
    client.postMessage({ type: 'BACKGROUND_SYNC', payload: type });
  }
}

// ─── Messages from the app ────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
