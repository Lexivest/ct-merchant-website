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
  if (typeof window === "undefined") return false

  const normalizedPhone = normalizeWhatsAppPhone(phone)
  if (!normalizedPhone) return false

  const encodedText = encodeURIComponent(text || "")
  
  // Universal Link - works flawlessly on both Mobile and Desktop
  const waUrl = `https://wa.me/${normalizedPhone}?text=${encodedText}`

  const isMobile = shouldUseDirectWhatsAppHandoff()

  try {
    if (isMobile) {
      // On mobile, direct window location change is the most reliable 
      // way to trigger OS-level App Links without hitting popup blockers.
      window.location.href = waUrl
    } else {
      // On desktop, pop a new tab. 
      const newWindow = window.open(waUrl, "_blank", "noopener,noreferrer")
      
      // If a strict ad-blocker blocks the new tab, gracefully fallback to same-tab navigation
      if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
        window.location.href = waUrl
      }
    }
    return true
  } catch (error) {
    console.error("Failed to open WhatsApp:", error)
    return false
  }
}