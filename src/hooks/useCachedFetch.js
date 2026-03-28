import { useState, useEffect, useRef } from "react"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"

// Global memory cache to prevent redundant network requests across page navigations
const globalCache = new Map()
const activeFetchers = new Map()
let globalListenersAttached = false

function refreshAllActiveFetches() {
  for (const fetcher of activeFetchers.values()) {
    fetcher({ force: true })
  }
}

function ensureGlobalFetchListeners() {
  if (typeof window === "undefined" || globalListenersAttached) return
  globalListenersAttached = true

  const handleResume = () => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      refreshAllActiveFetches()
    }
  }

  const handleVisibilityChange = () => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      typeof navigator !== "undefined" &&
      navigator.onLine
    ) {
      refreshAllActiveFetches()
    }
  }

  window.addEventListener("online", handleResume)
  window.addEventListener("focus", handleResume)
  document.addEventListener("visibilitychange", handleVisibilityChange)
}

export function clearCachedFetchStore(predicate) {
  if (typeof predicate !== "function") {
    globalCache.clear()
    return
  }

  for (const key of globalCache.keys()) {
    if (predicate(key)) {
      globalCache.delete(key)
    }
  }
}

export default function useCachedFetch(queryKey, fetchPromise, options = {}) {
  const { 
    ttl = 1000 * 60 * 5, // 5-minute default cache lifespan
    dependencies = [] 
  } = options

  const [tick, setTick] = useState(0) // Used purely to force a re-render
  const isOfflineRef = useRef(!navigator.onLine)
  const errorRef = useRef(null)

  useEffect(() => {
    ensureGlobalFetchListeners()
  }, [])

  // 1. SYNCHRONOUS CACHE READ
  // By reading the map directly during render, we never suffer from stale useState data
  // when the queryKey changes (like when user.id resolves).
  const cachedEntry = globalCache.get(queryKey)
  const data = cachedEntry ? cachedEntry.data : null
  
  // We are loading if we have no data and no hard error yet
  const loading = !data && !errorRef.current

  useEffect(() => {
    let isMounted = true

    const fetchData = async ({ force = false } = {}) => {
      // Offline Check
      if (!navigator.onLine) {
        isOfflineRef.current = true
        if (globalCache.has(queryKey)) {
          errorRef.current = null
          if (isMounted) setTick(t => t + 1)
          return
        }
        errorRef.current = "Network unavailable. Retry."
        if (isMounted) setTick(t => t + 1)
        return
      }

      isOfflineRef.current = false
      errorRef.current = null
      
      if (force || !globalCache.has(queryKey)) {
         if (isMounted) setTick(t => t + 1) // Force render to show loading shimmer
      }

      try {
        const result = await fetchPromise()
        if (isMounted) {
          globalCache.set(queryKey, { data: result, timestamp: Date.now() })
          errorRef.current = null
          setTick(t => t + 1) // Force render to show new data
        }
      } catch (err) {
        if (isMounted) {
          if (globalCache.has(queryKey)) {
            console.warn(`Background fetch failed for ${queryKey}, falling back to cache.`)
            errorRef.current = null
          } else {
            errorRef.current = getFriendlyErrorMessage(err, "Something went wrong. Please try again.")
          }
          setTick(t => t + 1)
        }
      }
    }

    const cached = globalCache.get(queryKey)
    const isExpired = cached && (Date.now() - cached.timestamp > ttl)

    if (!cached || isExpired) {
      fetchData()
    }

    activeFetchers.set(queryKey, fetchData)

    // Real-time Network Listeners
    const handleOffline = () => {
      isOfflineRef.current = true
      if (globalCache.has(queryKey)) {
        errorRef.current = null
      }
      if (isMounted) setTick(t => t + 1)
    }
    
    const handleOnline = () => {
      isOfflineRef.current = false
      fetchData({ force: true })
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)

    return () => {
      isMounted = false
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
      activeFetchers.delete(queryKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, queryKey])

  return { 
    data, 
    loading, 
    error: errorRef.current, 
    isOffline: isOfflineRef.current 
  }
}
