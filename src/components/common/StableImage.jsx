import { useEffect, useRef, useState, useMemo } from "react"
import { getOptimizedImageUrl } from "../../lib/imageOptimization"

export const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23db2777'/%3E%3Cstop offset='100%25' stop-color='%237c3aed'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='900' font-size='60' opacity='0.7'%3ECTM%3C/text%3E%3C/svg%3E"

// Amazon-style Global Image Registry
// This persists for the entire session to ensure that once an image is loaded,
// it stays "ready" even if the component unmounts and remounts.
const GLOBAL_IMAGE_REGISTRY = new Set()

// Track original src URLs whose Supabase transform endpoint returned a corrupt
// response (HTTP 200 with empty/undecodable body). Persists across page refreshes
// within the same browser session so we skip the slow transform-then-retry cycle
// on subsequent loads and go straight to the original URL.
const FAILED_TRANSFORM_SRCS = (() => {
  try {
    const stored = sessionStorage.getItem("ctm_failed_img_transforms")
    return new Set(stored ? JSON.parse(stored) : [])
  } catch {
    return new Set()
  }
})()

function markTransformFailed(originalSrc) {
  if (!originalSrc) return
  FAILED_TRANSFORM_SRCS.add(originalSrc)
  try {
    // Keep only the last 100 entries to avoid quota issues
    const entries = [...FAILED_TRANSFORM_SRCS].slice(-100)
    sessionStorage.setItem("ctm_failed_img_transforms", JSON.stringify(entries))
  } catch { /* storage quota exceeded — ignore */ }
}

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
    // If this src's transform is known to be broken, skip to original immediately
    if (FAILED_TRANSFORM_SRCS.has(src)) return src
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
  const [usedOriginalFallback, setUsedOriginalFallback] = useState(false)

  // Ref to read current load state inside the stall-detection timeout without
  // stale closure values (the timeout only re-creates when isNearViewport changes).
  const stateRef = useRef(null)
  stateRef.current = { loaded, failed, usedOriginalFallback }

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

  // Stall detector: if the image (or its transform URL) has not responded
  // within 8 seconds of entering the viewport, force a graceful fallback.
  // This handles Supabase Image Transform cold-start hangs on large images
  // where neither onLoad nor onError fires, leaving the shimmer permanent.
  useEffect(() => {
    if (!isNearViewport) return undefined

    const timer = window.setTimeout(() => {
      const s = stateRef.current
      if (s.loaded || s.failed) return

      if (!s.usedOriginalFallback && src && finalSrc !== src) {
        // Transform URL stalled — skip to original URL
        markTransformFailed(src)
        setUsedOriginalFallback(true)
      } else {
        // Original URL (or no transform fallback) also stalled — fail gracefully
        setFailed(true)
        onError?.()
      }
    }, 8000)

    return () => window.clearTimeout(timer)
    // deps intentionally only [isNearViewport]: the timer fires once per
    // viewport-entry. stateRef provides current state at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNearViewport])

  function handleLoad(event) {
    // naturalWidth === 0 means the browser got a 200 response but couldn't decode the image
    // (Supabase render endpoint can return an empty/corrupt body on transform failure)
    if (event.target.naturalWidth === 0) {
      handleError(event)
      return
    }
    setLoaded(true)
    GLOBAL_IMAGE_REGISTRY.add(usedOriginalFallback ? src : finalSrc)
    onLoad?.(event)
  }

  function handleError(event) {
    // If the transformed URL failed and we haven't tried the original yet, retry with original
    if (!usedOriginalFallback && src && finalSrc !== src) {
      // Remember this src so future renders skip the transform entirely
      markTransformFailed(src)
      setUsedOriginalFallback(true)
      return
    }
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
      {/* When the caller passes placeholderClassName="bg-transparent" it means
          it is rendering its own branded placeholder behind StableImage and
          doesn't want the default slate-200 shimmer background fighting it. */}
      <div className={`relative h-full w-full overflow-hidden ${!loaded && placeholderClassName !== 'bg-transparent' ? 'bg-slate-200' : ''}`}>
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
        {!loaded && !lowResSrc && placeholderClassName !== 'bg-transparent' && (
          <div className={`absolute inset-0 z-[1] bg-slate-200 ${placeholderClassName}`}>
            <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.5)_50%,transparent_80%)]" />
          </div>
        )}

        {/* 3. Main image — renders once in-viewport, fades in on load */}
        {isNearViewport && (
          <img
            src={failed ? fallbackSrc : usedOriginalFallback ? src : finalSrc}
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
