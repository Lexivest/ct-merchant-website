/* eslint-disable react-refresh/only-export-components */
import { isNetworkError } from "../../lib/friendlyErrors"
import { FaRotateRight } from "react-icons/fa6"

export function getRetryingMessage(error) {
  if ((typeof navigator !== "undefined" && !navigator.onLine) || isNetworkError(error)) {
    return "Network unavailable, retrying..."
  }

  return "Something happened, retrying..."
}

function RetryingNotice({
  message = "Network unavailable, retrying...",
  fullScreen = true,
  className = "",
  onRetry = null,
}) {
  const wrapperClass = fullScreen
    ? "flex min-h-screen items-center justify-center bg-[#E3E6E6] px-5 py-10"
    : "flex min-h-[240px] items-center justify-center px-5 py-10"

  return (
    <div className={`${wrapperClass} ${className}`.trim()}>
      <div className="flex w-full max-w-sm flex-col items-center justify-center text-center">
        <div className="mx-auto h-2 w-24 animate-pulse rounded-full bg-pink-100" />
        <p className="mt-4 text-sm font-semibold text-slate-500">{message}</p>
        
        {typeof onRetry === "function" ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-pink-600 active:scale-95"
          >
            <FaRotateRight className="text-[0.8rem]" />
            Try Again
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default RetryingNotice
