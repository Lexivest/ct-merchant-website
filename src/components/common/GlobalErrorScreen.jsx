import { useNavigate } from "react-router-dom"
import {
  FaArrowLeft,
  FaRotateRight,
  FaShieldHalved,
  FaTriangleExclamation,
  FaWifi,
} from "react-icons/fa6"
import { ErrorCategory, getFriendlyError, isNetworkError } from "../../lib/friendlyErrors"
import { useNetworkStatus } from "../../lib/networkStatus"
import { isChunkLoadFailure } from "../../lib/runtimeRecovery"

function resolveErrorCopy(error, explicitTitle, explicitMessage, isOffline) {
  const network = isOffline || isNetworkError(error)
  const chunk = isChunkLoadFailure(error)
  const friendly = getFriendlyError(error)

  if (explicitTitle || explicitMessage) {
    return {
      network,
      chunk,
      category: friendly.category,
      title: explicitTitle || (network ? "Connection issue" : "Something went wrong"),
      message: explicitMessage || friendly.message,
      action: friendly.action,
    }
  }

  if (network) {
    return {
      network,
      chunk,
      category: ErrorCategory.NETWORK,
      title: "Connection issue",
      message: friendly.message,
      action: friendly.action,
    }
  }

  if (chunk) {
    return {
      network,
      chunk,
      category: ErrorCategory.SERVER,
      title: "Website update in progress",
      message: "A fresh version of CTMerchant is ready. Please retry to load the latest files.",
      action: "Retry to continue with the latest website version.",
    }
  }

  return {
    network,
    chunk,
    category: friendly.category,
    title:
      friendly.category === ErrorCategory.AUTH
        ? "Security notice"
        : "Something went wrong",
    message: friendly.message,
    action: friendly.action,
  }
}

function GlobalErrorScreen({
  error = null,
  title = "",
  message = "",
  fullScreen = true,
  onRetry = null,
  onBack = null,
  retryLabel = "Try again",
  backLabel = "Go back",
  busy = false,
}) {
  const navigate = useNavigate()
  const networkStatus = useNetworkStatus()
  const copy = resolveErrorCopy(error, title, message, networkStatus.isOffline)

  const wrapperClass = fullScreen
    ? "fixed inset-x-0 bottom-4 z-[3000] flex justify-center px-4 pointer-events-none sm:bottom-6"
    : "flex justify-center px-4 py-6"
  const Icon = copy.network
    ? FaWifi
    : copy.category === ErrorCategory.AUTH
      ? FaShieldHalved
      : FaTriangleExclamation

  function handleBack() {
    if (typeof onBack === "function") {
      onBack()
      return
    }

    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate("/", { replace: true })
  }

  return (
    <div className={wrapperClass}>
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-5 text-left shadow-[0_24px_70px_rgba(15,23,42,0.16)] backdrop-blur md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xl text-white shadow-sm">
            <Icon className={busy ? "animate-pulse" : ""} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight text-slate-950">
              {copy.title}
            </h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {busy ? "Preparing a clean recovery..." : copy.message}
            </p>
            {copy.action ? (
              <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                {copy.action}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {typeof onRetry === "function" ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              <FaRotateRight className={busy ? "animate-spin" : ""} />
              <span>{retryLabel}</span>
            </button>
          ) : null}

          {onBack !== false ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={busy}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              <FaArrowLeft className="text-xs" />
              <span>{backLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default GlobalErrorScreen
