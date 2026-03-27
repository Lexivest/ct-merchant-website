import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

function OnlineRouteGuard({
  children,
  backTo = "/",
  title = "Internet connection required",
  message = "This page needs an active internet connection to load correctly.",
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-amber-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl text-amber-700">
          !
        </div>

        <h1 className="mt-5 text-3xl font-black text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
            className="flex-1 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
          >
            Retry
          </button>
          <Link
            to={backTo}
            className="flex-1 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 font-bold text-amber-800 transition hover:bg-amber-100"
          >
            Go back
          </Link>
        </div>
        {retryArmed ? (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Waiting for internet connection. This page will retry automatically once you are online.
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default OnlineRouteGuard
