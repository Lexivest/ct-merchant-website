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
        <div className="pointer-events-none fixed inset-0 z-[1600] flex items-center justify-center">
          <div className="rounded-full bg-white/88 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
            <CTMLoader size="sm" />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="fixed inset-x-0 bottom-5 z-[1601] flex justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white px-4 py-4 shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-semibold leading-6 text-slate-700">{error}</p>
            <div className="mt-3 flex gap-3">
              {typeof onRetry === "function" ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex-1 rounded-xl bg-[#131921] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#232F3E]"
                >
                  Try again
                </button>
              ) : null}
              {typeof onDismiss === "function" ? (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default PageTransitionOverlay
