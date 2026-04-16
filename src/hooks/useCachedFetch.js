import { useState, useEffect, useRef, useCallback } from "react"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"

// Global memory cache to prevent redundant network requests across page navigations
const globalCache = new Map()
const activeFetchers = new Map()
const MAX_CACHE_SIZE = 150 // Prevent memory leaks for heavy browsing sessions
const SESSION_CACHE_PREFIX = "ctm_cached_fetch:"
let globalListenersAttached = false
let globalRefreshTimerId = null

function getSessionCacheKey(queryKey) {
  return `${SESSION_CACHE_PREFIX}${queryKey}`
}

function readSessionCacheEntry(queryKey) {
  if (!queryKey) return null

  try {
    if (typeof window !== "undefined") {
      const storage = window.sessionStorage
      if (storage) {
        const rawValue = storage.getItem(getSessionCacheKey(queryKey))
        if (!rawValue) return null

        const parsed = JSON.parse(rawValue)
        if (!parsed || typeof parsed.timestamp !== "number") {
          try { storage.removeItem(getSessionCacheKey(queryKey)) } catch { /* ignore */ }
          return null
        }

        return parsed
      }
    }
  } catch (error) {
    console.warn("Session storage read blocked:", error.message)
  }
  return null
}

function writeSessionCacheEntry(queryKey, entry) {
  if (!queryKey || !entry) return

  try {
    if (typeof window !== "undefined") {
      const storage = window.sessionStorage
      if (storage) {
        storage.setItem(getSessionCacheKey(queryKey), JSON.stringify(entry))
      }
    }
  } catch (error) {
    console.warn("Session storage write blocked:", error.message)
  }
}

function removeSessionCacheEntry(queryKey) {
  if (!queryKey) return

  try {
    if (typeof window !== "undefined") {
      const storage = window.sessionStorage
      if (storage) {
        storage.removeItem(getSessionCacheKey(queryKey))
      }
    }
  } catch (error) {
    console.warn("Session storage remove blocked:", error.message)
  }
}

function getCacheEntry(queryKey) {
  if (!queryKey) return null

  const inMemoryEntry = globalCache.get(queryKey)
  if (inMemoryEntry) return inMemoryEntry

  const persistedEntry = readSessionCacheEntry(queryKey)
  if (!persistedEntry) return null

  if (globalCache.size >= MAX_CACHE_SIZE && !globalCache.has(queryKey)) {
    const firstKey = globalCache.keys().next().value
    globalCache.delete(firstKey)
  }

  globalCache.set(queryKey, persistedEntry)
  return persistedEntry
}

function refreshAllActiveFetches() {
  for (const fetcher of activeFetchers.values()) {
    fetcher({ force: true })
  }
}

function ensureGlobalFetchListeners() {
  if (typeof window === "undefined" || globalListenersAttached) return
  globalListenersAttached = true

  const scheduleRefresh = () => {
    if (globalRefreshTimerId) {
      window.clearTimeout(globalRefreshTimerId)
    }

    globalRefreshTimerId = window.setTimeout(() => {
      globalRefreshTimerId = null
      refreshAllActiveFetches()
    }, 150)
  }

  const handleResume = () => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      scheduleRefresh()
    }
  }

  const handleVisibilityChange = () => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      typeof navigator !== "undefined" &&
      navigator.onLine
    ) {
      scheduleRefresh()
    }
  }

  window.addEventListener("online", handleResume)
  window.addEventListener("focus", handleResume)
  document.addEventListener("visibilitychange", handleVisibilityChange)
}

export function clearCachedFetchStore(predicate) {
  if (typeof predicate !== "function") {
    globalCache.clear()

    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        Object.keys(window.sessionStorage).forEach((key) => {
          if (key.startsWith(SESSION_CACHE_PREFIX)) {
            window.sessionStorage.removeItem(key)
          }
        })
      }
    } catch { /* ignore */ }

    return
  }

  for (const key of globalCache.keys()) {
    if (predicate(key)) {
      globalCache.delete(key)
    }
  }

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      Object.keys(window.sessionStorage).forEach((storageKey) => {
        if (!storageKey.startsWith(SESSION_CACHE_PREFIX)) return

        const cacheKey = storageKey.slice(SESSION_CACHE_PREFIX.length)
        if (predicate(cacheKey)) {
          window.sessionStorage.removeItem(storageKey)
        }
      })
    }
  } catch {
    // ignore
  }
}

