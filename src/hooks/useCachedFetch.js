import { useState, useEffect, useRef } from "react"

// Global memory cache to prevent redundant network requests across page navigations
const globalCache = new Map()

export default function useCachedFetch(queryKey, fetchPromise, options = {}) {
  const { 
    ttl = 1000 * 60 * 5, // 5-minute default cache lifespan
    dependencies = [] 
  } = options

  const [tick, setTick] = useState(0) // Used purely to force a re-render
  const isOfflineRef = useRef(!navigator.onLine)
  const errorRef = useRef(null)

  // 1. SYNCHRONOUS CACHE READ
  // By reading the map directly during render, we never suffer from stale useState data
  // when the queryKey changes (like when user.id resolves).
  const cachedEntry = globalCache.get(queryKey)
  const data = cachedEntry ? cachedEntry.data : null
  
  // We are loading if we have no data and no hard error yet
  const loading = !data && !errorRef.current

  useEffect(() => {
    let isMounted = true

    const fetchData = async () => {
      // Offline Check
      if (!navigator.onLine) {
        isOfflineRef.current = true
        if (globalCache.has(queryKey)) {
          if (isMounted) setTick(t => t + 1)
          return
        }
      }

      isOfflineRef.current = false
      errorRef.current = null
      
      if (!globalCache.has(queryKey)) {
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
          } else {
            errorRef.current = "Unable to connect. Please check your network connection."
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

    // Real-time Network Listeners
    const handleOffline = () => {
      isOfflineRef.current = true
      if (isMounted) setTick(t => t + 1)
    }
    
    const handleOnline = () => {
      isOfflineRef.current = false
      fetchData()
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)

    return () => {
      isMounted = false
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
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