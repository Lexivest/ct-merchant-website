import {
  FaRotateRight,
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6"

import CTMLoader from "./CTMLoader"

function PageTransitionOverlay({
  visible,
  error = "",
  onRetry = null,
  onDismiss = null,
}) {
  if (!visible && !error) return null

  return (
    <>
      {visible && !error ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center px-4 pointer-events-none">
          <div className="ctm-transition-enter ctm-transition-float relative flex flex-col items-center">
            <div className="ctm-transition-halo absolute inset-0 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(219,39,119,0.22)_0%,rgba(124,58,237,0.14)_38%,transparent_72%)] blur-2xl" />
            <div className="relative rounded-full border border-white/85 bg-white/94 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
              <div className="absolute inset-[3px] rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(252,231,243,0.88)_45%,rgba(243,232,255,0.9)_100%)]" />
              <div className="relative">
                <CTMLoader size="sm" />
              </div>
            </div>
            <div className="mt-3 h-1.5 w-24 overflow-hidden rounded-full bg-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
              <div className="ctm-transition-progress h-full w-full rounded-full" />
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="fixed inset-0 z-[2001] flex items-center justify-center px-4 pointer-events-none">
          <div className="ctm-transition-enter pointer-events-auto w-full max-w-sm rounded-[30px] border border-white/90 bg-white/96 p-7 text-center shadow-[0_30px_70px_rgba(15,23,42,0.2)]">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-red-50 text-red-600 shadow-[0_10px_24px_rgba(248,113,113,0.18)]">
              <FaTriangleExclamation className="text-2xl" />
            </div>
            <h2 className="mb-2 text-xl font-black text-slate-900 leading-tight">Connection Issue</h2>
            <p className="mb-8 text-sm font-medium leading-relaxed text-slate-500">
              {typeof error === 'string' ? error : "We couldn't reach the server. Please check your internet and try again."}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={onRetry}
                className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98]"
              >
                <span className="inline-flex items-center gap-2">
                  <FaRotateRight className="text-xs" />
                  Retry Connection
                </span>
              </button>
              <button
                onClick={onDismiss}
                className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98]"
              >
                <span className="inline-flex items-center gap-2">
                  <FaXmark className="text-sm" />
                  Dismiss
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default PageTransitionOverlay
