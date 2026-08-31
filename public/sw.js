const CACHE_VERSION = 'v91';
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
  '/collection.html',
  '/js/collection.js',
  '/skills.html',
  '/assets/favicon.ico',
  '/assets/favicon-16x16.png',
  '/assets/favicon-32x32.png',
  '/assets/apple-touch-icon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/umatools-brandmark.svg',
  '/assets/Rank_tex.webp',
  '/assets/Rank_tex.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((err) => console.error('[SW] Precache failed:', err))
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

function staleWhileRevalidate(request) {
  return caches.open(RUNTIME_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
}

function networkFirst(request) {
  return fetch(request, { cache: 'no-cache' })
    .then((response) => {
      if (response && response.status === 200) {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request));
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
    event.respondWith(networkFirst(request));
    return;
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    // Keep code assets fresh without requiring hard refreshes after deploys.
    event.respondWith(isCodeAsset(url.pathname) ? networkFirst(request) : cacheFirst(request));
    return;
  }

  // Data files: network-first so share links / fresh data always work
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.csv')) {
    event.respondWith(networkFirst(request));
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
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});
