import { useCallback, useEffect, useMemo, useState } from "react"

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

  const canPromptInstall = Boolean(installPromptEvent) && !isStandaloneMode
  const showInstallPrompt = isPhoneDevice

  const clearPromptState = useCallback(() => {
    setInstallPromptEvent(null)
    setInstallingApp(false)
  }, [])

  const promptInstall = useCallback(async () => {
    if (isStandaloneMode) {
      return { status: "already-installed" }
    }

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
  }, [clearPromptState, installPromptEvent, isAppleMobile, isStandaloneMode])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

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
    showInstallPrompt,
  }
}
