import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { isNetworkOffline } from "../../lib/networkStatus"
import { hasAnalyticsConsent, subscribePrivacyConsent } from "../../lib/privacyConsent"

const SESSION_STORAGE_KEY = "ctm_visit_session_key_v1"

function createKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `ctm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateSessionKey() {
  if (typeof window === "undefined") return null

  try {
    let sessionKey = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!sessionKey) {
      sessionKey = createKey()
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionKey)
    }
    return sessionKey
  } catch {
    return createKey()
  }
}
function shouldSkipTracking(pathname) {
  if (!pathname) return true
  return pathname.startsWith("/staff")
}

export default function SiteVisitTracker() {
  const location = useLocation()
  const [analyticsAllowed, setAnalyticsAllowed] = useState(() => hasAnalyticsConsent())

  useEffect(() => subscribePrivacyConsent((consent) => {
    setAnalyticsAllowed(consent.analytics === true)
  }), [])

  useEffect(() => {
    const currentPath = location.pathname || "/"

    if (!analyticsAllowed) {
      return
    }

    if (isNetworkOffline()) {
      return
    }

    if (shouldSkipTracking(currentPath)) {
      return
    }

    const sessionKey = getOrCreateSessionKey()
    if (!sessionKey) return

    let cancelled = false

    async function recordVisit() {
      // Send only session_key for simple daily aggregation/deduplication
      const { error } = await supabase.rpc("record_site_visit", {
        p_session_key: sessionKey
      })

      if (cancelled || !error) return

      const message = String(error.message || "")
      if (
        message.includes("Could not find the function public.record_site_visit") ||
        message.includes("permission denied") ||
        message.includes("Access denied")
      ) {
        return
      }
    }

    recordVisit()

    return () => {
      cancelled = true
    }
  }, [analyticsAllowed, location.pathname])

  return null
}
