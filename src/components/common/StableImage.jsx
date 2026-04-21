import { useEffect, useRef, useState, useMemo } from "react"
import { getOptimizedImageUrl } from "../../lib/imageOptimization"

export const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23db2777'/%3E%3Cstop offset='100%25' stop-color='%237c3aed'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='900' font-size='60' opacity='0.7'%3ECTM%3C/text%3E%3C/svg%3E"

const loadedImageCache = new Set()
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
      { rootMargin: "350px 0px" } // Slightly larger margin for smoother scrolling
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
  width,
  height,
  quality,
  format = 'origin',
  resize = 'cover',
  aspectRatio
}) {
  const shouldEagerLoad = loading === "eager" || fetchPriority === "high"
  const rootRef = useRef(null)
  const [isNearViewport, setIsNearViewport] = useState(() => {
    if (typeof window === "undefined") return false
    return shouldEagerLoad || !("IntersectionObserver" in window)
  })
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  // Amazon Strategy: Generate optimized URLs for both the final image and a tiny blurred placeholder
  const finalSrc = useMemo(() => {
    if (!src) return fallbackSrc
    return getOptimizedImageUrl(src, { width, height, quality, format, resize })
  }, [src, width, height, quality, format, resize, fallbackSrc])

  const lowResSrc = useMemo(() => {
    if (!src || shouldEagerLoad) return null
    // Request a tiny 20px version for the "blurry" effect
    return getOptimizedImageUrl(src, { width: 20, height: 20, quality: 30 })
  }, [src, shouldEagerLoad])

  const isCached = loadedImageCache.has(finalSrc)

  useEffect(() => {
    if (shouldEagerLoad || isCached) {
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
  }, [shouldEagerLoad, isCached, finalSrc])

  function handleLoad() {
    setLoaded(true)
    loadedImageCache.add(finalSrc)
  }

  function handleError() {
    setFailed(true)
  }

  const containerStyle = aspectRatio ? { aspectRatio: String(aspectRatio) } : {}

  return (
    <div 
      ref={rootRef} 
      style={containerStyle}
      className={`relative overflow-hidden transition-colors duration-500 ${containerClassName} ${!loaded && !isCached ? 'bg-slate-100' : ''}`}
    >
      {/* 1. Low-res blurred placeholder (Amazon Standard) */}
      {lowResSrc && !loaded && !isCached && isNearViewport && (
        <img
          src={lowResSrc}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover blur-lg scale-110 transition-opacity duration-700 ${loaded ? 'opacity-0' : 'opacity-100'}`}
          aria-hidden="true"
        />
      )}

      {/* 2. Shimmer overlay if no data is being displayed yet */}
      {!loaded && !isCached && !lowResSrc && (
        <div className={`absolute inset-0 z-[1] flex items-center justify-center bg-slate-100 ${placeholderClassName}`}>
          <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.2),transparent)] animate-shimmer" />
        </div>
      )}

      {/* 3. The main image */}
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
          className={`${className} transition-opacity duration-500 ease-in-out ${loaded || isCached ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}

export default StableImage
