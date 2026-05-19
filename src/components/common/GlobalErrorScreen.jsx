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
import { renderBrandedText } from "./BrandText"

function resolveErrorCopy(error, explicitTitle, isOffline) {
  const network = isOffline || isNetworkError(error)
  const chunk = isChunkLoadFailure(error)
  const friendly = getFriendlyError(error)

  if (explicitTitle) {
    return {
      network,
      chunk,
      category: friendly.category,
      title: explicitTitle,
    }
  }

  if (network) {
    return {
      network,
      chunk,
      category: ErrorCategory.NETWORK,
      title: "Connection issue",
    }
  }

  if (chunk) {
    return {
      network,
      chunk,
      category: ErrorCategory.SERVER,
      title: "Connection issue",
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
  }
}

function GlobalErrorScreen({
  error = null,
  title = "",
  // message prop accepted for backward-compat but no longer rendered —
  // raw technical messages must never be shown to users in production.
  // eslint-disable-next-line no-unused-vars
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
  const copy = resolveErrorCopy(error, title, networkStatus.isOffline)

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

  const card = (
    <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-slate-200/80 bg-white px-7 py-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
      {/* Icon */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-slate-950 text-2xl text-white shadow-sm">
        <Icon className={busy ? "animate-pulse" : ""} />
      </div>

      {/* Title only — no body message, no raw error details */}
      <h1 className="mt-5 text-[1.25rem] font-black tracking-tight text-slate-950">
        {renderBrandedText(copy.title)}
      </h1>

      {/* Actions */}
      <div className="mt-7 flex flex-col gap-3">
        {typeof onRetry === "function" ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
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
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
          >
            <FaArrowLeft className="text-xs" />
            <span>{backLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  )

  if (!fullScreen) {
    return (
      <div className="flex justify-center px-4 py-10">
        {card}
      </div>
    )
  }

  // Full-screen: centered over a dim backdrop — never bottom-anchored
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-[rgba(15,23,42,0.60)] px-5 backdrop-blur-[2px]">
      {card}
    </div>
  )
}

export default GlobalErrorScreen
