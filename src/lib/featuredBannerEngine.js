import { canvasToBlobWithMaxBytes } from "./imagePipeline"
import { UPLOAD_RULES } from "./uploadRules"

export const FEATURED_BANNER_BACKGROUNDS = [
  {
    key: "lagoon-blue",
    label: "Lagoon Blue",
    bg: "from-[#043C83] via-[#0969B9] to-[#20B7E8]",
    stops: ["#043C83", "#0969B9", "#20B7E8"],
    texture: "radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.38),transparent_22%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,0.3),transparent_20%),linear-gradient(135deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_18px)",
  },
  {
    key: "sunset-coral",
    label: "Sunset Coral",
    bg: "from-[#7C2D12] via-[#EA580C] to-[#F9A8D4]",
    stops: ["#7C2D12", "#EA580C", "#F9A8D4"],
    texture: "radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.42),transparent_20%),radial-gradient(circle_at_78%_28%,rgba(254,240,138,0.34),transparent_24%),linear-gradient(45deg,rgba(255,255,255,0.12)_0_2px,transparent_2px_20px)",
  },
  {
    key: "emerald-market",
    label: "Emerald Market",
    bg: "from-[#064E3B] via-[#059669] to-[#A7F3D0]",
    stops: ["#064E3B", "#059669", "#A7F3D0"],
    texture: "radial-gradient(circle_at_12%_74%,rgba(255,255,255,0.34),transparent_22%),radial-gradient(circle_at_86%_18%,rgba(190,242,100,0.38),transparent_18%),linear-gradient(120deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_16px)",
  },
  {
    key: "royal-night",
    label: "Royal Night",
    bg: "from-[#111827] via-[#312E81] to-[#DB2777]",
    stops: ["#111827", "#312E81", "#DB2777"],
    texture: "radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.22),transparent_18%),radial-gradient(circle_at_78%_70%,rgba(244,114,182,0.42),transparent_24%),linear-gradient(150deg,rgba(255,255,255,0.1)_0_1px,transparent_1px_22px)",
  },
  {
    key: "golden-commerce",
    label: "Golden Commerce",
    bg: "from-[#78350F] via-[#D97706] to-[#FDE68A]",
    stops: ["#78350F", "#D97706", "#FDE68A"],
    texture: "radial-gradient(circle_at_20%_24%,rgba(255,255,255,0.45),transparent_18%),radial-gradient(circle_at_88%_16%,rgba(251,113,133,0.3),transparent_22%),linear-gradient(135deg,rgba(255,255,255,0.16)_0_1px,transparent_1px_14px)",
  },
  {
    key: "berry-silk",
    label: "Berry Silk",
    bg: "from-[#831843] via-[#DB2777] to-[#FBCFE8]",
    stops: ["#831843", "#DB2777", "#FBCFE8"],
    texture: "radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.34),transparent_22%),radial-gradient(circle_at_80%_75%,rgba(147,197,253,0.3),transparent_24%),linear-gradient(60deg,rgba(255,255,255,0.16)_0_1px,transparent_1px_18px)",
  },
  {
    key: "indigo-grid",
    label: "Indigo Grid",
    bg: "from-[#1E1B4B] via-[#3730A3] to-[#60A5FA]",
    stops: ["#1E1B4B", "#3730A3", "#60A5FA"],
    texture: "linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),radial-gradient(circle_at_80%_20%,rgba(236,72,153,0.3),transparent_20%)",
  },
  {
    key: "clean-sky",
    label: "Clean Sky",
    bg: "from-[#0F766E] via-[#22D3EE] to-[#EFF6FF]",
    stops: ["#0F766E", "#22D3EE", "#EFF6FF"],
    texture: "radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.48),transparent_20%),radial-gradient(circle_at_78%_68%,rgba(14,165,233,0.28),transparent_26%),linear-gradient(140deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_20px)",
  },
]

export function getFeaturedBannerBackground(key) {
  return FEATURED_BANNER_BACKGROUNDS.find((item) => item.key === key) || FEATURED_BANNER_BACKGROUNDS[0]
}

