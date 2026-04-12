import { FaArrowLeft, FaRotateRight, FaTriangleExclamation, FaWifi } from "react-icons/fa6"
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
      title: explicitTitle || (network ? "No internet connection" : "Something went wrong"),
      message:
        explicitMessage ||
        (network
          ? "Please check your connection. This screen will stay here until you retry or go back."
          : "We could not complete that request. Please retry or go back."),
    }
  }

  if (network) {
    return {
      network,
      chunk,
      title: "No internet connection",
      message: "Please check your connection. This screen will stay here until you retry or go back.",
    }
  }

  if (chunk) {
    return {
      network,
      chunk,
      title: "Website update in progress",
      message: "A fresh version of CTMerchant is available. Retry will safely reload the latest files.",
    }
  }

  return {
    network,
    chunk,
    title: "Something went wrong",
    message: "We could not complete that request. Please retry or go back.",
  }
}

function GlobalErrorScreen({
  error = null,
  title = "",
  message = "",
  fullScreen = true,
  onRetry = null,
  onBack = null,
  retryLabel = "Retry",
  backLabel = "Go back",
  busy = false,
}) {
  const copy = resolveErrorCopy(error, title, message)
  const wrapperClass = fullScreen ? "min-h-screen" : "min-h-[280px]"
  const Icon = copy.network ? FaWifi : FaTriangleExclamation

  return (
    <div className={`${wrapperClass} flex items-center justify-center bg-[#E3E6E6] px-5 py-10`}>
      <div className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-white/80 bg-white p-7 text-center shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
        <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-pink-100" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-44 w-44 rounded-full bg-rose-50" />

        <div className="relative">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#131921] text-2xl text-pink-300 shadow-[0_14px_30px_rgba(19,25,33,0.22)]">
            <Icon />
          </div>

          <div className="mx-auto mt-5 inline-flex rounded-full bg-pink-100 px-3 py-1 text-[0.75rem] font-black uppercase tracking-[0.12em] text-pink-700 ring-1 ring-pink-200">
            CTMerchant
          </div>

          <h1 className="mt-4 text-[1.55rem] font-black leading-tight text-slate-950">
            {copy.title}
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            {busy ? "Preparing a clean reload..." : copy.message}
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {typeof onRetry === "function" ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={busy}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[#131921] px-5 py-3 text-sm font-black text-white transition hover:bg-[#232F3E] disabled:cursor-wait disabled:opacity-70"
              >
                <FaRotateRight className={busy ? "animate-spin" : ""} />
                {retryLabel}
              </button>
            ) : null}

            {typeof onBack === "function" ? (
              <button
                type="button"
                onClick={onBack}
                disabled={busy}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-pink-50 px-5 py-3 text-sm font-black text-pink-700 transition hover:bg-pink-100 disabled:cursor-wait disabled:opacity-70"
              >
                <FaArrowLeft />
                {backLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default GlobalErrorScreen
