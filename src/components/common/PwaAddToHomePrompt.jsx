import { useEffect, useState } from "react"
import { FaMobileScreenButton, FaXmark } from "react-icons/fa6"

import usePwaInstall from "../../hooks/usePwaInstall"
import { useGlobalFeedback } from "./GlobalFeedbackProvider"

function PwaAddToHomePrompt() {
  const { notify } = useGlobalFeedback()
  const {
    installingApp,
    isAppleMobile,
    isSupportedAndroidInstallBrowser,
    promptInstall,
    recentlyInstalled,
    showInstallPrompt,
  } = usePwaInstall()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!showInstallPrompt) return undefined

    const timer = window.setTimeout(() => {
      setVisible(true)
    }, 900)

    return () => window.clearTimeout(timer)
  }, [showInstallPrompt])

  async function handleAddToHomeScreen() {
    const result = await promptInstall()

    if (result?.status === "accepted") {
      setVisible(false)
      return
    }

    if (result?.status === "dismissed") {
      return
    }

    if (result?.status === "already-installed") {
      notify({
        type: "info",
        title: "Already on home screen",
        message: "CTMerchant is already available from your home screen. Open it directly from there.",
      })
      return
    }

    if (result?.status === "error") {
      notify({
        type: "error",
        title: "Add to Home Screen failed",
        message: "CTMerchant could not open the home screen prompt right now. Please try again.",
      })
      return
    }

    if (result?.status === "browser-menu") {
      notify({
        type: "info",
        title: "Add to Home Screen",
        message: "This browser supports Add to Home Screen. If the install sheet does not open automatically, open the browser menu and tap Add to Home Screen.",
      })
      return
    }

    notify({
      type: isAppleMobile ? "info" : "error",
      title: isAppleMobile ? "Add to Home Screen" : "Unsupported browser",
      message: isAppleMobile
        ? "Open Safari Share menu and tap Add to Home Screen."
        : "Direct Add to Home Screen is not supported in this browser. Use Chrome or Edge on Android.",
    })
  }

  if (!showInstallPrompt || !visible) {
    return null
  }

  const helperText = isAppleMobile
    ? "Tap Add, or use Safari Share menu."
    : recentlyInstalled
      ? "Already added? Open CTMerchant from home screen."
      : isSupportedAndroidInstallBrowser
        ? "Tap Add. If needed, use your browser menu."
        : "Use Chrome or Edge on Android for best results."

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[12000] flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[24px] border border-pink-200/90 bg-white/95 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pink-600 text-white shadow-sm">
          <FaMobileScreenButton className="text-base" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-pink-600">
            Add to Home Screen
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-5 text-slate-700">
            Keep CTMerchant one tap away on your phone.
          </p>
          <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500">
            {helperText}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleAddToHomeScreen}
            disabled={installingApp}
            className="rounded-2xl bg-pink-600 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-pink-700 disabled:cursor-wait disabled:opacity-70"
          >
            {installingApp ? "Opening..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close Add to Home Screen prompt"
          >
            <FaXmark />
          </button>
        </div>
      </div>
    </div>
  )
}

export default PwaAddToHomePrompt
