const DEFAULT_REMITA_PUBLIC_KEY =
  "QzAwMDAyNzEyNTl8MTEwNjE4Njc3NzR8M2RjY2NlYTg4YzhjNWQzMTc4ZTA1NTZkYmViYzhmOTQzM2I0ZTU2Y2Q5Y2E4OWM1ZGI0MjI1YTUzYTNhZjJhMzk1YjcwZWQ3N2ZhMWQwZWM4M2IwZDMyZDUxZTZhNTBiZjZiYTgxMGI1MGEyZTIwMWQxZDRhZDFhMTU4MjZhNTc="

export const REMITA_PUBLIC_KEY =
  import.meta.env?.VITE_REMITA_PUBLIC_KEY || DEFAULT_REMITA_PUBLIC_KEY

export const REMITA_SCRIPT_URL =
  import.meta.env?.VITE_REMITA_SCRIPT_URL ||
  "https://remitademo.net/payment/v1/remita-pay-inline.bundle.js"

export const CTM_BANK_ACCOUNT = Object.freeze({
  bankName: "United Bank For Africa (UBA)",
  accountName: "CT Merchant LTD",
  accountNumber: "1029794680",
})

export const PHYSICAL_VERIFICATION_FEE = 5000

export const SERVICE_FEE_PLANS = Object.freeze({
  "6_Months": Object.freeze({
    label: "6 Months",
    amount: 6000,
    tier: "Standard Tier",
    hint: "Works out to N1,000 / month",
  }),
  "1_Year": Object.freeze({
    label: "1 Year",
    amount: 10000,
    tier: "Professional Tier",
    hint: "Works out to N833 / month",
  }),
})

export function generateTransactionRef(prefix = "CTM") {
  const safePrefix = String(prefix || "CTM")
    .trim()
    .replace(/[^A-Z0-9_-]/gi, "")
    .toUpperCase()

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    const randomPart = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
    return `${safePrefix}-${Date.now()}-${randomPart}`
  }

  const fallbackRandom = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `${safePrefix}-${Date.now()}-${fallbackRandom}`
}

export function normalizePromoCode(rawCode = "") {
  return String(rawCode).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
}
