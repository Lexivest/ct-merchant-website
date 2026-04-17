import { useState, useMemo, useEffect } from "react"
import { FaArrowLeft, FaRotateRight, FaTriangleExclamation, FaWifi, FaBug } from "react-icons/fa6"
import { isNetworkError } from "../../lib/friendlyErrors"
import { isChunkLoadFailure } from "../../lib/runtimeRecovery"

function resolveErrorCopy(error, explicitTitle, explicitMessage) {
  const offline = typeof navigator !== "undefined" ? !navigator.onLine : false
  const network = offline || isNetworkError(error)
  const chunk = isChunkLoadFailure(error)

  if (explicitTitle || explicitMessage) {
    return {
      network,
      chunk,
      title: explicitTitle || (network ? "Connection Issue" : "An error occurred"),
      message:
        explicitMessage ||
        (network
          ? "We're having trouble reaching our servers. Please check your connection."
          : "We encountered an unexpected issue while processing your request."),
    }
  }

  if (network) {
    return {
      network,
      chunk,
      title: "Connection Issue",
      message: "We're having trouble reaching our servers. Please check your connection and try again.",
    }
  }

  if (chunk) {
    return {
      network,
      chunk,
      title: "App Update Required",
      message: "A new version of CTMerchant is available. We need to reload to apply the latest improvements.",
    }
  }

  return {
    network,
    chunk,
    title: "An error occurred",
    message: "We encountered an unexpected issue. Please try again or go back to the previous page.",
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
  const [showDetails, setShowDetails] = useState(false)
  const [cloudStatus, setCloudStatus] = useState("Checking...")
  const copy = resolveErrorCopy(error, title, message)

  const wrapperClass = fullScreen ? "min-h-screen" : "min-h-[320px]"
  const Icon = copy.network ? FaWifi : FaTriangleExclamation

  useEffect(() => {
    if (!showDetails) return

    async function checkConnectivity() {
      try {
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), 4000)
        await fetch("https://www.cloudflare.com/cdn-cgi/trace", { 
          signal: controller.signal,
          mode: 'no-cors' 
        })
        clearTimeout(id)
        setCloudStatus("Cloudflare Reachable")
      } catch {
        setCloudStatus("Connection Blocked (Cloudflare/ETP)")
      }
    }
    void checkConnectivity()
  }, [showDetails])

  const diagnosticInfo = useMemo(() => {
    if (!error) return null
    try {
      return {
        name: error.name || "Error",
        message: error.message || String(error),
        url: typeof window !== "undefined" ? window.location.href : "unknown",
        storage: (() => {
          try {
            return !!window.localStorage && !!window.sessionStorage ? "Available" : "Blocked"
          } catch {
            return "Blocked/SecurityError"
          }
        })(),
        online: typeof navigator !== "undefined" ? navigator.onLine : "unknown",
        agent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown"
      }
    } catch {
      return null
    }
  }, [error])
  
  const showDebugTools = Boolean(import.meta.env?.DEV && diagnosticInfo)

  return (
    <div className={`${wrapperClass} flex items-center justify-center bg-slate-50 px-5 py-12`}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-[40px] bg-white p-8 text-center shadow-[0_30px_80px_rgba(15,23,42,0.12)] border border-slate-100">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-slate-50/50" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-slate-50/50" />

        <div className="relative">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-[28px] bg-slate-900 text-3xl text-white shadow-[0_16px_35px_rgba(15,23,42,0.25)]">
            <Icon />
          </div>

          <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
            {copy.title}
          </h1>
          <p className="mt-4 text-[0.95rem] font-medium leading-relaxed text-slate-500">
            {busy ? "Preparing a clean reload..." : copy.message}
          </p>

          {showDebugTools && (
            <div className="mt-10 flex flex-col gap-2 text-left">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-600"
              >
                <FaBug className="text-xs" />
                {showDetails ? "Hide Diagnostic Report" : "Show Diagnostic Report"}
              </button>

              {showDetails && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/80 p-5 text-[10px] shadow-inner">
                  <div className="mb-2 font-black uppercase tracking-tighter text-slate-700">Deep Trace Analysis</div>
                  <div className="space-y-1 font-mono text-slate-600">
                    <p><strong>Error Type:</strong> {diagnosticInfo?.name || "Unknown"}</p>
                    <p><strong>Message:</strong> {diagnosticInfo?.message || "No message"}</p>
                    <p><strong>Cloudflare Status:</strong> {cloudStatus}</p>
                    <p><strong>Browser Storage:</strong> {diagnosticInfo?.storage || "Unknown"}</p>
                    <p><strong>Agent:</strong> {diagnosticInfo?.agent || "Unknown"}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-10 flex flex-col gap-3">
            {typeof onRetry === "function" && (
              <button
                type="button"
                onClick={onRetry}
                disabled={busy}
                className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
              >
                <FaRotateRight className={busy ? "animate-spin" : ""} />
                <span>{retryLabel}</span>
              </button>
            )}

            {typeof onBack === "function" && (
              <button
                type="button"
                onClick={onBack}
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
              >
                <FaArrowLeft className="text-xs" />
                <span>{backLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default GlobalErrorScreen
