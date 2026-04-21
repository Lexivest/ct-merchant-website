import { useEffect, useRef, useState, useMemo } from "react"
import { getOptimizedImageUrl } from "../../lib/imageOptimization"

export const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23db2777'/%3E%3Cstop offset='100%25' stop-color='%237c3aed'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='900' font-size='60' opacity='0.7'%3ECTM%3C/text%3E%3C/svg%3E"

// Amazon-style Global Image Registry
// This persists for the entire session to ensure that once an image is loaded, 
// it stays "ready" even if the component unmounts and remounts.
const GLOBAL_IMAGE_REGISTRY = new Set()

// singleton Intersection Observer
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
      { rootMargin: "450px 0px" } // Aggressive margin to start loading before the user arrives
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
  onError,
  onLoad,
  width,
  height,
  quality,
  format = 'origin',
  resize = 'cover',
  aspectRatio
}) {
  const shouldEagerLoad = loading === "eager" || fetchPriority === "high"
  const rootRef = useRef(null)

  // 1. Determine the final URL immediately
  const finalSrc = useMemo(() => {
    if (!src) return fallbackSrc
    // Ensure we don't have double slashes or trailing questions which break cache keys
    return getOptimizedImageUrl(src, { width, height, quality, format, resize })
  }, [src, width, height, quality, format, resize, fallbackSrc])

  // 2. Check if this specific URL has been successfully loaded in this session
  const isPreviouslyLoaded = GLOBAL_IMAGE_REGISTRY.has(finalSrc)

  const [isNearViewport, setIsNearViewport] = useState(() => {
    if (typeof window === "undefined") return false
    // If it's already in the registry, we don't need to wait for the observer
    return shouldEagerLoad || isPreviouslyLoaded || !("IntersectionObserver" in window)
  })

  // If it's in the registry, we treat it as loaded immediately to avoid state-flicker
  const [loaded, setLoaded] = useState(isPreviouslyLoaded)
  const [failed, setFailed] = useState(false)

  const lowResSrc = useMemo(() => {
    if (!src || shouldEagerLoad || isPreviouslyLoaded) return null
    return getOptimizedImageUrl(src, { width: 30, height: 30, quality: 20 })
  }, [src, shouldEagerLoad, isPreviouslyLoaded])

  useEffect(() => {
    if (isPreviouslyLoaded) return undefined
    if (shouldEagerLoad) {
      setIsNearViewport(true)
      return undefined
    }

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
  }, [shouldEagerLoad, isPreviouslyLoaded, finalSrc])

  useEffect(() => {
    setFailed(false)
    setLoaded(isPreviouslyLoaded)

    if (shouldEagerLoad || isPreviouslyLoaded) {
      setIsNearViewport(true)
    }
  }, [finalSrc, isPreviouslyLoaded, shouldEagerLoad])

  function handleLoad(event) {
    setLoaded(true)
    GLOBAL_IMAGE_REGISTRY.add(finalSrc)
    onLoad?.(event)
  }

  function handleError(event) {
    setFailed(true)
    setLoaded(false)
    onError?.(event)
  }

  const containerStyle = aspectRatio ? { aspectRatio: String(aspectRatio) } : {}

  return (
    <div 
      ref={rootRef} 
      style={containerStyle}
      className={`relative overflow-hidden ${containerClassName} ${!loaded ? 'bg-slate-100' : ''}`}
    >
      {/* 1. Blurred placeholder - only if NOT previously loaded */}
      {lowResSrc && !loaded && isNearViewport && (
        <img
          src={lowResSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover blur-md scale-105 transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* 2. Shimmer overlay - only if NO cache and NO lowres */}
      {!loaded && !lowResSrc && (
        <div className={`absolute inset-0 z-[1] bg-slate-100 ${placeholderClassName}`}>
          <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.2),transparent)] animate-shimmer" />
        </div>
      )}

      {/* 3. The main image - use opacity:0 to 1 for smoothness */}
      {isNearViewport && (
        <img
          src={failed ? fallbackSrc : finalSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          onLoad={handleLoad}
          onError={handleError}
          width={width}
          height={height}
          draggable={false}
          className={`${className} transition-opacity duration-300 ease-out ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}

export default StableImage
