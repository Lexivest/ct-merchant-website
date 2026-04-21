import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FaArrowLeft, FaRotateRight, FaTriangleExclamation, FaWifi, FaBug, FaEnvelope } from "react-icons/fa6"
import { isNetworkError, getFriendlyError, ErrorCategory } from "../../lib/friendlyErrors"
import { isChunkLoadFailure } from "../../lib/runtimeRecovery"

function resolveErrorCopy(error, explicitTitle, explicitMessage) {
  const offline = typeof navigator !== "undefined" ? !navigator.onLine : false
  const network = offline || isNetworkError(error)
  const chunk = isChunkLoadFailure(error)
  const friendly = getFriendlyError(error)

  if (explicitTitle || explicitMessage) {
    return {
      network,
      chunk,
      category: friendly.category,
      code: friendly.code,
      title: explicitTitle || (network ? "Connection Issue" : "An error occurred"),
      message: explicitMessage || friendly.message,
      action: friendly.action
    }
  }

  if (network) {
    return {
      network,
      chunk,
      category: ErrorCategory.NETWORK,
      code: friendly.code,
      title: "Connection Issue",
      message: friendly.message,
      action: friendly.action
    }
  }

  if (chunk) {
    return {
      network,
      chunk,
      category: ErrorCategory.SERVER,
      code: "CTM-APP-UPDATE",
      title: "App Update Required",
      message: "A new version of CTMerchant is available. We need to reload to apply the latest improvements.",
      action: "Click the button below to update your application."
    }
  }

  return {
    network,
    chunk,
    category: friendly.category,
    code: friendly.code,
    title: friendly.category === ErrorCategory.AUTH ? "Security Notice" : "Something went wrong",
    message: friendly.message,
    action: friendly.action
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
  const [showDetails, setShowDetails] = useState(false)
  const [cloudStatus, setCloudStatus] = useState("Checking...")
  const copy = resolveErrorCopy(error, title, message)

  const wrapperClass = fullScreen ? "min-h-screen" : "min-h-[400px]"
  const Icon = copy.network ? FaWifi : FaTriangleExclamation

  const handleBack = () => {
    if (typeof onBack === "function") {
      onBack()
      return
    }

    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        navigate(-1)
      } else {
        navigate("/", { replace: true })
      }
    }
  }

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
        agent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        code: copy.code
      }
    } catch {
      return null
    }
  }, [error, copy.code])
  
  const showDebugTools = Boolean(diagnosticInfo)

  return (
    <div className={`${wrapperClass} flex items-center justify-center bg-[#f8fafc] px-5 py-12`}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-[40px] bg-white p-8 md:p-10 text-center shadow-[0_20px_70px_rgba(15,23,42,0.08)] border border-slate-200/60">
        
        <div className="relative">
          <div className={`mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl text-3xl shadow-lg ${
            copy.network ? 'bg-sky-500 text-white shadow-sky-200' : 'bg-slate-900 text-white shadow-slate-200'
          }`}>
            <Icon />
          </div>

          <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
            {copy.title}
          </h1>
          
          <div className="mt-6 space-y-4">
            <p className="text-[1rem] font-semibold leading-relaxed text-slate-700">
              {busy ? "Preparing a clean reload..." : copy.message}
            </p>
            <p className="text-[0.9rem] font-medium leading-relaxed text-slate-500">
              {copy.action}
            </p>
          </div>

          {copy.code && (
            <div className="mt-8 inline-flex items-center rounded-full bg-slate-50 px-4 py-1.5 border border-slate-100">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 mr-2">Reference Code:</span>
              <span className="text-[12px] font-mono font-bold text-slate-600">{copy.code}</span>
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

            {(onBack !== false) && (
              <button
                type="button"
                onClick={handleBack}
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
              >
                <FaArrowLeft className="text-xs" />
                <span>{backLabel}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.location.href = "mailto:support@ctmerchant.com.ng?subject=Error Report [" + copy.code + "]"}
              className="mt-2 flex items-center justify-center gap-2 text-[12px] font-bold text-slate-400 transition hover:text-pink-600"
            >
              <FaEnvelope className="text-xs" />
              <span>Contact Support</span>
            </button>
          </div>

          {showDebugTools && (
            <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col gap-2 text-left">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-colors hover:text-slate-500"
              >
                <FaBug className="text-xs" />
                {showDetails ? "Hide Diagnostic Report" : "Show Diagnostic Report"}
              </button>

              {showDetails && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-[10px] font-mono text-slate-500">
                  <div className="mb-2 font-black uppercase tracking-tighter text-slate-400">Environment Snapshot</div>
                  <div className="space-y-1">
                    <p><strong>URL:</strong> {diagnosticInfo?.url}</p>
                    <p><strong>Cloud:</strong> {cloudStatus}</p>
                    <p><strong>Storage:</strong> {diagnosticInfo?.storage}</p>
                    <p><strong>Online:</strong> {String(diagnosticInfo?.online)}</p>
                    <p><strong>Browser:</strong> {diagnosticInfo?.agent?.substring(0, 60)}...</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GlobalErrorScreen
