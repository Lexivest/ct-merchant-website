import { useEffect, useState } from "react"

function OnlineRouteGuard({
  children,
  title = "Network unavailable",
  message = "Retry to continue.",
}) {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === "undefined") return false
    return !navigator.onLine
  })

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
      window.location.reload()
    }

    function handleOffline() {
      setIsOffline(true)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  if (!isOffline) return children

  return (
    <div className="relative">
      <div className="sticky top-0 z-[999] border-b border-amber-200 bg-amber-50/95 px-4 py-3 text-amber-950 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-amber-100 text-base font-black text-amber-700">
              !
            </div>
            <p className="text-sm font-bold text-amber-950">{title}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (typeof navigator === "undefined") return
              if (navigator.onLine) {
                window.location.reload()
                return
              }
              window.setTimeout(() => {
                if (typeof navigator !== "undefined" && navigator.onLine) {
                  window.location.reload()
                }
              }, 500)
            }}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 sm:self-center"
          >
            Retry
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

export default OnlineRouteGuard
