import { useEffect, useRef } from "react"

import { useNetworkStatus } from "../../lib/networkStatus"
import GlobalErrorScreen from "./GlobalErrorScreen"

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
  const { isOffline } = useNetworkStatus()
  const lastRetryRef = useRef(0)
  const isRecovering =
    !isOffline && autoRetryOnReconnect && typeof onRetry === "function"

  useEffect(() => {
    if (isOffline || !autoRetryOnReconnect || typeof onRetry !== "function") {
      return undefined
    }

    const now = Date.now()
    if (now - lastRetryRef.current < 1200) {
      return undefined
    }

    lastRetryRef.current = now

    const timerId = window.setTimeout(() => {
      onRetry()
    }, 180)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [autoRetryOnReconnect, isOffline, onRetry])

  return (
    <GlobalErrorScreen
      error={isOffline ? new Error("Network offline") : null}
      title={isOffline ? title : "Connection restored"}
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
