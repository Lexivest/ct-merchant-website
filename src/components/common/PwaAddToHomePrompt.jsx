import { useEffect, useState } from "react"
import { FaMobileScreenButton, FaXmark } from "react-icons/fa6"

import usePwaInstall from "../../hooks/usePwaInstall"
import BrandText from "./BrandText"
import { useGlobalFeedback } from "./GlobalFeedbackProvider"

const DISMISSED_UNTIL_STORAGE_KEY = "ctm_pwa_install_prompt_dismissed_until"
const DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1000

function isPromptDismissed() {
  if (typeof window === "undefined") return false

  try {
    const dismissedUntil = Number(
      window.localStorage.getItem(DISMISSED_UNTIL_STORAGE_KEY) || 0
    )
    return Number.isFinite(dismissedUntil) && dismissedUntil > Date.now()
  } catch {
    return false
  }
}

function snoozePrompt() {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      DISMISSED_UNTIL_STORAGE_KEY,
      String(Date.now() + DISMISS_DURATION_MS)
    )
  } catch {
    // Best effort only.
  }
}

function PwaAddToHomePrompt() {
  const { notify } = useGlobalFeedback()
  const {
    canPromptInstall,
    installingApp,
    isAppleMobile,
    promptInstall,
    showInstallPrompt,
  } = usePwaInstall()
  const [dismissed, setDismissed] = useState(() => isPromptDismissed())
  const [visible, setVisible] = useState(() => false)

  useEffect(() => {
    if (!showInstallPrompt || dismissed || visible) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setVisible(true)
    }, 900)

    return () => window.clearTimeout(timer)
  }, [dismissed, showInstallPrompt, visible])

  function dismissPrompt() {
    snoozePrompt()
    setDismissed(true)
    setVisible(false)
  }

  async function handleAddToHomeScreen() {
    const result = await promptInstall()

    if (result?.status === "accepted") {
      setVisible(false)
      return
    }

    if (result?.status === "dismissed") {
      dismissPrompt()
      return
    }

    if (result?.status === "already-installed") {
      setVisible(false)
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
      dismissPrompt()
      return
    }

    notify({
      type: isAppleMobile ? "info" : "error",
      title: isAppleMobile ? "Add to Home Screen" : "Unsupported browser",
      message: isAppleMobile
        ? "Open Safari Share menu and tap Add to Home Screen."
        : "Direct Add to Home Screen is not supported in this browser. Use Chrome or Edge on Android.",
    })
    dismissPrompt()
  }

  if (!showInstallPrompt || !visible) {
    return null
  }

  const actionLabel = installingApp ? "Opening..." : canPromptInstall ? "Add" : "How"

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[12000] flex justify-center px-3">
      <div className="pointer-events-auto flex min-h-11 w-full max-w-[420px] items-center gap-2 rounded-full border border-pink-200/90 bg-white/95 px-3 py-2 shadow-[0_14px_36px_rgba(15,23,42,0.16)] backdrop-blur">
        <FaMobileScreenButton className="h-4 w-4 shrink-0 text-pink-600" />

        <p className="min-w-0 flex-1 truncate text-xs font-black text-slate-800">
          Add <BrandText /> to home screen
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleAddToHomeScreen}
            disabled={installingApp}
            className="rounded-full bg-pink-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-pink-700 disabled:cursor-wait disabled:opacity-70"
          >
            {actionLabel}
          </button>
          <button
            type="button"
            onClick={dismissPrompt}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close Add to Home Screen prompt"
          >
            <FaXmark className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default PwaAddToHomePrompt
