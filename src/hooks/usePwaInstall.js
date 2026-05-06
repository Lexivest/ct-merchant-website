import { useCallback, useEffect, useMemo, useState } from "react"

const KNOWN_INSTALL_STORAGE_KEY = "ctm_pwa_known_installed"

function detectStandalone() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator?.standalone === true
  )
}

function readStorageFlag(key) {
  if (typeof window === "undefined") return false

  try {
    if (window.localStorage.getItem(key) === "1") return true
    return window.sessionStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function writeStorageFlag(key, enabled) {
  if (typeof window === "undefined") return

  try {
    if (enabled) {
      window.localStorage.setItem(key, "1")
      window.sessionStorage.setItem(key, "1")
      return
    }

    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  } catch {
    // Best effort only.
  }
}

export default function usePwaInstall() {
  const [installPromptEvent, setInstallPromptEvent] = useState(null)
  const [installingApp, setInstallingApp] = useState(false)
  const [isStandaloneMode, setIsStandaloneMode] = useState(() =>
    typeof window === "undefined" ? false : detectStandalone()
  )
  const [recentlyInstalled, setRecentlyInstalled] = useState(() =>
    readStorageFlag(KNOWN_INSTALL_STORAGE_KEY) ||
    (typeof window === "undefined" ? false : detectStandalone())
  )
  const [hasInstalledRelatedApp, setHasInstalledRelatedApp] = useState(false)

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

  const isSupportedAndroidInstallBrowser = useMemo(() => {
    if (typeof navigator === "undefined") return false
    const userAgent = navigator.userAgent || ""

    if (!/android/i.test(userAgent)) return false

    return /(chrome\/|crmo\/|edga\/|samsungbrowser\/)/i.test(userAgent)
  }, [])

  const isKnownInstalled =
    isStandaloneMode || recentlyInstalled || hasInstalledRelatedApp
  const canPromptInstall = Boolean(installPromptEvent) && !isKnownInstalled
  const showInstallPrompt =
    isPhoneDevice &&
    !isKnownInstalled &&
    (Boolean(installPromptEvent) || isAppleMobile || isSupportedAndroidInstallBrowser)

  const clearPromptState = useCallback(() => {
    setInstallPromptEvent(null)
    setInstallingApp(false)
  }, [])

  const promptInstall = useCallback(async () => {
    if (isKnownInstalled) {
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
          setRecentlyInstalled(true)
          writeStorageFlag(KNOWN_INSTALL_STORAGE_KEY, true)
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

    if (isSupportedAndroidInstallBrowser) {
      return { status: "browser-menu" }
    }

    return { status: "unsupported" }
  }, [
    clearPromptState,
    isKnownInstalled,
    installPromptEvent,
    isAppleMobile,
    isSupportedAndroidInstallBrowser,
  ])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)")
    let cancelled = false

    if (detectStandalone()) {
      writeStorageFlag(KNOWN_INSTALL_STORAGE_KEY, true)
    }

    async function refreshInstalledRelatedApps() {
      if (typeof navigator?.getInstalledRelatedApps !== "function") {
        setHasInstalledRelatedApp(false)
        return
      }

      try {
        const relatedApps = await navigator.getInstalledRelatedApps()
        if (!cancelled) {
          const installed = Array.isArray(relatedApps) && relatedApps.length > 0
          setHasInstalledRelatedApp(installed)
          if (installed) writeStorageFlag(KNOWN_INSTALL_STORAGE_KEY, true)
        }
      } catch {
        if (!cancelled) setHasInstalledRelatedApp(false)
      }
    }

    function handleInstallPrompt(event) {
      event.preventDefault()

      if (detectStandalone() || readStorageFlag(KNOWN_INSTALL_STORAGE_KEY)) {
        setInstallPromptEvent(null)
        return
      }

      setInstallPromptEvent(event)
    }

    function handleAppInstalled() {
      setRecentlyInstalled(true)
      writeStorageFlag(KNOWN_INSTALL_STORAGE_KEY, true)
      clearPromptState()
    }

    function handleStandaloneChange(event) {
      setIsStandaloneMode(Boolean(event.matches))
      if (event.matches) {
        setRecentlyInstalled(true)
        writeStorageFlag(KNOWN_INSTALL_STORAGE_KEY, true)
        clearPromptState()
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        const isStandalone = detectStandalone()
        if (isStandalone) writeStorageFlag(KNOWN_INSTALL_STORAGE_KEY, true)
        setIsStandaloneMode(isStandalone)
        setRecentlyInstalled(readStorageFlag(KNOWN_INSTALL_STORAGE_KEY))
        void refreshInstalledRelatedApps()
      }
    }

    void refreshInstalledRelatedApps()

    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)
    window.addEventListener("visibilitychange", handleVisibilityChange)
    standaloneQuery?.addEventListener?.("change", handleStandaloneChange)

    return () => {
      cancelled = true
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
    isKnownInstalled,
    isPhoneDevice,
    isStandaloneMode,
    isSupportedAndroidInstallBrowser,
    promptInstall,
    recentlyInstalled,
    showInstallPrompt,
  }
}
