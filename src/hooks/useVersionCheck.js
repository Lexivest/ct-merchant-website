import { useCallback, useEffect, useRef, useState } from "react"
import { forceFreshAppReload } from "../lib/runtimeRecovery"

const VERSION_CHECK_INTERVAL = 600000 // 10 minutes
const VERSION_URL = "/version.json"

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
export function useVersionCheck() {
  const [currentVersion, setCurrentVersion] = useState(null)
  const pendingUpdate = useRef(false)
  const lastCheckTime = useRef(0)

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
    
    // We only refresh if:
    // 1. User is not currently typing in an input (approximate check)
    // 2. We are on a "safe" path where state loss is minimal
    const activeElement = document.activeElement?.tagName?.toLowerCase()
    const isTyping = activeElement === 'input' || activeElement === 'textarea' || document.activeElement?.isContentEditable
    
    if (isTyping) return

    // If safe, reload fresh
    forceFreshAppReload({ manual: false, reason: "update" })
  }, [])

  const checkUpdates = useCallback(async (isInitial = false) => {
    const serverData = await fetchVersion()
    if (!serverData) return

    if (isInitial) {
      setCurrentVersion(serverData)
      return
    }

    if (!currentVersion) return

    const isNewVersion = 
      serverData.version !== currentVersion?.version || 
      serverData.buildTime > (currentVersion?.buildTime || 0)

    if (isNewVersion) {
      pendingUpdate.current = true
      // Don't interrupt now. Just wait for a good moment.
      // If we are in DEV, we might want to know, but in PROD we stay silent.
    }
  }, [currentVersion, fetchVersion])

  useEffect(() => {
    // 1. Initial Baseline
    checkUpdates(true)

    // 2. Background Polling
    const interval = setInterval(() => {
      if (Date.now() - lastCheckTime.current >= VERSION_CHECK_INTERVAL) {
        lastCheckTime.current = Date.now()
        checkUpdates()
      }
    }, 120000)

    // 3. User Activity Hooks (The "Amazon" way)
    // When user returns to tab, if we have a pending update, refresh now before they start working.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (pendingUpdate.current) {
          attemptSilentUpdate()
        } else if (Date.now() - lastCheckTime.current >= VERSION_CHECK_INTERVAL) {
          lastCheckTime.current = Date.now()
          checkUpdates()
        }
      }
    }

    window.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("online", checkUpdates)
    
    // 4. Global navigation listener for silent swap
    // We can't easily hook into React Router from here without passing it in, 
    // but we can use the window popstate or simply wait for visibility.

    return () => {
      clearInterval(interval)
      window.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", checkUpdates)
    }
  }, [checkUpdates, attemptSilentUpdate])

  return {
    checkNow: () => checkUpdates(),
    hasUpdate: pendingUpdate.current
  }
}
