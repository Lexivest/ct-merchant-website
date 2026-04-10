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

export function openWhatsAppConversation(phone, text) {
  if (typeof window === "undefined" || typeof document === "undefined") return false

  const normalizedPhone = normalizeWhatsAppPhone(phone)
  if (!normalizedPhone) return false

  const encodedText = encodeURIComponent(text || "")
  const nativeUrl = `whatsapp://send?phone=${normalizedPhone}&text=${encodedText}`
  const apiUrl = `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodedText}`
  const waUrl = `https://wa.me/${normalizedPhone}?text=${encodedText}`
  const isMobile = shouldUseDirectWhatsAppHandoff()

  const cleanupHandlers = []
  const cleanup = () => {
    cleanupHandlers.splice(0).forEach((fn) => fn())
  }

  const addCleanup = (fn) => {
    cleanupHandlers.push(fn)
  }

  try {
    if (isMobile) {
      const clearNativeFallback = window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.replace(apiUrl)
        }
      }, 700)
      const clearWebFallback = window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.replace(waUrl)
        }
      }, 1500)

      addCleanup(() => window.clearTimeout(clearNativeFallback))
      addCleanup(() => window.clearTimeout(clearWebFallback))

      const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          cleanup()
        }
      }

      document.addEventListener("visibilitychange", handleVisibilityChange)
      window.addEventListener("pagehide", cleanup, { once: true })
      window.addEventListener("blur", cleanup, { once: true })

      addCleanup(() => document.removeEventListener("visibilitychange", handleVisibilityChange))
      addCleanup(() => window.removeEventListener("pagehide", cleanup))
      addCleanup(() => window.removeEventListener("blur", cleanup))

      window.location.assign(nativeUrl)
    } else {
      const newWindow = window.open(waUrl, "_blank", "noopener,noreferrer")
      if (newWindow === null) {
        window.location.assign(waUrl)
      }
    }
    return true
  } catch (error) {
    cleanup()
    console.error("Failed to open WhatsApp:", error)
    return false
  }
}
