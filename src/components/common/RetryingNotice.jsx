/* eslint-disable react-refresh/only-export-components */
import { isNetworkError } from "../../lib/friendlyErrors"
import { isNetworkOffline } from "../../lib/networkStatus"
import GlobalErrorScreen from "./GlobalErrorScreen"

export function getRetryingMessage(error) {
  if (isNetworkOffline() || isNetworkError(error)) {
    return "Please check your connection, then retry or go back."
  }

  return "Something went wrong. Please retry or go back."
}

function RetryingNotice({
  title = "",
  message = "Please check your connection, then retry or go back.",
  fullScreen = true,
  className = "",
  onRetry = null,
  onBack = null,
}) {
  const handleBack =
    onBack ||
    (() => {
      if (typeof window !== "undefined") window.history.back()
    })

  return (
    <div className={className}>
      <GlobalErrorScreen
        title={title}
        error={message}
        message={message}
        fullScreen={fullScreen}
        onRetry={onRetry}
        onBack={handleBack}
      />
    </div>
  )
}

export default RetryingNotice
