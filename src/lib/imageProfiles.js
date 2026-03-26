const MB = 1024 * 1024

export const IMAGE_PROFILES = Object.freeze({
  product: Object.freeze({
    id: "product",
    label: "Product Image",
    aspectRatio: 1,
    targetWidth: 800,
    targetHeight: 800,
    maxInputBytes: 4 * MB,
    outputMimeType: "image/jpeg",
    qualityStart: 0.92,
    qualityFloor: 0.4,
    qualityStep: 0.05,
  }),
  shopBanner: Object.freeze({
    id: "shop_banner",
    label: "Shop Banner",
    aspectRatio: 16 / 9,
    targetWidth: 1280,
    targetHeight: 720,
    maxInputBytes: 4 * MB,
    outputMimeType: "image/jpeg",
    qualityStart: 0.82,
    qualityFloor: 0.2,
    qualityStep: 0.1,
  }),
})
