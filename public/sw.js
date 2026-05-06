const SHELL_CACHE = "ctm-shell-v5";
const STATIC_CACHE = "ctm-static-v5";
const ASSET_CACHE = "ctm-assets-v5";
const NETWORK_FIRST_TIMEOUT_MS = 2500;
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/version.json",
  "/robots.txt",
  "/sitemap.xml",
  "/ctm-logo.jpg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/favicon.svg",
  "/icons.svg",
];
const INDEX_ASSET_PATTERN = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;

function isCacheableResponse(response) {
  return Boolean(response && response.ok && response.type !== "error");
}

function withTimeout(promise, timeoutMs) {
  let timerId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error("Network request timed out")), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId) clearTimeout(timerId);
  });
}

async function fetchWithTimeout(request, timeoutMs = NETWORK_FIRST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(request, {
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timerId);
  }
}

async function putInCache(cacheName, request, response) {
  if (!isCacheableResponse(response)) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrls = [], preloadResponsePromise = null) {
  try {
    if (preloadResponsePromise) {
      const preloadResponse = await withTimeout(preloadResponsePromise, NETWORK_FIRST_TIMEOUT_MS);
      if (isCacheableResponse(preloadResponse)) {
        await putInCache(cacheName, request, preloadResponse);
        return preloadResponse;
      }
    }

    const networkResponse = await fetchWithTimeout(request);
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

async function cacheIndexAssetsFromResponse(indexResponse) {
  let html = "";

  try {
    html = await indexResponse.clone().text();
  } catch {
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
      } catch {
        // Ignore missing assets during refresh; the cached shell remains usable.
      }
    })
  );
}

async function refreshNavigationShell(request, preloadResponsePromise = null) {
  try {
    let response = null;

    if (preloadResponsePromise) {
      response = await withTimeout(preloadResponsePromise, NETWORK_FIRST_TIMEOUT_MS);
    }

    if (!isCacheableResponse(response)) {
      response = await fetchWithTimeout(request);
    }

    if (!isCacheableResponse(response)) return null;

    const shellCache = await caches.open(SHELL_CACHE);
    await shellCache.put(request, response.clone());
    await shellCache.put("/index.html", response.clone());
    await cacheIndexAssetsFromResponse(response.clone());
    return response;
  } catch {
    return null;
  }
}

async function appShellFirst(request, preloadResponsePromise = null) {
  const cachedResponse =
    (await caches.match(request)) ||
    (await caches.match("/index.html"));

  if (cachedResponse) return cachedResponse;

  const networkResponse = await refreshNavigationShell(request, preloadResponsePromise);
  if (networkResponse) return networkResponse;

  const offlineResponse = await caches.match("/offline.html");
  if (offlineResponse) return offlineResponse;

  return networkFirst(request, SHELL_CACHE, ["/index.html", "/offline.html"], preloadResponsePromise);
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
  } catch {
    indexResponse = await caches.match("/index.html");
  }

  if (!isCacheableResponse(indexResponse)) return;

  const shellCache = await caches.open(SHELL_CACHE);
  await shellCache.put("/index.html", indexResponse.clone());

  await cacheIndexAssetsFromResponse(indexResponse);
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
    (async () => {
      if ("navigationPreload" in self.registration) {
        await self.registration.navigationPreload.enable();
      }

      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!activeCaches.has(cacheName) && cacheName.startsWith("ctm-")) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    })()
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
    const cachedResponsePromise =
      caches.match(event.request).then((cachedResponse) =>
        cachedResponse || caches.match("/index.html")
      );

    event.waitUntil(
      cachedResponsePromise.then((cachedResponse) => {
        if (!cachedResponse) return null;
        return refreshNavigationShell(event.request, event.preloadResponse);
      })
    );

    event.respondWith(appShellFirst(event.request, event.preloadResponse));
    return;
  }

  if (url.pathname === "/index.html") {
    event.waitUntil(refreshNavigationShell(event.request));
    event.respondWith(appShellFirst(event.request));
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
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname === "/icon-maskable-512.png" ||
    url.pathname === "/ctm-logo.jpg" ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/icons.svg" ||
    url.pathname === "/robots.txt" ||
    url.pathname === "/sitemap.xml"
  ) {
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
  }
});
