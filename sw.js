const CACHE_STATIC = 'dentat-static-v5';
const CACHE_TILES  = 'dentat-tiles-v1';
const MAX_TILES    = 200;

// App shell — cache được thì tốt, lỗi 1 URL KHÔNG làm hỏng toàn bộ cài đặt SW
const STATIC_ASSETS = [
  './dentat.html',
  './bcsc.html',
  './huongdan.html',
  './quytrinh.html',
  './manifest.json',
  './images/icon-192.png',
  './images/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC).then(async cache => {
      // addAll là "tất cả hoặc không" → 1 URL lỗi là hỏng cài SW (mất offline).
      // Dùng add từng cái + allSettled để bỏ qua asset lỗi, vẫn cài được SW.
      await Promise.allSettled(STATIC_ASSETS.map(u => cache.add(u)));
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_STATIC && k !== CACHE_TILES)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isHtmlShell(url) {
  return url.endsWith('dentat.html') || url.endsWith('bcsc.html')
      || url.endsWith('huongdan.html') || url.endsWith('quytrinh.html')
      || url.endsWith('/Den%20tat/') || url.endsWith('/Den%20tat')
      || /\/dentat\/?$/.test(url);
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;   // không can thiệp POST (GAS ghi dữ liệu)
  const url = e.request.url;

  // Không cache: Google Sheet CSV, Apps Script (luôn cần dữ liệu mới nhất)
  if (url.includes('docs.google.com') || url.includes('script.google.com')) {
    return; // để trình duyệt xử lý mặc định
  }

  // Cache tile bản đồ (OSM + Google)
  if (url.includes('tile.openstreetmap.org') || url.includes('google.com/vt')) {
    e.respondWith(
      caches.open(CACHE_TILES).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const response = await fetch(e.request);
        if (response && response.ok) {
          cache.put(e.request, response.clone());
          trimCache(cache, MAX_TILES);
        }
        return response;
      }).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Network-first cho HTML shell (luôn lấy bản mới, fallback cache khi offline)
  if (isHtmlShell(url)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first cho static assets còn lại (CSS, JS, fonts, icon)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

async function trimCache(cache, maxItems) {
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // xóa các tile cũ nhất cho tới khi về giới hạn
    for (let i = 0; i < keys.length - maxItems; i++) await cache.delete(keys[i]);
  }
}
