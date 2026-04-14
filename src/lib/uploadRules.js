const KB = 1024
const MB = 1024 * 1024

export const UPLOAD_RULES = Object.freeze({
  kycVideos: Object.freeze({
    bucket: "kyc_videos",
    maxBytes: 10 * MB,
    allowedMime: [],
  }),
  brandAssets: Object.freeze({
    bucket: "brand-assets",
    maxBytes: 500 * KB,
    allowedMime: ["image/jpeg", "image/png"],
  }),
  avatars: Object.freeze({
    bucket: "avatars",
    maxBytes: 500 * KB,
    allowedMime: ["image/jpeg", "image/png"],
  }),
  sponsoredProducts: Object.freeze({
    bucket: "sponsored-products",
    maxBytes: 250 * KB,
    allowedMime: [],
  }),
  featuredCityBanners: Object.freeze({
    bucket: "featured-city-banners",
    maxBytes: 2 * MB,
    allowedMime: ["image/jpeg", "image/png", "image/webp"],
  }),
  storefronts: Object.freeze({
    bucket: "storefronts",
    maxBytes: 500 * KB,
    allowedMime: ["image/jpeg", "image/png"],
  }),
  cacDocuments: Object.freeze({
    bucket: "cac-documents",
    maxBytes: 500 * KB,
    allowedMime: [],
  }),
  idDocuments: Object.freeze({
    bucket: "id-documents",
    maxBytes: 500 * KB,
    allowedMime: [],
  }),
  shopBanners: Object.freeze({
    bucket: "shops-banner-storage",
    maxBytes: 200 * KB,
    allowedMime: [],
  }),
  products: Object.freeze({
    bucket: "products",
    maxBytes: 100 * KB,
    allowedMime: [],
  }),
  paymentReceipts: Object.freeze({
    bucket: "payment-receipts",
    maxBytes: 5 * MB,
    allowedMime: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  }),
})

const MIME_LABELS = Object.freeze({
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "application/pdf": "PDF",
})

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B"
  if (bytes >= MB) return `${Math.round((bytes / MB) * 10) / 10}MB`
  if (bytes >= KB) return `${Math.round(bytes / KB)}KB`
  return `${bytes}B`
}

export function getMimeLabelList(allowedMime = []) {
  if (!allowedMime.length) return "Any type"
  return allowedMime.map((item) => MIME_LABELS[item] || item).join("/")
}

export function getRuleLabel(rule) {
  if (!rule) return ""
  return `Max ${formatBytes(rule.maxBytes)} | ${getMimeLabelList(rule.allowedMime)}`
}

export function isMimeAllowed(rule, mime) {
  if (!rule || !Array.isArray(rule.allowedMime) || rule.allowedMime.length === 0) {
    return true
  }
  return rule.allowedMime.includes(mime)
}

export function getAcceptValue(rule, fallback = "image/*") {
  if (!rule || !Array.isArray(rule.allowedMime) || rule.allowedMime.length === 0) {
    return fallback
  }
  return rule.allowedMime.join(",")
}
