import CTMLoader from "./CTMLoader"

export function PageLoadingScreen({
  title = "Loading page",
  message = "Please wait while we prepare this screen.",
  fullScreen = true,
}) {
  const wrapperClass = fullScreen
    ? "min-h-screen"
    : "min-h-[280px]"

  return (
    <div className={`${wrapperClass} flex items-center justify-center bg-[#E3E6E6] px-5 py-10`}>
      <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/92 p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
        <div className="mx-auto flex justify-center">
          <CTMLoader size="lg" />
        </div>
        <h2 className="mt-5 text-[1.3rem] font-black text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      </div>
    </div>
  )
}

export function PageErrorScreen({
  title = "Something went wrong",
  message = "Please try again.",
  fullScreen = true,
  onRetry = null,
}) {
  const wrapperClass = fullScreen
    ? "min-h-screen"
    : "min-h-[280px]"

  return (
    <div className={`${wrapperClass} flex items-center justify-center bg-[#E3E6E6] px-5 py-10`}>
      <div className="w-full max-w-md rounded-[28px] border border-rose-100 bg-white p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-[1.5rem] font-black text-rose-600">
          !
        </div>
        <h2 className="mt-5 text-[1.3rem] font-black text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {typeof onRetry === "function" ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 rounded-2xl bg-[#131921] px-6 py-3 font-bold text-white transition hover:bg-[#232F3E]"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  )
}
