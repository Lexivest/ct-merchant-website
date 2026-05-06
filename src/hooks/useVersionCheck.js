import { useCallback, useEffect, useRef, useState } from "react"

const VERSION_CHECK_INTERVAL = 300000 // 5 minutes
const VERSION_URL = "/version.json"
const INDEX_URL = "/index.html"

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
 * 2. If a new build is found, do not show a modal and do not reload the active
 *    session. Just warm the latest shell/assets in the background.
 * 3. A normal browser refresh, new tab, or app launch will pick up the latest
 *    files through the no-store index and service worker network-first strategy.
 */
export function useVersionCheck() {
  const [currentVersion, setCurrentVersion] = useState(null)
  const [hasUpdate, setHasUpdate] = useState(false)
  const currentVersionRef = useRef(null)
  const pendingUpdate = useRef(null)
  const lastCheckTime = useRef(0)

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
    }
  }, [fetchVersion])

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
    // When the user returns, quietly warm assets or check again. Never interrupt.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (pendingUpdate.current) {
          void warmLatestBuildAssets(pendingUpdate.current)
        } else if (Date.now() - lastCheckTime.current >= VERSION_CHECK_INTERVAL) {
          void checkUpdates()
        }
      }
    }

    const handleOnline = () => {
      if (pendingUpdate.current) {
        void warmLatestBuildAssets(pendingUpdate.current)
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
  }, [checkUpdates])

  return {
    checkNow: () => checkUpdates(),
    hasUpdate,
  }
}
