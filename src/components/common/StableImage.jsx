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

  const finalSrc = useMemo(() => {
    if (!src) return fallbackSrc
    // Ensure we don't have double slashes or trailing questions which break cache keys
    return getOptimizedImageUrl(src, { width, height, quality, format, resize })
  }, [src, width, height, quality, format, resize, fallbackSrc])

  return (
    <StableImageFrame
      key={finalSrc}
      src={src}
      alt={alt}
      fallbackSrc={fallbackSrc}
      containerClassName={containerClassName}
      className={className}
      placeholderClassName={placeholderClassName}
      loading={loading}
      fetchPriority={fetchPriority}
      onError={onError}
      onLoad={onLoad}
      width={width}
      height={height}
      aspectRatio={aspectRatio}
      shouldEagerLoad={shouldEagerLoad}
      finalSrc={finalSrc}
    />
  )
}

function StableImageFrame({
  src,
  alt,
  fallbackSrc,
  containerClassName,
  className,
  placeholderClassName,
  loading,
  fetchPriority,
  onError,
  onLoad,
  width,
  height,
  aspectRatio,
  shouldEagerLoad,
  finalSrc,
}) {
  // Outer ref lives on the positioning shell (the element the observer watches).
  const rootRef = useRef(null)
  const isPreviouslyLoaded = GLOBAL_IMAGE_REGISTRY.has(finalSrc)

  const [isNearViewport, setIsNearViewport] = useState(() => {
    if (typeof window === "undefined") return false
    return shouldEagerLoad || isPreviouslyLoaded || !("IntersectionObserver" in window)
  })

  const [loaded, setLoaded] = useState(() => isPreviouslyLoaded)
  const [failed, setFailed] = useState(false)

  // Only generate a low-res blur URL for Supabase-hosted images on lazy load.
  // Local/CDN assets that getOptimizedImageUrl can't downsize would just return
  // the same URL — a double request for the same full-size file — so skip them.
  const lowResSrc = useMemo(() => {
    if (!src || shouldEagerLoad || isPreviouslyLoaded) return null
    const candidate = getOptimizedImageUrl(src, { width: 30, height: 30, quality: 20 })
    // If the URL didn't change (non-Supabase asset), skip the blur placeholder.
    return candidate !== src ? candidate : null
  }, [src, shouldEagerLoad, isPreviouslyLoaded])

  useEffect(() => {
    if (isPreviouslyLoaded) return undefined
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
  }, [shouldEagerLoad, isPreviouslyLoaded])

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

  // Two-div structure: outer shell owns `containerClassName` (the positioning /
  // sizing contract the caller specifies), inner shell owns `relative
  // overflow-hidden` so absolute children (shimmer, blur, image) are always
  // clipped and positioned against a real containing block — no class-specificity
  // race between `relative` and any `absolute` coming from containerClassName.
  return (
    <div
      ref={rootRef}
      style={containerStyle}
      className={containerClassName}
    >
      <div className={`relative h-full w-full overflow-hidden ${!loaded ? 'bg-slate-200' : ''}`}>
        {/* 1. Blurred thumbnail — lazy-loaded Supabase images only */}
        {lowResSrc && !loaded && isNearViewport && (
          <img
            src={lowResSrc}
            alt=""
            className="absolute inset-0 h-full w-full scale-105 object-cover blur-md"
            aria-hidden="true"
          />
        )}

        {/* 2. Shimmer skeleton — shown when there is no blur placeholder.
            Uses a mid-gray base + a clearly visible sweep so it never looks
            like an empty white box on slow connections. */}
        {!loaded && !lowResSrc && (
          <div className={`absolute inset-0 z-[1] bg-slate-200 ${placeholderClassName}`}>
            <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.5)_50%,transparent_80%)]" />
          </div>
        )}

        {/* 3. Main image — renders once in-viewport, fades in on load */}
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
    </div>
  )
}

export default StableImage
