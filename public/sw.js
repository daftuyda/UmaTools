const CACHE_VERSION = 'v98';
const STATIC_CACHE = `umatools-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `umatools-runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/events.html',
  '/hints.html',
  '/random.html',
  '/optimizer.html',
  '/calculator.html',
  '/stamina.html',
  '/token-planner.html',
  '/accel.html',
  '/rank-breakdown.html',
  '/umadle.html',
  '/404.html',
  '/robots.txt',
  '/sitemap.xml',
  '/site.webmanifest',
  '/css/air.css',
  '/js/nav.js',
  '/js/rating-shared.js',
  '/js/skill-data.js',
  '/js/tutorial.js',
  '/js/hints.js',
  '/js/random.js',
  '/js/optimizer.js',
  '/js/calculator.js',
  '/js/stamina.js',
  '/js/token-planner.js',
  '/js/accel.js',
  '/js/rank-breakdown.js',
  '/js/umadle.js',
  '/js/search.js',
  '/js/recommend.js',
  '/js/deck.js',
  '/js/skills.js',
  '/js/skill-popup.js',
  '/js/scroll-nav.js',
  '/js/i18n.js',
  '/js/i18n-core.js',
  '/js/i18n-pages.js',
  '/js/ocr.js',
  '/js/skill-scorer.js',
  '/js/team-trials-optimizer.js',
  '/js/changelog.js',
  '/js/theme-toggle.js',
  '/js/lib/virtual-scroll.js',
  '/deck.html',
  '/skills.html',
  '/assets/favicon.ico',
  '/assets/favicon-16x16.png',
  '/assets/favicon-32x32.png',
  '/assets/apple-touch-icon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/umatools-brandmark.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((err) => {
        console.error('[SW] Precache failed:', err);
        throw err;
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('umatools-') && ![STATIC_CACHE, RUNTIME_CACHE].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

function cacheFirst(request) {
  return caches.match(request).then((cached) => cached || fetch(request));
}

let cacheWrites = Promise.resolve();
function storeRuntime(request, response) {
  if (!response || response.status !== 200) return Promise.resolve();
  const copy = response.clone();
  cacheWrites = cacheWrites
    .catch(() => {})
    .then(async () => {
      const bytes = await copy.arrayBuffer();
      if (bytes.byteLength > 8 * 1024 * 1024) return;
      const headers = new Headers(copy.headers);
      headers.delete('Content-Encoding');
      headers.delete('Content-Length');
      headers.set('X-Uma-Cache-Bytes', String(bytes.byteLength));
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.delete(request);
      await cache.put(
        request,
        new Response(bytes, { status: copy.status, statusText: copy.statusText, headers })
      );
      const keys = await cache.keys();
      let total = 0;
      for (let i = keys.length - 1; i >= 0; i--) {
        const entry = await cache.match(keys[i]);
        total += Number(entry.headers.get('X-Uma-Cache-Bytes') || 0);
        if (keys.length - i > 100 || total > 32 * 1024 * 1024) await cache.delete(keys[i]);
      }
    });
  return cacheWrites;
}

function staleWhileRevalidate(request, event) {
  const fetched = fetch(request);
  event.waitUntil(fetched.then((response) => storeRuntime(request, response)).catch(() => {}));
  return caches.open(RUNTIME_CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    return cached || fetched;
  });
}

function networkFirst(request, event) {
  const fetched = fetch(request, { cache: 'no-cache' });
  event.waitUntil(fetched.then((response) => storeRuntime(request, response)).catch(() => {}));
  return fetched.catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const url = new URL(request.url);
    if (request.mode === 'navigate') {
      url.search = '';
      if (!url.pathname.endsWith('.html') && url.pathname !== '/') url.pathname += '.html';
      return (
        (await caches.match(url.href)) || (await caches.match('/404.html')) || Response.error()
      );
    }
    return Response.error();
  });
}

function isCodeAsset(pathname) {
  return pathname.endsWith('.js') || pathname.endsWith('.css');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_vercel/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, event));
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    // Keep code assets fresh without requiring hard refreshes after deploys.
    event.respondWith(
      isCodeAsset(url.pathname) ? networkFirst(request, event) : cacheFirst(request)
    );
    return;
  }

  // Data files: network-first so share links / fresh data always work
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.csv')) {
    event.respondWith(networkFirst(request, event));
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }
});
