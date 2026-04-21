const FINGERPRINT_STORAGE_KEY = "ctm_device_fingerprint_v1"
const ANON_USAGE_STORAGE_PREFIX = "ctm_ai_anon_usage_v2_"

function getTodayString() {
  return new Date().toISOString().split("T")[0]
}

function readStorage(key) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures.
  }
}

function getFingerprintSource() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return ""

  const screenData = window.screen || {}
  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    } catch {
      return ""
    }
  })()

  return JSON.stringify({
    userAgent: navigator.userAgent || "",
    language: navigator.language || "",
    languages: Array.isArray(navigator.languages) ? navigator.languages.join(",") : "",
    platform: navigator.userAgentData?.platform || navigator.platform || "",
    mobile: navigator.userAgentData?.mobile ?? /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent || ""),
    vendor: navigator.vendor || "",
    deviceMemory: navigator.deviceMemory || "",
    hardwareConcurrency: navigator.hardwareConcurrency || "",
    maxTouchPoints: navigator.maxTouchPoints || 0,
    cookieEnabled: navigator.cookieEnabled ? 1 : 0,
    timezone,
    colorDepth: screenData.colorDepth || "",
    pixelDepth: screenData.pixelDepth || "",
    screenWidth: screenData.width || "",
    screenHeight: screenData.height || "",
    availWidth: screenData.availWidth || "",
    availHeight: screenData.availHeight || "",
    devicePixelRatio: window.devicePixelRatio || 1,
  })
}

async function sha256Hex(input) {
  if (typeof TextEncoder === "undefined" || typeof crypto === "undefined" || !crypto.subtle) {
    return input
  }

  const bytes = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function getDeviceFingerprint() {
  const cached = readStorage(FINGERPRINT_STORAGE_KEY)
  if (cached) return cached

  const source = getFingerprintSource()
  if (!source) return ""

  const fingerprint = `fp_${await sha256Hex(source)}`
  writeStorage(FINGERPRINT_STORAGE_KEY, fingerprint)
  return fingerprint
}

export function readAnonymousAiUsage(signature) {
  const today = getTodayString()
  if (!signature) return { date: today, count: 0 }

  try {
    const raw = readStorage(`${ANON_USAGE_STORAGE_PREFIX}${signature}`)
    if (!raw) return { date: today, count: 0 }

    const parsed = JSON.parse(raw)
    if (parsed?.date === today && Number.isFinite(parsed?.count)) {
      return { date: today, count: Math.max(0, Number(parsed.count) || 0) }
    }
  } catch {
    // Ignore malformed storage.
  }

  return { date: today, count: 0 }
}

export function writeAnonymousAiUsage(signature, count) {
  if (!signature) return

  writeStorage(
    `${ANON_USAGE_STORAGE_PREFIX}${signature}`,
    JSON.stringify({
      date: getTodayString(),
      count: Math.max(0, Number(count) || 0),
    })
  )
}
