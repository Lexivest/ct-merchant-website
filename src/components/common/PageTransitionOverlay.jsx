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
        <div className="pointer-events-none fixed inset-0 z-[1600] flex items-center justify-center">
          <div className="rounded-full bg-white/88 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
            <CTMLoader size="sm" />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="fixed inset-0 z-[1601]">
          <GlobalErrorScreen
            error={error}
            message={error}
            onRetry={onRetry}
            onBack={onDismiss}
            backLabel="Go back"
          />
        </div>
      ) : null}
    </>
  )
}

export default PageTransitionOverlay
