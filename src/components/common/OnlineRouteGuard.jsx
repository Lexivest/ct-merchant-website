import { useEffect, useState } from "react"

function OnlineRouteGuard({
  children,
  title = "Internet connection required",
  message = "You are offline. Cached content remains available while we wait for your connection to return.",
}) {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === "undefined") return false
    return !navigator.onLine
  })
  const [retryArmed, setRetryArmed] = useState(false)

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
      if (retryArmed) {
        window.location.reload()
      }
      setRetryArmed(false)
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
  }, [retryArmed])

  if (!isOffline) return children

  return (
    <div className="relative">
      <div className="sticky top-0 z-[999] border-b border-amber-200 bg-amber-50/95 px-4 py-3 text-amber-950 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-amber-100 text-base font-black text-amber-700">
              !
            </div>
            <div>
              <p className="text-sm font-bold">{title}</p>
              <p className="text-xs leading-5 text-amber-900/80">{message}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (typeof navigator === "undefined") return
              if (navigator.onLine) {
                window.location.reload()
                return
              }
              setRetryArmed(true)
            }}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 sm:self-center"
          >
            Retry
          </button>
        </div>
        {retryArmed ? (
          <div className="mx-auto mt-3 max-w-[1600px] rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
            Waiting for internet connection. We will refresh automatically once you are back online.
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export default OnlineRouteGuard
