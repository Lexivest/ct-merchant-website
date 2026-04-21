import { useEffect, useState } from "react"

import GlobalErrorScreen from "./GlobalErrorScreen"

function getOfflineState() {
  if (typeof navigator === "undefined") return false
  return !navigator.onLine
}

function NetworkStatusScreen({
  title = "No internet connection",
  message = "CTMerchant needs a stable connection to finish opening this screen.",
  reconnectMessage = "Connection restored. Reopening CTMerchant now.",
  retryLabel = "Retry now",
  backLabel = "Go back",
  onRetry = null,
  onBack = null,
  autoRetryOnReconnect = true,
  fullScreen = true,
}) {
  const [isOffline, setIsOffline] = useState(getOfflineState)
  const [isRecovering, setIsRecovering] = useState(false)

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)

      if (autoRetryOnReconnect && typeof onRetry === "function") {
        setIsRecovering(true)
        window.setTimeout(() => {
          onRetry()
        }, 180)
      }
    }

    function handleOffline() {
      setIsOffline(true)
      setIsRecovering(false)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [autoRetryOnReconnect, onRetry])

  return (
    <GlobalErrorScreen
      error={isOffline ? new Error("Network offline") : null}
      title={isOffline ? title : "Back online"}
      message={isRecovering ? reconnectMessage : message}
      fullScreen={fullScreen}
      onRetry={onRetry}
      onBack={onBack}
      retryLabel={retryLabel}
      backLabel={backLabel}
      busy={isRecovering}
    />
  )
}

export default NetworkStatusScreen
