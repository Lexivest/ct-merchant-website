import { useEffect, useRef, useState } from "react"

export const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Crect width='100%25' height='100%25' fill='%23F1F5F9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748B' font-family='Arial' font-size='44'%3ECTM%3C/text%3E%3C/svg%3E"

// 1. Prevent memory leaks by capping the loaded image cache
const MAX_IMAGE_CACHE_SIZE = 500
const loadedImageCache = new Set()

// 2. Singleton Intersection Observer for extreme performance (solves the N+1 observer problem)
const observerListeners = new WeakMap()
let sharedObserver = null

function getSharedObserver() {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const callback = observerListeners.get(entry.target)
            if (callback) {
              callback()
              observerListeners.delete(entry.target)
              sharedObserver.unobserve(entry.target)
            }
          }
        })
      },
      { rootMargin: "250px 0px" }
    )
  }
  return sharedObserver
}

function StableImage({
  src,
  alt = "",
  fallbackSrc = DEFAULT_FALLBACK_IMAGE,
  containerClassName = "",
  className = "",
  placeholderClassName = "",
  loading = "lazy",
  fetchPriority,
}) {
  const shouldEagerLoad = loading === "eager" || fetchPriority === "high"
  const rootRef = useRef(null)
  const [isNearViewport, setIsNearViewport] = useState(() => {
    if (typeof window === "undefined") return false
    return shouldEagerLoad || !("IntersectionObserver" in window)
  })
  const [failedSrc, setFailedSrc] = useState(null)
  const [loadedSrc, setLoadedSrc] = useState(null)
  const primarySrc = src || fallbackSrc
  const displaySrc = isNearViewport ? (failedSrc === primarySrc ? fallbackSrc : primarySrc) : null
  const ready = Boolean(
    displaySrc && (loadedImageCache.has(displaySrc) || loadedSrc === displaySrc)
  )

  useEffect(() => {
    if (shouldEagerLoad) return undefined

    const node = rootRef.current
    if (!node) return undefined

    const observer = getSharedObserver()
    if (!observer) return undefined

    observerListeners.set(node, () => setIsNearViewport(true))
    observer.observe(node)

    return () => {
      observerListeners.delete(node)
      observer.unobserve(node)
    }
  }, [shouldEagerLoad])

  function handleLoad() {
    if (!displaySrc) return
    
    if (loadedImageCache.size >= MAX_IMAGE_CACHE_SIZE) {
      // LRU cleanup: Remove the oldest entry to prevent RAM bloat
      const firstKey = loadedImageCache.keys().next().value
      loadedImageCache.delete(firstKey)
    }
    
    loadedImageCache.add(displaySrc)
    setLoadedSrc(displaySrc)
  }

  function handleError() {
    if (displaySrc && displaySrc !== fallbackSrc) {
      setFailedSrc(primarySrc)
      return
    }
    if (displaySrc) {
      setLoadedSrc(displaySrc)
    }
  }

  return (
    <div ref={rootRef} className={`relative overflow-hidden ${containerClassName}`}>
      {!ready ? (
        <div className={`absolute inset-0 z-[1] flex items-center justify-center bg-slate-100 text-[0.75rem] font-extrabold tracking-wide text-slate-500 ${placeholderClassName}`}>
          CTM
        </div>
      ) : null}
      {displaySrc ? (
        <img
          key={displaySrc}
          src={displaySrc}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          onLoad={handleLoad}
          onError={handleError}
          draggable={false}
          className={className}
          style={{ opacity: ready ? 1 : 0 }}
        />
      ) : null}
    </div>
  )
}

export default StableImage
