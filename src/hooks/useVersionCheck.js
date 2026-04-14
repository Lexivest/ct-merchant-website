import { useCallback, useEffect, useRef, useState } from "react"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { forceFreshAppReload } from "../lib/runtimeRecovery"

const VERSION_CHECK_INTERVAL = 300000 // 5 minutes
const VERSION_URL = "/version.json"

export function useVersionCheck() {
  const { confirm } = useGlobalFeedback()
  const [currentVersion, setCurrentVersion] = useState(null)
  const isUpdateDetected = useRef(false)
  const lastCheckTime = useRef(Date.now())

  const fetchVersion = useCallback(async () => {
    try {
      // Use a timestamp to bust the cache of version.json itself
      const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      })
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.warn("Failed to check for app updates:", error)
      return null
    }
  }, [])

  const checkUpdates = useCallback(async (isInitial = false) => {
    // If we've already detected an update, don't keep checking
    if (isUpdateDetected.current) return

    const serverData = await fetchVersion()
    if (!serverData) return

    if (isInitial) {
      setCurrentVersion(serverData)
      return
    }

    if (!currentVersion) return

    // Compare version strings or build times
    const isNewVersion = 
      serverData.version !== currentVersion?.version || 
      serverData.buildTime > (currentVersion?.buildTime || 0)

    if (isNewVersion) {
      isUpdateDetected.current = true
      
      const shouldUpdate = await confirm({
        title: "New Version Available",
        message: "A fresh update for CTMerchant is ready. We recommend updating now to ensure the best experience and smooth operation.",
        confirmText: "Update Now",
        cancelText: "Later",
        type: "info"
      })

      if (shouldUpdate) {
        forceFreshAppReload({ manual: true, reason: "update" })
      }
    }
  }, [currentVersion, fetchVersion, confirm])

  useEffect(() => {
    // Initial fetch to establish baseline
    checkUpdates(true)

    // Periodic check
    const interval = setInterval(() => {
      // Only check if enough time has passed since last check
      // to avoid excessive requests if the app is left open
      if (Date.now() - lastCheckTime.current >= VERSION_CHECK_INTERVAL) {
        lastCheckTime.current = Date.now()
        checkUpdates()
      }
    }, 60000) // Check every minute, but respect the 5-min limit internally

    // Check on window focus
    const handleFocus = () => {
      if (Date.now() - lastCheckTime.current >= VERSION_CHECK_INTERVAL) {
        lastCheckTime.current = Date.now()
        checkUpdates()
      }
    }

    window.addEventListener("focus", handleFocus)
    window.addEventListener("online", handleFocus) // Also check when network is back
    
    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("online", handleFocus)
    }
  }, [checkUpdates])

  return {
    checkNow: () => checkUpdates()
  }
}
