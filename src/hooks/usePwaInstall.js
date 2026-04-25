import { useCallback, useEffect, useMemo, useState } from "react"

const DISMISS_STORAGE_KEY = "ctm_pwa_install_dismiss_until"
const DEFAULT_DISMISS_MS = 1000 * 60 * 60 * 24 * 3

function readStorageNumber(key) {
  if (typeof window === "undefined") return 0

  try {
    const value = window.localStorage.getItem(key)
    const parsed = Number.parseInt(value || "", 10)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

function writeStorageValue(key, value) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Best effort only.
  }
}

function detectStandalone() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator?.standalone === true
  )
}

export default function usePwaInstall() {
  const [installPromptEvent, setInstallPromptEvent] = useState(null)
  const [installingApp, setInstallingApp] = useState(false)
  const [dismissedUntil, setDismissedUntil] = useState(() => readStorageNumber(DISMISS_STORAGE_KEY))
  const [installClock, setInstallClock] = useState(() =>
    typeof window === "undefined" ? 0 : Date.now()
  )
  const [isStandaloneMode, setIsStandaloneMode] = useState(() =>
    typeof window === "undefined" ? false : detectStandalone()
  )

  const isPhoneDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false
    const userAgent = navigator.userAgent || ""
    return /android.*mobile|iphone|ipod/i.test(userAgent)
  }, [])

  const isAppleMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false
    const userAgent = navigator.userAgent || ""
    return /iphone|ipad|ipod/i.test(userAgent)
  }, [])

  const canPromptInstall = Boolean(installPromptEvent)
  const showInstallCard = isPhoneDevice && !isStandaloneMode && installClock > dismissedUntil

  const dismissInstallCard = useCallback((durationMs = DEFAULT_DISMISS_MS) => {
    const nextDismissTime = Date.now() + durationMs
    setDismissedUntil(nextDismissTime)
    writeStorageValue(DISMISS_STORAGE_KEY, nextDismissTime)
  }, [])

  const clearPromptState = useCallback(() => {
    setInstallPromptEvent(null)
    setInstallingApp(false)
  }, [])

  const promptInstall = useCallback(async () => {
    if (installPromptEvent) {
      const promptEvent = installPromptEvent
      setInstallingApp(true)
      setInstallPromptEvent(null)

      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice

        if (choice?.outcome === "accepted") {
          clearPromptState()
          return { status: "accepted" }
        }

        setInstallingApp(false)
        dismissInstallCard(1000 * 60 * 60 * 24 * 3)
        return { status: "dismissed" }
      } catch (error) {
        setInstallingApp(false)
        return { status: "error", error }
      }
    }

    if (isAppleMobile) {
      return { status: "ios-instructions" }
    }

    return { status: "unsupported" }
  }, [clearPromptState, dismissInstallCard, installPromptEvent, isAppleMobile])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const syncInstallClock = () => {
      setInstallClock(Date.now())
    }

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)")

    function handleInstallPrompt(event) {
      event.preventDefault()
      setInstallPromptEvent(event)
    }

    function handleAppInstalled() {
      clearPromptState()
    }

    function handleStandaloneChange(event) {
      setIsStandaloneMode(Boolean(event.matches))
      if (event.matches) clearPromptState()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        syncInstallClock()
        setDismissedUntil(readStorageNumber(DISMISS_STORAGE_KEY))
        setIsStandaloneMode(detectStandalone())
      }
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)
    window.addEventListener("visibilitychange", handleVisibilityChange)
    standaloneQuery?.addEventListener?.("change", handleStandaloneChange)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
      window.removeEventListener("visibilitychange", handleVisibilityChange)
      standaloneQuery?.removeEventListener?.("change", handleStandaloneChange)
    }
  }, [clearPromptState])

  return {
    canPromptInstall,
    installingApp,
    isAppleMobile,
    isPhoneDevice,
    isStandaloneMode,
    promptInstall,
    showInstallCard,
    dismissInstallCard,
  }
}
