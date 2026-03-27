/**
 * OpenSketch Service Worker — Offline-first caching
 * Cache-first for app shell (HTML, JS, CSS, WASM), network-first for API calls
 */

const CACHE_VERSION = "opensketch-v1";
const APP_SHELL = ["/", "/index.html"];

// Install: precache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app assets, network-first for everything else
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // API/WebSocket requests: network only
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) {
    return;
  }

  // App assets: cache-first, fallback to network (then cache)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses for static assets
        if (response.ok && isStaticAsset(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === "navigate") {
          return caches.match("/index.html");
        }
        return new Response("Offline", { status: 503 });
      });
    })
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".wasm") ||
    pathname.endsWith(".html") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".woff2") ||
    pathname === "/"
  );
}
