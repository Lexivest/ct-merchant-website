import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabase"

const VISITOR_STORAGE_KEY = "ctm_visitor_key_v1"
const SESSION_STORAGE_KEY = "ctm_visit_session_key_v1"

function createKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `ctm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateVisitorKey() {
  if (typeof window === "undefined") return null

  try {
    let visitorKey = window.localStorage.getItem(VISITOR_STORAGE_KEY)
    if (!visitorKey) {
      visitorKey = createKey()
      window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorKey)
    }
    return visitorKey
  } catch {
    return createKey()
  }
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
  const previousPathRef = useRef("")

  useEffect(() => {
    const currentPath = location.pathname || "/"

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      previousPathRef.current = currentPath
      return
    }

    if (shouldSkipTracking(currentPath)) {
      previousPathRef.current = currentPath
      return
    }

    const sessionKey = getOrCreateSessionKey()
    const visitorKey = getOrCreateVisitorKey()
    const referrerPath = previousPathRef.current || null
    previousPathRef.current = currentPath

    if (!sessionKey || !visitorKey) return

    let cancelled = false

    async function recordVisit() {
      const { error } = await supabase.rpc("record_site_visit", {
        p_session_key: sessionKey,
        p_visitor_key: visitorKey,
        p_page_path: currentPath,
        p_referrer_path: referrerPath,
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

      console.warn("Site visit tracking skipped:", message)
    }

    recordVisit()

    return () => {
      cancelled = true
    }
  }, [location.pathname])

  return null
}