export function getProfileDisplayName(profile) {
  return profile?.full_name || profile?.name || profile?.username || ""
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function wrapText(value, maxChars, maxLines) {
  const words = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)

  if (!words.length) return []

  const lines = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars || !current) {
      current = next
    } else {
      lines.push(current)
      current = word
    }

    if (lines.length === maxLines) break
  }

  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length > maxLines) lines.length = maxLines

  const lastIndex = lines.length - 1
  if (lastIndex >= 0 && words.join(" ").length > lines.join(" ").length) {
    lines[lastIndex] = `${lines[lastIndex].replace(/[.\s]+$/, "")}...`
  }

  return lines
}

function svgTextLines({ lines, x, y, fontSize, lineHeight, weight = 800, fill = "#FFFFFF", opacity = 1, anchor = "middle" }) {
  return lines
    .map((line, index) => (
      `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-family="Verdana, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${escapeXml(line)}</text>`
    ))
    .join("")
}

export function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read image data."))
    reader.onload = () => resolve(String(reader.result || ""))
    reader.readAsDataURL(blob)
  })
}

export async function imageUrlToDataUrl(url) {
  if (!url) return ""
  try {
    const response = await fetch(url, { cache: "force-cache", mode: "cors" })
    if (!response.ok) throw new Error("Image fetch failed.")
    return await blobToDataUrl(await response.blob())
  } catch {
    return ""
  }
}

