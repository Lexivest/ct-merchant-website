import { useEffect, useState } from "react"

export const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Crect width='100%25' height='100%25' fill='%23F1F5F9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748B' font-family='Arial' font-size='44'%3EImage%20Unavailable%3C/text%3E%3C/svg%3E"

function StableImage({
  src,
  alt = "",
  fallbackSrc = DEFAULT_FALLBACK_IMAGE,
  containerClassName = "",
  className = "",
  skeletonClassName = "",
  loading = "lazy",
  fetchPriority,
  maxRetries = 2,
  slowLoadMs = 3500,
}) {
  const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc)
  const [loaded, setLoaded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [showSlowHint, setShowSlowHint] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    setCurrentSrc(src || fallbackSrc)
    setLoaded(false)
    setRetryCount(0)
    setShowSlowHint(false)
    setLoadFailed(false)
  }, [src, fallbackSrc])

  useEffect(() => {
    if (loaded || loadFailed) return undefined

    const timer = window.setTimeout(() => {
      setShowSlowHint(true)
    }, slowLoadMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [loaded, loadFailed, slowLoadMs, currentSrc])

  function withRetryStamp(baseUrl, attempt) {
    if (!baseUrl || String(baseUrl).startsWith("data:")) return baseUrl

    try {
      const parsed = new URL(baseUrl, window.location.origin)
      parsed.searchParams.set("_retry", `${attempt}-${Date.now()}`)
      return parsed.toString()
    } catch {
      const separator = String(baseUrl).includes("?") ? "&" : "?"
      return `${baseUrl}${separator}_retry=${attempt}-${Date.now()}`
    }
  }

  function handleLoad() {
    setLoaded(true)
    setLoadFailed(false)
    setShowSlowHint(false)
  }

  function handleError() {
    const source = src || ""
    const canRetrySource =
      Boolean(source) &&
      !String(source).startsWith("data:") &&
      retryCount < maxRetries &&
      currentSrc !== fallbackSrc

    if (canRetrySource) {
      const nextRetry = retryCount + 1
      setRetryCount(nextRetry)
      setCurrentSrc(withRetryStamp(source, nextRetry))
      setLoaded(false)
      setLoadFailed(false)
      return
    }

    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc)
      setLoaded(false)
      setLoadFailed(false)
      return
    }

    setLoaded(true)
    setLoadFailed(true)
  }

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {!loaded ? (
        <div
          aria-hidden="true"
          className={`absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 ${skeletonClassName}`}
        />
      ) : null}
      {!loaded && showSlowHint ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center px-2 text-center">
          <span className="rounded-md border border-slate-200 bg-white/90 px-2.5 py-1 text-[0.65rem] font-bold text-slate-600">
            Loading image...
          </span>
        </div>
      ) : null}
      {loadFailed ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center px-2 text-center">
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.65rem] font-bold text-amber-700">
            Image unavailable
          </span>
        </div>
      ) : null}
      <img
        src={currentSrc}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        draggable={false}
        className={`transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

export default StableImage
