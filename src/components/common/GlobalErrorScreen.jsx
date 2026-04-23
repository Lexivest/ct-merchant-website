import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaArrowLeft,
  FaEnvelope,
  FaRotateRight,
  FaShieldHalved,
  FaTriangleExclamation,
  FaWifi,
} from "react-icons/fa6"
import { ErrorCategory, getFriendlyError, isNetworkError } from "../../lib/friendlyErrors"
import { useNetworkStatus } from "../../lib/networkStatus"
import { isChunkLoadFailure } from "../../lib/runtimeRecovery"

function isDebugEnabled() {
  if (typeof window === "undefined") return false

  try {
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.localStorage?.getItem("ctm_debug_errors") === "1"
    )
  } catch {
    return false
  }
}

function resolveErrorCopy(error, explicitTitle, explicitMessage, isOffline) {
  const network = isOffline || isNetworkError(error)
  const chunk = isChunkLoadFailure(error)
  const friendly = getFriendlyError(error)

  if (explicitTitle || explicitMessage) {
    return {
      network,
      chunk,
      category: friendly.category,
      code: friendly.code,
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
      code: friendly.code,
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
      code: "CTM-APP-UPDATE",
      title: "Website update in progress",
      message: "A fresh version of CTMerchant is ready. Please retry to load the latest files.",
      action: "Retry to continue with the latest website version.",
    }
  }

  return {
    network,
    chunk,
    category: friendly.category,
    code: friendly.code,
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

  const wrapperClass = fullScreen ? "min-h-screen" : "min-h-[400px]"
  const Icon = copy.network
    ? FaWifi
    : copy.category === ErrorCategory.AUTH
      ? FaShieldHalved
      : FaTriangleExclamation

  const diagnosticInfo = useMemo(() => {
    if (!error || !isDebugEnabled()) return null

    try {
      return {
        name: error.name || "Error",
        message: error.message || String(error),
        url: typeof window !== "undefined" ? window.location.href : "unknown",
        storage: (() => {
          try {
            return !!window.localStorage && !!window.sessionStorage
              ? "Available"
              : "Blocked"
          } catch {
            return "Blocked/SecurityError"
          }
        })(),
        online: networkStatus.isOnline,
        agent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      }
    } catch {
      return null
    }
  }, [error, networkStatus.isOnline])

  const supportHref = useMemo(() => {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "unknown"
    const subject = `CTMerchant support request [${copy.code || "CTM-500"}]`
    const body = [
      "Hello CTMerchant Support,",
      "",
      `Reference code: ${copy.code || "CTM-500"}`,
      `Page: ${currentUrl}`,
      `Online: ${networkStatus.isOnline ? "Yes" : "No"}`,
      "",
      "Please help me resolve this issue.",
    ].join("\n")

    return `mailto:support@ctmerchant.com.ng?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }, [copy.code, networkStatus.isOnline])

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
    <div className={`${wrapperClass} flex items-center justify-center bg-[#f8fafc] px-5 py-12`}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-[40px] border border-slate-200/60 bg-white p-8 text-center shadow-[0_20px_70px_rgba(15,23,42,0.08)] md:p-10">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl text-3xl shadow-lg bg-slate-900 text-white shadow-slate-200">
          <Icon className={busy ? "animate-pulse" : ""} />
        </div>

        <div className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] bg-slate-100 text-slate-600">
          {networkStatus.isOffline ? "Offline" : "Online"}
        </div>

        <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
          {copy.title}
        </h1>

        <div className="mt-6 space-y-4">
          <p className="text-[1rem] font-semibold leading-relaxed text-slate-700">
            {busy ? "Preparing a clean recovery..." : copy.message}
          </p>
          <p className="text-[0.9rem] font-medium leading-relaxed text-slate-500">
            {copy.action}
          </p>
        </div>

        {copy.code ? (
          <div className="mt-8 inline-flex items-center rounded-full border border-slate-100 bg-slate-50 px-4 py-1.5">
            <span className="mr-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
              Reference Code:
            </span>
            <span className="text-[12px] font-mono font-bold text-slate-600">{copy.code}</span>
          </div>
        ) : null}

        <div className="mt-10 flex flex-col gap-3">
          {typeof onRetry === "function" ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
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
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              <FaArrowLeft className="text-xs" />
              <span>{backLabel}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = supportHref
              }
            }}
            className="mt-2 flex items-center justify-center gap-2 text-[12px] font-bold text-slate-400 transition hover:text-pink-600"
          >
            <FaEnvelope className="text-xs" />
            <span>Contact Support</span>
          </button>
        </div>

        {diagnosticInfo ? (
          <div className="mt-10 border-t border-slate-100 pt-8 text-left">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-[10px] font-mono text-slate-500">
              <div className="mb-2 font-black uppercase tracking-tighter text-slate-400">
                Diagnostic Snapshot
              </div>
              <div className="space-y-1">
                <p><strong>URL:</strong> {diagnosticInfo.url}</p>
                <p><strong>Storage:</strong> {diagnosticInfo.storage}</p>
                <p><strong>Online:</strong> {String(diagnosticInfo.online)}</p>
                <p><strong>Browser:</strong> {diagnosticInfo.agent?.substring(0, 80)}...</p>
                <p><strong>Error:</strong> {diagnosticInfo.name}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default GlobalErrorScreen
