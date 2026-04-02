function isNetworkLikeError(error) {
  const message = String(error?.message || error || "").toLowerCase()
  return (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("chunk") ||
    message.includes("load module") ||
    message.includes("offline")
  )
}

export function getRetryingMessage(error) {
  if ((typeof navigator !== "undefined" && !navigator.onLine) || isNetworkLikeError(error)) {
    return "Network unavailable, retrying..."
  }

  return "Something happened, retrying..."
}

function RetryingNotice({
  message = "Network unavailable, retrying...",
  fullScreen = true,
  className = "",
}) {
  const wrapperClass = fullScreen
    ? "flex min-h-screen items-center justify-center bg-[#E3E6E6] px-5 py-10"
    : "flex min-h-[240px] items-center justify-center px-5 py-10"

  return (
    <div className={`${wrapperClass} ${className}`.trim()}>
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto h-2 w-24 animate-pulse rounded-full bg-pink-100" />
        <p className="mt-4 text-sm font-semibold text-slate-500">{message}</p>
      </div>
    </div>
  )
}

export default RetryingNotice
