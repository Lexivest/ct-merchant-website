function isCoarsePointerDevice() {
  if (typeof window === "undefined") return false
  return Boolean(window.matchMedia?.("(pointer: coarse)").matches)
}

export function shouldUseDirectWhatsAppHandoff() {
  if (typeof window === "undefined") return false

  if (typeof navigator !== "undefined") {
    if (navigator.userAgentData?.mobile) return true

    const userAgent = navigator.userAgent || ""
    const isTouchDevice =
      navigator.maxTouchPoints > 0 ||
      /android|iphone|ipad|ipod|mobile/i.test(userAgent)

    if (isTouchDevice) return true
  }

  return isCoarsePointerDevice()
}

export function normalizeWhatsAppPhone(rawPhone, countryCode = "234") {
  const digits = String(rawPhone || "").replace(/\D/g, "")
  if (!digits) return ""

  if (digits.startsWith(countryCode)) return digits
  if (digits.startsWith("0")) return `${countryCode}${digits.slice(1)}`
  if (digits.length === 10) return `${countryCode}${digits}`
  return digits
}

function buildWhatsAppUrls(phone, text) {
  const encodedText = encodeURIComponent(text || "")

  return {
    nativeUrl: `whatsapp://send?phone=${phone}&text=${encodedText}`,
    apiUrl: `https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`,
    waUrl: `https://wa.me/${phone}?text=${encodedText}`,
    webUrl: `https://web.whatsapp.com/send?phone=${phone}&text=${encodedText}`,
  }
}

function triggerDirectNavigation(url) {
  const link = document.createElement("a")
  link.href = url
  link.rel = "noopener noreferrer"
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function openWhatsAppConversation(phone, text) {
  if (typeof window === "undefined" || typeof document === "undefined") return false

  const normalizedPhone = normalizeWhatsAppPhone(phone)
  if (!normalizedPhone) return false

  const urls = buildWhatsAppUrls(normalizedPhone, text)

  if (!shouldUseDirectWhatsAppHandoff()) {
    window.open(urls.webUrl, "_blank", "noopener,noreferrer")
    return true
  }

  let cleanedUp = false
  const timers = []

  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    timers.forEach((timerId) => window.clearTimeout(timerId))
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    window.removeEventListener("pagehide", cleanup)
    window.removeEventListener("blur", cleanup)
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      cleanup()
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange)
  window.addEventListener("pagehide", cleanup, { once: true })
  window.addEventListener("blur", cleanup, { once: true })

  timers.push(
    window.setTimeout(() => {
      if (!cleanedUp && document.visibilityState === "visible") {
        window.location.replace(urls.apiUrl)
      }
    }, 900)
  )

  timers.push(
    window.setTimeout(() => {
      if (!cleanedUp && document.visibilityState === "visible") {
        window.location.replace(urls.waUrl)
      }
    }, 1800)
  )

  try {
    triggerDirectNavigation(urls.nativeUrl)
  } catch {
    window.location.assign(urls.apiUrl)
  }

  return true
}
