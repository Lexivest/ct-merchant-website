import { useState, useEffect, useRef, useCallback } from "react"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"

// Global memory cache to prevent redundant network requests across page navigations
const globalCache = new Map()
const activeFetchers = new Map()
const MAX_CACHE_SIZE = 150 
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

    for (const fetchData of activeFetchers.values()) {
      fetchData({ force: true })
    }

    return
  }

  for (const key of Array.from(globalCache.keys())) {
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
  } catch { /* ignore */ }

  for (const [key, fetchData] of activeFetchers.entries()) {
    if (predicate(key)) {
      fetchData({ force: true })
    }
  }
}

export function invalidateCachedFetchStore(predicate) {
  if (typeof predicate !== "function") return

  for (const [key, entry] of globalCache.entries()) {
    if (predicate(key)) {
      entry.timestamp = 0 
    }
  }

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      Object.keys(window.sessionStorage).forEach((storageKey) => {
        if (!storageKey.startsWith(SESSION_CACHE_PREFIX)) return
        const cacheKey = storageKey.slice(SESSION_CACHE_PREFIX.length)
        if (predicate(cacheKey)) {
          const raw = window.sessionStorage.getItem(storageKey)
          if (raw) {
            const entry = JSON.parse(raw)
            entry.timestamp = 0
            window.sessionStorage.setItem(storageKey, JSON.stringify(entry))
          }
        }
      })
    }
  } catch { /* ignore */ }

  for (const [key, fetchData] of activeFetchers.entries()) {
    if (predicate(key)) {
      fetchData({ force: true })
    }
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
    ttl = 1000 * 60 * 5,
    dependencies = [],
    persist = null,
    skip = false,
  } = options

  // Combined state object for atomic updates and consistent renders
  const [state, setState] = useState({
    data: getCacheEntry(queryKey)?.data || null,
    loading: false,
    error: null,
    isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
    isRevalidating: false
  })
  
  const persistMode = persist === true ? "session" : persist

  useEffect(() => {
    ensureGlobalFetchListeners()
  }, [])

  useEffect(() => {
    if (skip) {
      setState(prev => ({ ...prev, loading: false }))
      return undefined
    }
    
    let isMounted = true

    const fetchData = async ({ force = false } = {}) => {
      const cachedEntry = getCacheEntry(queryKey)
      const isExpired = cachedEntry && (Date.now() - cachedEntry.timestamp > ttl)
      const offline = typeof navigator !== "undefined" ? !navigator.onLine : false

      // 1. Skip if data is fresh and not forced
      if (!force && cachedEntry && !isExpired) {
        if (isMounted) {
          setState(prev => ({ 
            ...prev, 
            data: cachedEntry.data, 
            loading: false, 
            error: null, 
            isOffline: offline 
          }))
        }
        return
      }

      // 2. Handle Offline
      if (offline) {
        if (isMounted) {
          setState(prev => ({
            ...prev,
            data: cachedEntry?.data || prev.data,
            isOffline: true,
            loading: false,
            error: cachedEntry ? null : "Network unavailable. Please reconnect."
          }))
        }
        return
      }

      // 3. Trigger Fetch
      if (isMounted) {
        setState(prev => ({
          ...prev,
          loading: !prev.data,
          isRevalidating: !!prev.data,
          isOffline: false,
          error: null
        }))
      }

      try {
        const result = await fetchPromise()
        if (isMounted) {
          primeCachedFetchStore(queryKey, result, Date.now(), { persist: persistMode })
          setState({
            data: result,
            loading: false,
            isRevalidating: false,
            isOffline: false,
            error: null
          })
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = getFriendlyErrorMessage(err, "Could not load data. Please retry.")
          const currentCached = getCacheEntry(queryKey)

          setState(prev => ({
            ...prev,
            data: currentCached?.data || prev.data,
            loading: false,
            isRevalidating: false,
            // Only show hard error UI if we have NO data to show
            error: currentCached ? null : errorMessage
          }))

          if (!currentCached && persistMode === "session") {
            removeSessionCacheEntry(queryKey)
          }
        }
      }
    }

    fetchData()
    activeFetchers.set(queryKey, fetchData)

    const handleOnline = () => fetchData({ force: true })
    window.addEventListener("online", handleOnline)

    return () => {
      isMounted = false
      window.removeEventListener("online", handleOnline)
      activeFetchers.delete(queryKey)
    }
  }, [...dependencies, queryKey, skip, ttl])

  const mutate = useCallback(() => {
    const fetcher = activeFetchers.get(queryKey)
    if (fetcher) fetcher({ force: true })
  }, [queryKey])

  return { ...state, mutate }
}
