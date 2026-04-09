import { useEffect, useState } from "react"
import RetryingNotice from "./RetryingNotice"

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

  const retryMessage = message || `${title}, retrying...`

  return <RetryingNotice message={retryMessage.replace("..", ".")} />
}

export default OnlineRouteGuard
