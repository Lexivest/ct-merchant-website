import CTMLoader from "./CTMLoader"
import GlobalErrorScreen from "./GlobalErrorScreen"

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
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-white/40 backdrop-blur-[2px]">
          <div className="rounded-2xl bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-slate-100">
            <CTMLoader size="sm" />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="fixed inset-0 z-[2001] flex items-center justify-center bg-slate-900/10 backdrop-blur-md px-4">
          <div className="w-full max-w-sm rounded-[32px] bg-white p-8 text-center shadow-[0_30px_70px_rgba(0,0,0,0.2)] border border-slate-100">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
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
                Retry Connection
              </button>
              <button
                onClick={onDismiss}
                className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default PageTransitionOverlay
