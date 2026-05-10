// Covers chunk-load errors across browsers:
//   Chrome/Edge: "Failed to fetch dynamically imported module"
//   Firefox:     "Loading module from '...' failed." / "error loading module"
//   Safari:      "Load failed" (TypeError on any failed module fetch)
const CHUNK_LOAD_PATTERN =
  /(error loading dynamically imported module|failed to fetch dynamically imported module|importing a module script failed|failed to load module script|loading module from|chunkloaderror|loading chunk|unable to preload css|vite:preloaderror|^load failed$)/i

const RECOVERY_PARAM = "ctm_reload"
const RECOVERY_ATTEMPT_TTL = 1000 * 60 * 2

export function isChunkLoadFailure(error) {
  const message = String(error?.message || error?.reason || error || "").toLowerCase()
  return CHUNK_LOAD_PATTERN.test(message)
}

export function isCriticalAssetLoadFailure(event) {
  const target = event?.target
  const tagName = String(target?.tagName || "").toLowerCase()

  if (!tagName) return false

  // Get the URL of the failing script or stylesheet
  const assetUrl = String(target?.src || target?.href || "").toLowerCase()

  // Only trigger a hard reload if an actual Vite-bundled chunk fails to load.
  // Third-party scripts (Cloudflare) often get blocked by Firefox ETP,
  // and must be silently ignored rather than crashing the application.
  const isViteAsset = assetUrl.includes("/assets/")

  if (tagName === "script") {
    return isViteAsset
  }
  
  if (tagName === "link") {
    const rel = String(target?.rel || "").toLowerCase()
    const isCriticalLink = rel.includes("stylesheet") || rel.includes("modulepreload")
    return isCriticalLink && isViteAsset
  }

  return false
}

export function removeRecoverySearchParam() {
  if (typeof window === "undefined") return

  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(RECOVERY_PARAM)) return
    url.searchParams.delete(RECOVERY_PARAM)
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  } catch {
    // The recovery param is only cosmetic. Ignore cleanup failures.
  }
}

export function hasAttemptedFreshReload(reason = "app") {
  if (typeof window === "undefined") return true

  try {
    const key = `ctm_fresh_reload_${reason}_${window.location.pathname}`
    const attemptedAt = Number(window.sessionStorage.getItem(key) || 0)

    if (!attemptedAt || Date.now() - attemptedAt > RECOVERY_ATTEMPT_TTL) {
      window.sessionStorage.removeItem(key)
      return false
    }

    return true
  } catch {
    return false
  }
}

function markFreshReloadAttempt(reason = "app") {
  if (typeof window === "undefined") return

  try {
    const key = `ctm_fresh_reload_${reason}_${window.location.pathname}`
    window.sessionStorage.setItem(key, String(Date.now()))
  } catch {
    // Best effort only.
  }
}

async function clearBrowserManagedCaches() {
  if (typeof window === "undefined") return

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // Some browsers block this API. Continue with URL cache busting.
  }

  try {
    if ("caches" in window) {
      const cacheNames = await window.caches.keys()
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
    }
  } catch {
    // Cache API is optional and may be unavailable in private mode.
  }
}

export function buildFreshReloadUrl() {
  if (typeof window === "undefined") return ""

  const url = new URL(window.location.href)
  url.searchParams.set(RECOVERY_PARAM, Date.now().toString(36))
  return url.toString()
}

export function forceFreshAppReload({
  reason = "app",
  manual = false,
  clearCaches = true,
} = {}) {
  if (typeof window === "undefined") return false

  if (!manual && hasAttemptedFreshReload(reason)) {
    return false
  }

  if (!manual) {
    markFreshReloadAttempt(reason)
  }

  const nextUrl = buildFreshReloadUrl()

  const reloadTask = clearCaches ? clearBrowserManagedCaches() : Promise.resolve()

  reloadTask.finally(() => {
    window.location.replace(nextUrl)
  })

  return true
}
