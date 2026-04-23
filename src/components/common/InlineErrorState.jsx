import {
  FaRotateRight,
  FaShieldHalved,
  FaTriangleExclamation,
  FaWifi,
} from "react-icons/fa6"

import { ErrorCategory, getFriendlyError, isNetworkError } from "../../lib/friendlyErrors"
import { useNetworkStatus } from "../../lib/networkStatus"

function resolveInlineCopy({ error, title, message, isOffline }) {
  const fallback = getFriendlyError(error)
  const explicitMessage = String(message || "").trim()
  const network =
    isOffline ||
    isNetworkError(error) ||
    /offline|network|connection|internet/i.test(explicitMessage)

  const category = network ? ErrorCategory.NETWORK : fallback.category

  return {
    network,
    category,
    title:
      title ||
      (network
        ? "Connection issue"
        : category === ErrorCategory.AUTH
          ? "Security notice"
          : "Something went wrong"),
    message: explicitMessage || fallback.message,
    action: network ? "Check your connection and retry when you are ready." : fallback.action,
  }
}

function getSurfaceTone({ surface, network, category }) {
  const critical = category === ErrorCategory.AUTH || (!network && category === ErrorCategory.SERVER)

  if (surface === "dark") {
    return {
      card: "border-white/10 bg-[#081120]/92",
      badge: network ? "bg-sky-500/15 text-sky-200" : "bg-white/10 text-slate-200",
      iconWrap: network
        ? "bg-sky-500/15 text-sky-200"
        : critical
          ? "bg-rose-500/15 text-rose-200"
          : "bg-amber-500/15 text-amber-200",
      title: "text-white",
      message: "text-slate-200",
      action: "text-slate-400",
      button: "bg-white text-slate-950 hover:bg-slate-100",
    }
  }

  return {
    card: "border-slate-200 bg-white",
    badge: network ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600",
    iconWrap: network
      ? "bg-sky-50 text-sky-600"
      : critical
        ? "bg-rose-50 text-rose-600"
        : "bg-amber-50 text-amber-600",
    title: "text-slate-900",
    message: "text-slate-700",
    action: "text-slate-500",
    button: "bg-slate-900 text-white hover:bg-slate-800",
  }
}

export default function InlineErrorState({
  error = null,
  title = "",
  message = "",
  onRetry = null,
  retryLabel = "Retry",
  surface = "light",
  compact = false,
  className = "",
}) {
  const { isOffline } = useNetworkStatus()
  const copy = resolveInlineCopy({ error, title, message, isOffline })
  const tone = getSurfaceTone({
    surface,
    network: copy.network,
    category: copy.category,
  })

  const Icon = copy.network
    ? FaWifi
    : copy.category === ErrorCategory.AUTH
      ? FaShieldHalved
      : FaTriangleExclamation

  const badgeLabel = copy.network
    ? "Connection"
    : copy.category === ErrorCategory.AUTH
      ? "Security"
      : "Attention"

  return (
    <div
      className={`rounded-[24px] border px-5 py-5 shadow-sm ${tone.card} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className={compact ? "flex items-start gap-3" : "flex flex-col items-center gap-4 text-center"}>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${tone.iconWrap}`}
        >
          <Icon />
        </div>

        <div className={compact ? "min-w-0 flex-1" : "max-w-xl"}>
          <div
            className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${tone.badge}`}
          >
            {badgeLabel}
          </div>
          <div className={`mt-3 text-sm font-black ${tone.title}`}>{copy.title}</div>
          <p className={`mt-2 text-sm font-semibold leading-6 ${tone.message}`}>{copy.message}</p>
          {!compact && copy.action && copy.action !== copy.message ? (
            <p className={`mt-2 text-xs font-medium leading-5 ${tone.action}`}>{copy.action}</p>
          ) : null}
        </div>
      </div>

      {typeof onRetry === "function" ? (
        <button
          type="button"
          onClick={onRetry}
          className={`mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition ${tone.button}`}
        >
          <FaRotateRight className="text-xs" />
          <span>{retryLabel}</span>
        </button>
      ) : null}
    </div>
  )
}
