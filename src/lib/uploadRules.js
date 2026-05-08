const KB = 1024
const MB = 1024 * 1024

export const UPLOAD_RULES = Object.freeze({
  kycVideos: Object.freeze({
    bucket: "kyc-videos",
    maxBytes: 10 * MB,
    allowedMime: ["video/mp4", "video/webm"],
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
    maxBytes: 1 * MB,
    allowedMime: ["image/jpeg", "image/png", "image/webp"],
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
    allowedMime: ["image/jpeg", "image/png", "application/pdf"],
  }),
  idDocuments: Object.freeze({
    bucket: "id-documents",
    maxBytes: 500 * KB,
    allowedMime: ["image/jpeg", "image/png", "application/pdf"],
  }),
  shopBanners: Object.freeze({
    bucket: "shops-banner-storage",
    maxBytes: 200 * KB,
    allowedMime: ["image/jpeg", "image/png"],
  }),
  products: Object.freeze({
    bucket: "products",
    maxBytes: 100 * KB,
    allowedMime: ["image/jpeg", "image/png", "image/webp"],
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

export function sanitizeStoragePathSegment(value, fallback = "upload") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")

  return cleaned || fallback
}

export function buildOwnedShopStoragePath({
  userId,
  shopId,
  folder = "",
  fileName = "upload.jpg",
}) {
  const safeUserId = sanitizeStoragePathSegment(userId, "")
  const safeShopId = String(shopId || "").trim().replace(/[^0-9]/g, "")

  if (!safeUserId) throw new Error("User session is unavailable for this upload.")
  if (!safeShopId) throw new Error("Shop ID is missing for this upload.")

  const parts = [safeUserId, safeShopId]
  const safeFolder = sanitizeStoragePathSegment(folder, "")
  if (safeFolder) parts.push(safeFolder)
  parts.push(sanitizeStoragePathSegment(fileName, "upload.jpg"))

  return parts.join("/")
}

export function storagePathFromUrl(value, bucketId) {
  const raw = String(value || "").trim()
  if (!raw) return ""

  const clean = raw.split("?")[0]
  if (!/^https?:\/\//i.test(clean)) return clean.replace(/^\/+/, "")

  const prefixes = [
    `/storage/v1/object/public/${bucketId}/`,
    `/storage/v1/object/authenticated/${bucketId}/`,
    `/storage/v1/object/sign/${bucketId}/`,
  ]

  const prefix = prefixes.find((item) => clean.includes(item))
  if (!prefix) return ""

  return clean.slice(clean.indexOf(prefix) + prefix.length)
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