export function primeCachedFetchStore(queryKey, data, timestamp = Date.now(), options = {}) {
  if (!queryKey) return

  const persistMode =
    options === true ? "session" : options?.persist || null

  if (globalCache.size >= MAX_CACHE_SIZE && !globalCache.has(queryKey)) {
    const firstKey = globalCache.keys().next().value
    globalCache.delete(firstKey)
  }

  const entry = { data, timestamp }
  globalCache.set(queryKey, entry)

  if (persistMode === "session") {
    writeSessionCacheEntry(queryKey, entry)
  }
}

export function readCachedFetchStore(queryKey) {
  return getCacheEntry(queryKey)
}

export default function useCachedFetch(queryKey, fetchPromise, options = {}) {
  const { 
    ttl = 1000 * 60 * 5, // 5-minute default cache lifespan
    dependencies = [],
    persist = null,
    skip = false,
  } = options

  const [, setTick] = useState(0) // Used purely to force a re-render
  const isOfflineRef = useRef(typeof navigator !== "undefined" ? !navigator.onLine : false)
  const errorRef = useRef(null)
  const isRevalidatingRef = useRef(false)
  const persistMode = persist === true ? "session" : persist

  useEffect(() => {
    ensureGlobalFetchListeners()
  }, [])

  // 1. SYNCHRONOUS CACHE READ
  const cachedEntry = getCacheEntry(queryKey)
  const isExpired = cachedEntry && (Date.now() - cachedEntry.timestamp > ttl)
  const data = (cachedEntry && !isExpired) ? cachedEntry.data : null
  
  // We are loading if we have no valid data, no hard error, and we are not skipping
  const loading = !data && !errorRef.current && !skip

  useEffect(() => {
    if (skip) return undefined
    
    let isMounted = true

    const fetchData = async ({ force = false } = {}) => {
      const currentCachedEntry = getCacheEntry(queryKey)
      const currentIsExpired = currentCachedEntry && (Date.now() - currentCachedEntry.timestamp > ttl)

      if (!force && currentCachedEntry && !currentIsExpired) {
        if (isMounted) setTick(t => t + 1) // Ensure component knows we checked
        return
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        isOfflineRef.current = true
        if (currentCachedEntry) {
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
      
      if (currentCachedEntry) {
        isRevalidatingRef.current = true
      } else {
        if (isMounted) setTick(t => t + 1)
      }

      try {
        const result = await fetchPromise()
        if (isMounted) {
          primeCachedFetchStore(queryKey, result, Date.now(), { persist: persistMode })
          errorRef.current = null
          isRevalidatingRef.current = false
          setTick(t => t + 1)
        }
      } catch (err) {
        if (isMounted) {
          isRevalidatingRef.current = false
          if (getCacheEntry(queryKey)) {
            console.warn(`Background fetch failed for ${queryKey}, falling back to cache.`)
            errorRef.current = null
          } else {
            errorRef.current = getFriendlyErrorMessage(err, "Something went wrong. Please try again.")
            if (persistMode === "session") {
              removeSessionCacheEntry(queryKey)
            }
          }
          setTick(t => t + 1)
        }
      }
    }

    fetchData()

    activeFetchers.set(queryKey, fetchData)

    const handleOffline = () => {
      isOfflineRef.current = true
      if (globalCache.has(queryKey)) {
        errorRef.current = null
      }
      if (isMounted) setTick(t => t + 1)
    }
    
    window.addEventListener("offline", handleOffline)

    return () => {
      isMounted = false
      window.removeEventListener("offline", handleOffline)
      activeFetchers.delete(queryKey)
    }
  }, [...dependencies, queryKey, skip, ttl])

  const mutate = useCallback(() => {
    const fetcher = activeFetchers.get(queryKey)
    if (fetcher) fetcher({ force: true })
  }, [queryKey])

  return { 
    data, 
    loading, 
    isRevalidating: isRevalidatingRef.current,
    error: errorRef.current, 
    isOffline: isOfflineRef.current,
    mutate
  }
}
