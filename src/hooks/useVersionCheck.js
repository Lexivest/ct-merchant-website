import { useCallback, useEffect, useRef, useState } from "react"
import { isNetworkOffline } from "../lib/networkStatus"
import { forceFreshAppReload } from "../lib/runtimeRecovery"

const VERSION_CHECK_INTERVAL = 300000 // 5 minutes
const VERSION_URL = "/version.json"
const INDEX_URL = "/index.html"
const SILENT_UPDATE_IDLE_TIMEOUT = 4000
const UNSAFE_UPDATE_PATHS = [
  "/create-account",
  "/shop-registration",
  "/merchant-add-product",
  "/merchant-edit-product",
  "/merchant-banner",
  "/merchant-news",
  "/merchant-promo-banner",
  "/merchant-settings",
  "/merchant-video-kyc",
  "/service-fee",
  "/remita",
  "/staff-studio",
]

function isUnsafeUpdatePath(pathname = "") {
  return UNSAFE_UPDATE_PATHS.some((path) => pathname.startsWith(path))
}

function canSwapSilently(pathname = "") {
  return !isUnsafeUpdatePath(pathname)
}

function getAssetUrlsFromHtml(htmlText) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return []
  }

  try {
    const doc = new DOMParser().parseFromString(htmlText, "text/html")
    const assetNodes = doc.querySelectorAll(
      'script[src], link[rel="modulepreload"][href], link[rel="stylesheet"][href]'
    )

    return [...assetNodes]
      .map((node) => node.getAttribute("src") || node.getAttribute("href") || "")
      .map((value) => {
        try {
          const url = new URL(value, window.location.origin)
          return url.origin === window.location.origin ? url.toString() : ""
        } catch {
          return ""
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

async function warmLatestBuildAssets(serverData) {
  if (typeof window === "undefined") return

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      await registration?.update()
    }
  } catch {
    // Best effort only.
  }

  const indexResponse = await fetch(
    `${INDEX_URL}?ctm_version_prefetch=${serverData?.buildTime || Date.now()}`,
    {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    }
  )

  if (!indexResponse.ok) return

  const htmlText = await indexResponse.text()
  const assetUrls = getAssetUrlsFromHtml(htmlText)
  const urlsToWarm = [...new Set(assetUrls)]

  await Promise.allSettled(
    urlsToWarm.map((assetUrl) =>
      fetch(assetUrl, {
        cache: "reload",
        credentials: "same-origin",
      })
    )
  )
}

/**
 * Amazon-style Silent Update Logic
 * 1. Periodically check version.json in background.
 * 2. If new version found, don't show a modal.
 * 3. Instead, mark update as pending.
 * 4. Try to reload silently when:
 *    - The user returns to the tab after a long time.
 *    - The browser is idle.
 *    - (Optional) Next navigation.
 */
export function useVersionCheck({ pathname = "" } = {}) {
  const [currentVersion, setCurrentVersion] = useState(null)
  const [hasUpdate, setHasUpdate] = useState(false)
  const currentVersionRef = useRef(null)
  const pendingUpdate = useRef(null)
  const lastCheckTime = useRef(0)
  const reloadScheduledRef = useRef(false)

  useEffect(() => {
    currentVersionRef.current = currentVersion
  }, [currentVersion])

  const fetchVersion = useCallback(async () => {
    try {
      const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      })
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }, [])

  const attemptSilentUpdate = useCallback(() => {
    if (!pendingUpdate.current) return
    if (typeof document === "undefined") return
    if (isNetworkOffline()) return
    if (!canSwapSilently(pathname)) return
    
    // We only refresh if:
    // 1. User is not currently typing in an input (approximate check)
    // 2. We are on a "safe" path where state loss is minimal
    const activeElement = document.activeElement?.tagName?.toLowerCase()
    const isTyping =
      activeElement === "input" ||
      activeElement === "textarea" ||
      document.activeElement?.isContentEditable
    
    if (document.visibilityState === "visible" && isTyping) return

    // If safe, reload fresh
    const reloading = forceFreshAppReload({
      manual: false,
      reason: "update",
      clearCaches: false,
    })

    if (reloading) {
      pendingUpdate.current = null
      setHasUpdate(false)
    }
  }, [pathname])

  const scheduleSilentUpdate = useCallback(() => {
    if (!pendingUpdate.current || reloadScheduledRef.current) return
    if (!canSwapSilently(pathname)) return

    reloadScheduledRef.current = true

    const run = () => {
      reloadScheduledRef.current = false
      attemptSilentUpdate()
    }

    if (
      typeof window !== "undefined" &&
      document.visibilityState === "visible" &&
      "requestIdleCallback" in window
    ) {
      const idleId = window.requestIdleCallback(run, {
        timeout: SILENT_UPDATE_IDLE_TIMEOUT,
      })
      window.setTimeout(() => {
        if (!reloadScheduledRef.current) return
        reloadScheduledRef.current = false
        window.cancelIdleCallback(idleId)
        attemptSilentUpdate()
      }, SILENT_UPDATE_IDLE_TIMEOUT + 500)
      return
    }

    window.setTimeout(run, document.visibilityState === "hidden" ? 200 : 1200)
  }, [attemptSilentUpdate, pathname])

  const checkUpdates = useCallback(async (isInitial = false) => {
    lastCheckTime.current = Date.now()
    const serverData = await fetchVersion()
    if (!serverData) return

    if (isInitial) {
      setCurrentVersion(serverData)
      return
    }

    const baselineVersion = currentVersionRef.current
    if (!baselineVersion) return

    const isNewVersion = 
      serverData.version !== baselineVersion.version || 
      serverData.buildTime > (baselineVersion.buildTime || 0)

    if (isNewVersion) {
      const samePendingVersion =
        pendingUpdate.current?.version === serverData.version &&
        pendingUpdate.current?.buildTime === serverData.buildTime

      pendingUpdate.current = serverData
      setHasUpdate(true)

      if (!samePendingVersion) {
        void warmLatestBuildAssets(serverData)
      }

      scheduleSilentUpdate()
    }
  }, [fetchVersion, scheduleSilentUpdate])

  useEffect(() => {
    // 1. Initial Baseline
    const initialCheckTimer = window.setTimeout(() => {
      void checkUpdates(true)
    }, 0)

    // 2. Background Polling
    const interval = setInterval(() => {
      if (Date.now() - lastCheckTime.current >= VERSION_CHECK_INTERVAL) {
        void checkUpdates()
      }
    }, 120000)

    // 3. User Activity Hooks (The "Amazon" way)
    // When user returns to tab, if we have a pending update, refresh now before they start working.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (pendingUpdate.current) {
          scheduleSilentUpdate()
        } else if (Date.now() - lastCheckTime.current >= VERSION_CHECK_INTERVAL) {
          void checkUpdates()
        }
        return
      }

      if (pendingUpdate.current) scheduleSilentUpdate()
    }

    const handleOnline = () => {
      if (pendingUpdate.current) {
        scheduleSilentUpdate()
        return
      }
      void checkUpdates()
    }

    window.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("online", handleOnline)
    
    // 4. Global navigation listener for silent swap
    // We can't easily hook into React Router from here without passing it in, 
    // but we can use the window popstate or simply wait for visibility.

    return () => {
      window.clearTimeout(initialCheckTimer)
      clearInterval(interval)
      window.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", handleOnline)
    }
  }, [checkUpdates, scheduleSilentUpdate])

  useEffect(() => {
    if (!pendingUpdate.current) return
    scheduleSilentUpdate()
  }, [pathname, scheduleSilentUpdate])

  return {
    checkNow: () => checkUpdates(),
    hasUpdate,
  }
}
