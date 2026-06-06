import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { isNetworkOffline } from "../../lib/networkStatus"

// Per-tab session key — used only for the raw page-view counter (total_visits).
const SESSION_STORAGE_KEY = "ctm_visit_session_key_v1"

// Per-day dedup markers, kept in the visitor's OWN localStorage. These never
// leave the browser — they only let the client decide whether it has already
// been counted today, so the server can stay a pure aggregate counter with no
// session key, visitor id, device info, or IP stored anywhere.
const SITE_COUNTED_KEY = "ctm_unique_site_date_v1"
const HOME_COUNTED_KEY = "ctm_unique_home_date_v1"

function createKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `ctm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateSessionKey() {
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

// Lagos calendar date (matches the server's Africa/Lagos day boundary) as
// YYYY-MM-DD, so "once per day" lines up on both sides.
function getLagosDateKey() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function readMarker(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeMarker(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Best effort — if storage is unavailable the visit simply isn't deduped.
  }
}

function isHomePath(pathname) {
  return pathname === "/" || pathname === ""
}

function shouldSkipTracking(pathname) {
  if (!pathname) return true
  return pathname.startsWith("/staff")
}

export default function SiteVisitTracker() {
  const location = useLocation()

  useEffect(() => {
    const currentPath = location.pathname || "/"

    if (isNetworkOffline()) return
    if (shouldSkipTracking(currentPath)) return
    if (typeof window === "undefined") return

    const today = getLagosDateKey()
    const isHome = isHomePath(currentPath)

    // First page of the day for this browser → count one unique site visit.
    const countSite = readMarker(SITE_COUNTED_KEY) !== today
    // First homepage hit of the day for this browser → count one unique home visit.
    const countHome = isHome && readMarker(HOME_COUNTED_KEY) !== today

    let cancelled = false

    // Raw page-view counter: fires on every navigation (powers the dashboard
    // "Visits" tile). The server discards the session key — it's only here to
    // satisfy the existing RPC signature.
    async function recordPageView() {
      await supabase.rpc("record_site_visit", { p_session_key: getOrCreateSessionKey() })
    }

    // Unique counters: at most one call per browser per day.
    async function recordUnique() {
      const { error } = await supabase.rpc("record_unique_visit", {
        p_count_site: countSite,
        p_count_home: countHome,
      })

      if (cancelled || error) return

      // Only mark as counted once the server confirmed it — a failed call
      // (offline, etc.) is retried on the next navigation rather than lost.
      if (countSite) writeMarker(SITE_COUNTED_KEY, today)
      if (countHome) writeMarker(HOME_COUNTED_KEY, today)
    }

    recordPageView()
    if (countSite || countHome) recordUnique()

    return () => {
      cancelled = true
    }
  }, [location.pathname])

  return null
}
