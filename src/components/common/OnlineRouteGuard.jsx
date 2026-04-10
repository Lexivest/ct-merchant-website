import { useEffect, useState } from "react"

function OnlineRouteGuard({
  children,
  title = "You're offline",
  message = "You can keep browsing. Actions that need the internet will resume when connection returns.",
}) {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === "undefined") return false
    return !navigator.onLine
  })

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
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

  return (
    <>
      {isOffline ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[1200] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-amber-200 bg-white/95 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.14)] backdrop-blur">
            <div className="text-sm font-black text-slate-900">{title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">{message}</div>
          </div>
        </div>
      ) : null}
      {children}
    </>
  )
}

export default OnlineRouteGuard
