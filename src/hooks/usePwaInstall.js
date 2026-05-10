import { useCallback, useEffect, useMemo, useState } from "react"

// ─── Storage keys ─────────────────────────────────────────────────────────────
const KNOWN_INSTALL_KEY = "ctm_pwa_known_installed"
const VISIT_COUNT_KEY   = "ctm_pwa_visit_count"
const SESSION_INIT_KEY  = "ctm_pwa_session_init"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeLocalGet(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function safeLocalSet(key, value) {
  try { window.localStorage.setItem(key, value) } catch { /* quota / private */ }
}
function safeLocalRemove(key) {
  try { window.localStorage.removeItem(key) } catch { /* best effort */ }
}
function safeSessionGet(key) {
  try { return window.sessionStorage.getItem(key) } catch { return null }
}
function safeSessionSet(key, value) {
  try { window.sessionStorage.setItem(key, value) } catch { /* best effort */ }
}

// Returns true when the app is running in standalone (installed) mode.
function detectStandalone() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator?.standalone === true
  )
}

// Reads / increments the persistent visit counter.
// Only counts once per browser session so tab-duplicates don't inflate it.
function initAndReadVisitCount() {
  if (typeof window === "undefined") return 1
  if (safeSessionGet(SESSION_INIT_KEY)) {
    return parseInt(safeLocalGet(VISIT_COUNT_KEY) || "1", 10)
  }
  safeSessionSet(SESSION_INIT_KEY, "1")
  const prev = parseInt(safeLocalGet(VISIT_COUNT_KEY) || "0", 10)
  const next  = prev + 1
  safeLocalSet(VISIT_COUNT_KEY, String(next))
  return next
}

function readKnownInstalled() {
  if (typeof window === "undefined") return false
  return (
    safeLocalGet(KNOWN_INSTALL_KEY) === "1" ||
    safeSessionGet(KNOWN_INSTALL_KEY) === "1"
  )
}

function writeKnownInstalled() {
  safeLocalSet(KNOWN_INSTALL_KEY, "1")
  safeSessionSet(KNOWN_INSTALL_KEY, "1")
}

function clearKnownInstalled() {
  safeLocalRemove(KNOWN_INSTALL_KEY)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export default function usePwaInstall() {
  const [installPromptEvent, setInstallPromptEvent] = useState(null)
  const [installingApp, setInstallingApp]           = useState(false)
  const [isStandaloneMode, setIsStandaloneMode]     = useState(() =>
    typeof window === "undefined" ? false : detectStandalone()
  )
  const [recentlyInstalled, setRecentlyInstalled] = useState(() =>
    readKnownInstalled() || (typeof window === "undefined" ? false : detectStandalone())
  )
  const [hasInstalledRelatedApp, setHasInstalledRelatedApp] = useState(false)

  // User-engagement gate: true from visit 2 onwards, OR after 30 s on first visit.
  const [isEngaged, setIsEngaged] = useState(() => {
    const count = initAndReadVisitCount()
    return count >= 2
  })

  // ── Device / browser detection ───────────────────────────────────────────

  const isPhoneDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false
    return /android.*mobile|iphone|ipod/i.test(navigator.userAgent)
  }, [])

  // iOS Safari is the ONLY iOS browser that can add to home screen.
  // Detected by: iOS UA + `navigator.standalone` being defined (Mobile Safari only).
  const isIosSafari = useMemo(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return false
    return (
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      "standalone" in navigator
    )
  }, [])

  // Kept for consumers that already use this name.
  const isAppleMobile = isIosSafari

  // ── Derived state ────────────────────────────────────────────────────────

  const isKnownInstalled =
    isStandaloneMode || recentlyInstalled || hasInstalledRelatedApp

  const canPromptInstall = Boolean(installPromptEvent) && !isKnownInstalled

  // Show the install UI only when:
  //  • on a phone
  //  • not already installed
  //  • user has had some engagement (2nd visit or 30s on site)
  //  • EITHER the native prompt is ready (Android) OR it's iOS Safari (manual steps)
  const showInstallPrompt =
    isPhoneDevice &&
    !isKnownInstalled &&
    isEngaged &&
    (Boolean(installPromptEvent) || isIosSafari)

  // ── Internal helpers ─────────────────────────────────────────────────────

  const clearPromptState = useCallback(() => {
    setInstallPromptEvent(null)
    setInstallingApp(false)
  }, [])

  // ── Public API ───────────────────────────────────────────────────────────

  const promptInstall = useCallback(async () => {
    if (isKnownInstalled) return { status: "already-installed" }

    if (installPromptEvent) {
      const promptEvent = installPromptEvent
      setInstallingApp(true)
      setInstallPromptEvent(null)

      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice

        if (choice?.outcome === "accepted") {
          setRecentlyInstalled(true)
          writeKnownInstalled()
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

    if (isIosSafari) return { status: "ios-instructions" }

    return { status: "unsupported" }
  }, [clearPromptState, isKnownInstalled, installPromptEvent, isIosSafari])

  // ── Effects ───────────────────────────────────────────────────────────────

  // 30-second engagement timer for first-visit users.
  useEffect(() => {
    if (isEngaged) return undefined
    const timer = window.setTimeout(() => setIsEngaged(true), 30_000)
    return () => window.clearTimeout(timer)
  }, [isEngaged])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)")
    let cancelled = false

    if (detectStandalone()) writeKnownInstalled()

    async function refreshInstalledRelatedApps() {
      if (typeof navigator?.getInstalledRelatedApps !== "function") {
        setHasInstalledRelatedApp(false)
        return
      }
      try {
        const apps = await navigator.getInstalledRelatedApps()
        if (!cancelled) {
          const installed = Array.isArray(apps) && apps.length > 0
          setHasInstalledRelatedApp(installed)
          if (installed) writeKnownInstalled()
        }
      } catch {
        if (!cancelled) setHasInstalledRelatedApp(false)
      }
    }

    function handleInstallPrompt(event) {
      event.preventDefault()
      if (detectStandalone() || readKnownInstalled()) {
        setInstallPromptEvent(null)
        return
      }
      setInstallPromptEvent(event)
    }

    function handleAppInstalled() {
      setRecentlyInstalled(true)
      writeKnownInstalled()
      clearPromptState()
    }

    function handleStandaloneChange(event) {
      setIsStandaloneMode(Boolean(event.matches))
      if (event.matches) {
        setRecentlyInstalled(true)
        writeKnownInstalled()
        clearPromptState()
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return
      const standalone = detectStandalone()
      if (standalone) writeKnownInstalled()
      setIsStandaloneMode(standalone)
      setRecentlyInstalled(readKnownInstalled())
      void refreshInstalledRelatedApps()
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
    isIosSafari,
    isKnownInstalled,
    isPhoneDevice,
    isStandaloneMode,
    promptInstall,
    recentlyInstalled,
    showInstallPrompt,
  }
}
