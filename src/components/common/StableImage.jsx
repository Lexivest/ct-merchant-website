import { useEffect, useState } from "react"

export const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Crect width='100%25' height='100%25' fill='%23F1F5F9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748B' font-family='Arial' font-size='44'%3ECTM%3C/text%3E%3C/svg%3E"

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
  const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc)
  const [loaded, setLoaded] = useState(false)

  const isMobileBrowser =
    typeof navigator !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || "",
    )

  // Mobile browsers are often aggressive/inconsistent with lazy loading in scroll containers.
  // Force eager on mobile for reliability.
  const resolvedLoading =
    loading === "lazy" && isMobileBrowser ? "eager" : loading

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
      setLoaded(true)
      return
    }
    setLoaded(true)
  }

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {!loaded ? (
        <div className={`absolute inset-0 z-[1] flex items-center justify-center bg-slate-100 text-[0.75rem] font-extrabold tracking-wide text-slate-500 ${placeholderClassName}`}>
          CTM
        </div>
      ) : null}
      <img
        src={currentSrc}
        alt={alt}
        loading={resolvedLoading}
        decoding="auto"
        fetchPriority={fetchPriority}
        draggable={false}
        className={className}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

export default StableImage
