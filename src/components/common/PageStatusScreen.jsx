import CTMLoader from "./CTMLoader"
import GlobalErrorScreen from "./GlobalErrorScreen"

export function PageLoadingScreen({
  fullScreen = true,
}) {
  const wrapperClass = fullScreen
    ? "min-h-screen"
    : "min-h-[280px]"

  return (
    <div className={`${wrapperClass} flex items-center justify-center bg-[#E3E6E6] px-5 py-10`}>
      <CTMLoader size="sm" />
    </div>
  )
}

export function PageErrorScreen({
  title = "Something went wrong",
  message = "Please try again.",
  fullScreen = true,
  onRetry = null,
  onBack = null,
}) {
  return (
    <GlobalErrorScreen
      title={title}
      message={message}
      fullScreen={fullScreen}
      onRetry={onRetry}
      onBack={
        onBack ||
        (() => {
          if (typeof window !== "undefined") window.history.back()
        })
      }
    />
  )
}
