const PRIVACY_CONSENT_STORAGE_KEY = "ctm_privacy_consent_v1"
const PRIVACY_CONSENT_EVENT = "ctm:privacy-consent-changed"

const DEFAULT_CONSENT = Object.freeze({
  decided: false,
  analytics: false,
  choice: "undecided",
  updatedAt: null,
})

function normalizeConsent(value) {
  if (!value || typeof value !== "object") return DEFAULT_CONSENT

  return {
    decided: Boolean(value.decided || value.updatedAt),
    analytics: Boolean(value.analytics),
    choice: value.choice || (value.analytics ? "accepted" : "rejected"),
    updatedAt: value.updatedAt || null,
  }
}

export function readPrivacyConsent() {
  if (typeof window === "undefined") return DEFAULT_CONSENT

  try {
    const raw = window.localStorage?.getItem(PRIVACY_CONSENT_STORAGE_KEY)
    if (!raw) return DEFAULT_CONSENT
    return normalizeConsent(JSON.parse(raw))
  } catch {
    return DEFAULT_CONSENT
  }
}

export function writePrivacyConsent({ analytics = false, choice = "" } = {}) {
  if (typeof window === "undefined") return DEFAULT_CONSENT

  const nextConsent = normalizeConsent({
    decided: true,
    analytics,
    choice: choice || (analytics ? "accepted" : "rejected"),
    updatedAt: new Date().toISOString(),
  })

  try {
    window.localStorage?.setItem(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(nextConsent))
  } catch {
    // If storage is unavailable, still update the in-memory listeners below.
  }

  try {
    window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_EVENT, { detail: nextConsent }))
  } catch {
    // CustomEvent can be restricted in unusual browser contexts.
  }

  return nextConsent
}

export function resetPrivacyConsent() {
  if (typeof window === "undefined") return DEFAULT_CONSENT

  try {
    window.localStorage?.removeItem(PRIVACY_CONSENT_STORAGE_KEY)
  } catch {
    // If storage is unavailable, still notify listeners with the default state.
  }

  try {
    window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_EVENT, { detail: DEFAULT_CONSENT }))
  } catch {
    // Best effort only.
  }

  return DEFAULT_CONSENT
}

export function hasAnalyticsConsent() {
  return readPrivacyConsent().analytics === true
}

export function subscribePrivacyConsent(listener) {
  if (typeof window === "undefined" || typeof listener !== "function") {
    return () => {}
  }

  const handleConsentEvent = (event) => {
    listener(normalizeConsent(event.detail))
  }

  const handleStorageEvent = (event) => {
    if (event.key !== PRIVACY_CONSENT_STORAGE_KEY) return
    listener(readPrivacyConsent())
  }

  window.addEventListener(PRIVACY_CONSENT_EVENT, handleConsentEvent)
  window.addEventListener("storage", handleStorageEvent)

  return () => {
    window.removeEventListener(PRIVACY_CONSENT_EVENT, handleConsentEvent)
    window.removeEventListener("storage", handleStorageEvent)
  }
}
