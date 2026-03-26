import { useEffect, useRef, useState } from "react"

export const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Crect width='100%25' height='100%25' fill='%23F1F5F9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748B' font-family='Arial' font-size='44'%3ECTM%3C/text%3E%3C/svg%3E"

const loadedImageCache = new Set()

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
  const rootRef = useRef(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [displaySrc, setDisplaySrc] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const node = rootRef.current
    if (!node) return undefined

    if (!("IntersectionObserver" in window)) {
      setIsNearViewport(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        setIsNearViewport(true)
        observer.disconnect()
      },
      { rootMargin: "220px 0px" }
    )

    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!isNearViewport) return

    const nextSrc = src || fallbackSrc
    setDisplaySrc(nextSrc)
    setReady(loadedImageCache.has(nextSrc))
  }, [isNearViewport, src, fallbackSrc])

  function handleLoad() {
    if (!displaySrc) return
    loadedImageCache.add(displaySrc)
    setReady(true)
  }

  function handleError() {
    if (displaySrc && displaySrc !== fallbackSrc) {
      setReady(false)
      setDisplaySrc(fallbackSrc)
      return
    }
    setReady(true)
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
