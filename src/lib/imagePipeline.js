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
