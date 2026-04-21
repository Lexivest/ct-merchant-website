const SHELL_CACHE = "ctm-shell-v3";
const STATIC_CACHE = "ctm-static-v3";
const ASSET_CACHE = "ctm-assets-v3";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/ctm-logo.jpg",
  "/favicon.svg",
  "/icons.svg",
];
const INDEX_ASSET_PATTERN = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;

function isCacheableResponse(response) {
  return Boolean(response && response.ok && response.type !== "error");
}

async function putInCache(cacheName, request, response) {
  if (!isCacheableResponse(response)) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrls = []) {
  try {
    const networkResponse = await fetch(request);
    await putInCache(cacheName, request, networkResponse);
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    for (const fallbackUrl of fallbackUrls) {
      if (!fallbackUrl) continue;
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

async function precacheShellAssets() {
  let indexResponse = null;

  try {
    indexResponse = await fetch("/index.html", { cache: "no-store" });
  } catch (error) {
    indexResponse = await caches.match("/index.html");
  }

  if (!isCacheableResponse(indexResponse)) return;

  const shellCache = await caches.open(SHELL_CACHE);
  await shellCache.put("/index.html", indexResponse.clone());

  let html = "";
  try {
    html = await indexResponse.clone().text();
  } catch (error) {
    html = "";
  }

  const assetUrls = Array.from(html.matchAll(INDEX_ASSET_PATTERN))
    .map((match) => match[1])
    .filter(Boolean);

  if (!assetUrls.length) return;

  const assetCache = await caches.open(ASSET_CACHE);

  await Promise.all(
    assetUrls.map(async (assetUrl) => {
      try {
        const response = await fetch(assetUrl, { cache: "no-store" });
        if (!isCacheableResponse(response)) return;
        await assetCache.put(assetUrl, response.clone());
      } catch (error) {
        // Ignore missing assets during install; the cached shell is still usable.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await precacheShellAssets();
    })()
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
    event.respondWith(networkFirst(event.request, SHELL_CACHE, ["/index.html", "/offline.html"]));
    return;
  }

  if (url.pathname === "/index.html") {
    event.respondWith(networkFirst(event.request, SHELL_CACHE, ["/index.html", "/offline.html"]));
    return;
  }

  if (url.pathname === "/offline.html") {
    event.respondWith(networkFirst(event.request, SHELL_CACHE, ["/offline.html"]));
    return;
  }

  if (url.pathname === "/version.json") {
    event.respondWith(networkFirst(event.request, SHELL_CACHE, ["/version.json"]));
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