export function buildFeaturedBannerSvg({ shop, products, backgroundKey, proprietorName, width = 1600, height = 600 }) {
  const background = getFeaturedBannerBackground(backgroundKey)
  const [start, middle, end] = background.stops || FEATURED_BANNER_BACKGROUNDS[0].stops
  const isMobile = height > width * 0.45
  const titleLines = wrapText(shop?.name || "Featured Shop", isMobile ? 24 : 34, 2)
  const addressLines = wrapText(
    shop?.address || shop?.category || "Visit this shop for available products and services.",
    isMobile ? 48 : 80,
    2
  )
  const titleFont = isMobile ? 50 : 58
  const addressFont = isMobile ? 28 : 32
  const titleStartY = isMobile ? 92 : 82
  const addressStartY = titleStartY + titleLines.length * (isMobile ? 58 : 64) + 12
  const tileY = isMobile ? 315 : 225
  const tileWidth = isMobile ? 190 : 258
  const tileHeight = isMobile ? 260 : 285
  const gap = isMobile ? 22 : 28
  const totalTileWidth = tileWidth * 5 + gap * 4
  const tileStartX = (width - totalTileWidth) / 2
  const safeProducts = Array.from({ length: 5 }, (_, index) => products?.[index] || null)
  const shopLogo = shop?.svgLogoUrl || shop?.image_url || ""
  const logoSize = isMobile ? 88 : 92
  const logoX = isMobile ? 42 : 48
  const logoY = isMobile ? 36 : 34
  const proprietorText = proprietorName ? `Proprietor: ${proprietorName}` : ""
  const proprietorLines = wrapText(proprietorText, isMobile ? 42 : 74, 1)
  const proprietorY = isMobile ? 650 : 560

  const productMarkup = safeProducts
    .map((product, index) => {
      const x = tileStartX + index * (tileWidth + gap)
      const y = tileY
      const image = product?.svgImageUrl || product?.image_url || ""
      const centerX = x + tileWidth / 2
      const centerY = y + tileHeight / 2

      return `
        <g>
          <clipPath id="productClip${index}">
            <rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="30"/>
          </clipPath>
          ${
            image
              ? `<image href="${escapeXml(image)}" x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#productClip${index})"/>`
              : `<rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="30" fill="#FFFFFF" opacity="0.14"/><text x="${centerX}" y="${centerY + 12}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="54" fill="#FFFFFF" opacity="0.7">+</text>`
          }
          <rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="30" fill="none" stroke="#FFFFFF" stroke-opacity="0.42" stroke-width="3"/>
        </g>
      `
    })
    .join("")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${start}"/>
      <stop offset="54%" stop-color="${middle}"/>
      <stop offset="100%" stop-color="${end}"/>
    </linearGradient>
    <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
      <path d="M 42 0 L 0 0 0 42" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
    </pattern>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#0F172A" flood-opacity="0.24"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#grid)" opacity="0.55"/>
  <circle cx="${width * 0.14}" cy="${height * 0.1}" r="${width * 0.14}" fill="#FFFFFF" opacity="0.18"/>
  <circle cx="${width * 0.83}" cy="${height * 0.12}" r="${width * 0.11}" fill="#F472B6" opacity="0.26"/>
  <circle cx="${width * 0.88}" cy="${height * 0.9}" r="${width * 0.15}" fill="#FFFFFF" opacity="0.14"/>
  <rect width="${width}" height="${height}" fill="#000000" opacity="0.08"/>
  <g filter="url(#softShadow)">
    <clipPath id="shopLogoClip">
      <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="24"/>
    </clipPath>
    ${
      shopLogo
        ? `<image href="${escapeXml(shopLogo)}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shopLogoClip)"/>`
        : `<rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="24" fill="#FFFFFF" opacity="0.16"/>`
    }
    <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="24" fill="none" stroke="#FFFFFF" stroke-opacity="0.48" stroke-width="3"/>
  </g>
  <g filter="url(#softShadow)">
    ${svgTextLines({ lines: titleLines, x: width / 2, y: titleStartY, fontSize: titleFont, lineHeight: isMobile ? 58 : 64, weight: 900 })}
    ${svgTextLines({ lines: addressLines, x: width / 2, y: addressStartY, fontSize: addressFont, lineHeight: isMobile ? 34 : 38, weight: 700, fill: "#FFFFFF", opacity: 0.88 })}
  </g>
  <g filter="url(#softShadow)">
    ${productMarkup}
  </g>
  ${
    proprietorLines.length
      ? `<g filter="url(#softShadow)">${svgTextLines({ lines: proprietorLines, x: width / 2, y: proprietorY, fontSize: isMobile ? 28 : 30, lineHeight: 34, weight: 800, fill: "#FFFFFF", opacity: 0.9 })}</g>`
      : ""
  }
</svg>`
}

export async function buildStandaloneFeaturedBannerSvg({ shop, products, backgroundKey, proprietorName, width, height }) {
  const [logoDataUrl, embeddedProducts] = await Promise.all([
    imageUrlToDataUrl(shop?.image_url),
    Promise.all(
      (products || []).slice(0, 5).map(async (product) => ({
        ...product,
        svgImageUrl: await imageUrlToDataUrl(product.image_url),
      }))
    ),
  ])

  return buildFeaturedBannerSvg({
    shop: { ...shop, svgLogoUrl: logoDataUrl },
    products: embeddedProducts,
    backgroundKey,
    proprietorName,
    width,
    height,
  })
}

export async function svgToJpegBlob(svg, width, height, options = {}) {
  const image = new Image()
  image.decoding = "async"
  const dataUrl = svgToDataUrl(svg)

  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error("Could not render generated banner."))
    image.src = dataUrl
  })

  if (typeof image.decode === "function") {
    try {
      await image.decode()
    } catch {
      // The load event already confirmed the SVG is renderable.
    }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")
  if (!context) throw new Error("Could not prepare generated banner.")

  context.fillStyle = "#FFFFFF"
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const blob = await canvasToBlobWithMaxBytes(canvas, {
    maxBytes: options.maxBytes || UPLOAD_RULES.featuredCityBanners.maxBytes,
    mimeType: "image/jpeg",
    qualityStart: options.qualityStart || 0.92,
    qualityFloor: options.qualityFloor || 0.55,
    qualityStep: options.qualityStep || 0.06,
  })

  if (!blob) {
    throw new Error("Generated banner is too large. Use fewer or smaller product images.")
  }

  return blob
}
