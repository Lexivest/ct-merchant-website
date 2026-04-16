export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file provided."))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read selected file."))
    reader.onload = () => resolve(String(reader.result || ""))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Could not load image source."))
    image.src = src
  })
}

export async function optimizeImageForEditor(
  file,
  {
    maxDimension = 1800,
    mimeType = "image/jpeg",
    quality = 0.9,
  } = {}
) {
  if (!file) throw new Error("No file provided.")

  const sourceUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(sourceUrl)
    const longestEdge = Math.max(image.width || 0, image.height || 0)

    if (!longestEdge) {
      throw new Error("Could not read selected image.")
    }

    const scale = longestEdge > maxDimension ? maxDimension / longestEdge : 1
    const targetWidth = Math.max(1, Math.round(image.width * scale))
    const targetHeight = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not initialize image canvas.")

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

    const optimizedBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality)
    })

    if (!optimizedBlob) {
      throw new Error("Could not prepare selected image.")
    }

    return {
      blob: optimizedBlob,
      src: URL.createObjectURL(optimizedBlob),
      width: targetWidth,
      height: targetHeight,
    }
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

export async function padImageToAspectDataUrl(sourceDataUrl, aspectRatio, fill = "#FFFFFF") {
  if (!sourceDataUrl) throw new Error("Source image is required.")
  if (!aspectRatio || aspectRatio <= 0) throw new Error("Invalid aspect ratio.")

  const image = await loadImage(sourceDataUrl)
  const sourceAspect = image.width / image.height

  let targetWidth = image.width
  let targetHeight = image.height

  if (sourceAspect > aspectRatio) {
    targetHeight = Math.round(image.width / aspectRatio)
  } else if (sourceAspect < aspectRatio) {
    targetWidth = Math.round(image.height * aspectRatio)
  }

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not initialize image canvas.")

  ctx.fillStyle = fill
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  const x = Math.round((targetWidth - image.width) / 2)
  const y = Math.round((targetHeight - image.height) / 2)
  ctx.drawImage(image, x, y)

  return canvas.toDataURL("image/jpeg", 1)
}

export function renderCanvasToTarget(sourceCanvas, options) {
  const {
    targetWidth,
    targetHeight,
    fitMode = "cover",
    background = "#FFFFFF",
    filter = "none",
  } = options || {}

  if (!sourceCanvas) throw new Error("Source canvas is required.")
  if (!targetWidth || !targetHeight) throw new Error("Target dimensions are required.")

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not initialize image canvas.")

  ctx.fillStyle = background
  ctx.fillRect(0, 0, targetWidth, targetHeight)
  ctx.filter = filter

  const sourceWidth = sourceCanvas.width
  const sourceHeight = sourceCanvas.height
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = targetWidth / targetHeight

  const shouldContain = fitMode === "contain"
  const scale = shouldContain
    ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)

  const drawWidth = Math.round(sourceWidth * scale)
  const drawHeight = Math.round(sourceHeight * scale)
  const dx = Math.round((targetWidth - drawWidth) / 2)
  const dy = Math.round((targetHeight - drawHeight) / 2)

  if (!shouldContain && sourceRatio === targetRatio) {
    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)
  } else {
    ctx.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight)
  }

  ctx.filter = "none"
  return canvas
}

export async function autoProcessImage(file, options = {}) {
  const {
    aspectRatio = 1,
    targetWidth = 1200,
    targetHeight = 1200,
    watermark = "CTMerchant",
    fillColor = "#FFFFFF",
    maxBytes = 800 * 1024,
    qualityStart = 0.92,
    qualityFloor = 0.4,
    qualityStep = 0.05,
  } = options

  if (!file) throw new Error("File is required for auto-processing.")

  const src = URL.createObjectURL(file)
  try {
    const image = await loadImage(src)
    
    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not initialize processing canvas.")

    // 1. Background
    ctx.fillStyle = fillColor
    ctx.fillRect(0, 0, targetWidth, targetHeight)

    // 2. Center Contain Logic
    const sourceWidth = image.width
    const sourceHeight = image.height
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    const drawWidth = Math.round(sourceWidth * scale)
    const drawHeight = Math.round(sourceHeight * scale)
    const dx = Math.round((targetWidth - drawWidth) / 2)
    const dy = Math.round((targetHeight - drawHeight) / 2)

    ctx.drawImage(image, dx, dy, drawWidth, drawHeight)

    // 3. Watermark
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)"
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)"
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = "right"
    ctx.textBaseline = "bottom"
    ctx.fillText(watermark, targetWidth - 20, targetHeight - 20)

    // 4. Compress
    const blob = await canvasToBlobWithMaxBytes(canvas, {
      maxBytes,
      qualityStart,
      qualityFloor,
      qualityStep,
    })

    if (!blob) throw new Error("Compression failed.")

    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      originalSize: file.size,
      processedSize: blob.size,
    }
  } finally {
    URL.revokeObjectURL(src)
  }
}

export async function canvasToBlobWithMaxBytes(canvas, options) {
  const {
    maxBytes,
    mimeType = "image/jpeg",
    qualityStart = 0.9,
    qualityFloor = 0.4,
    qualityStep = 0.05,
  } = options || {}

  if (!canvas) throw new Error("Canvas is required.")
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("maxBytes is required.")

  let quality = qualityStart

  const makeBlob = (q) =>
    new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), mimeType, q)
    })

  while (quality >= qualityFloor) {
    const blob = await makeBlob(quality)
    if (blob && blob.size <= maxBytes) return blob
    quality -= qualityStep
  }

  const floorBlob = await makeBlob(qualityFloor)
  return floorBlob && floorBlob.size <= maxBytes ? floorBlob : null
}
