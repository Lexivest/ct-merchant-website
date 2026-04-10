import CTMLoader from "./CTMLoader"

function PageTransitionOverlay({
  visible,
  title = "Opening page",
  message = "Please wait while we get the next screen ready.",
  error = "",
  onRetry = null,
  onDismiss = null,
}) {
  if (!visible && !error) return null

  return (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-[rgba(15,23,42,0.16)] px-5 backdrop-blur-[3px]">
      <div className="w-full max-w-md rounded-[28px] border border-white/60 bg-white/92 p-7 text-center shadow-[0_28px_70px_rgba(15,23,42,0.2)]">
        {!error ? (
          <div className="mx-auto flex justify-center">
            <CTMLoader size="lg" />
          </div>
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-[1.7rem] font-black text-rose-600">
            !
          </div>
        )}

        <h2 className="mt-5 text-[1.3rem] font-black text-slate-900">
          {error ? "Could not open that page" : title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {error || message}
        </p>

        {error ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {typeof onRetry === "function" ? (
              <button
                type="button"
                onClick={onRetry}
                className="flex-1 rounded-2xl bg-[#131921] px-5 py-3 font-bold text-white transition hover:bg-[#232F3E]"
              >
                Try again
              </button>
            ) : null}
            {typeof onDismiss === "function" ? (
              <button
                type="button"
                onClick={onDismiss}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Stay here
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 text-[0.75rem] font-bold uppercase tracking-[0.2em] text-pink-600">
            CTMerchant
          </div>
        )}
      </div>
    </div>
  )
}

export default PageTransitionOverlay
