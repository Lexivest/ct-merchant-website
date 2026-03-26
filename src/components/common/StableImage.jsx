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
}) {
  const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setCurrentSrc(src || fallbackSrc)
    setLoaded(false)
  }, [src, fallbackSrc])

  function handleLoad() {
    setLoaded(true)
  }

  function handleError() {
    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc)
      return
    }
    setLoaded(true)
  }

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {!loaded ? (
        <div
          aria-hidden="true"
          className={`absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 ${skeletonClassName}`}
        />
      ) : null}
      <img
        src={currentSrc}
        alt={alt}
        loading={loading}
        decoding="async"
        className={`transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

export default StableImage
