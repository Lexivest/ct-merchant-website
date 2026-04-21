const SHELL_CACHE = "ctm-shell-v2";
const STATIC_CACHE = "ctm-static-v2";
const ASSET_CACHE = "ctm-assets-v2";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/ctm-logo.jpg",
  "/favicon.svg",
  "/icons.svg",
];

function isCacheableResponse(response) {
  return Boolean(response && response.ok && response.type !== "error");
}

async function putInCache(cacheName, request, response) {
  if (!isCacheableResponse(response)) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl = "") {
  try {
    const networkResponse = await fetch(request);
    await putInCache(cacheName, request, networkResponse);
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    if (fallbackUrl) {
      const fallbackResponse = await caches.match(fallbackUrl);
      if (fallbackResponse) return fallbackResponse;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cachedResponse = await caches.match(request);
  const networkPromise = fetch(request)
    .then((response) => putInCache(cacheName, request, response))
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  return fetch(request);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const activeCaches = new Set([SHELL_CACHE, STATIC_CACHE, ASSET_CACHE]);

  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (!activeCaches.has(cacheName) && cacheName.startsWith("ctm-")) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, SHELL_CACHE, "/index.html"));
    return;
  }

  if (url.pathname === "/index.html") {
    event.respondWith(networkFirst(event.request, SHELL_CACHE, "/index.html"));
    return;
  }

  if (url.pathname === "/version.json") {
    event.respondWith(networkFirst(event.request, SHELL_CACHE));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(staleWhileRevalidate(event.request, ASSET_CACHE));
    return;
  }

  if (
    url.pathname === "/manifest.json" ||
    url.pathname === "/ctm-logo.jpg" ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/icons.svg"
  ) {
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
  }
});
