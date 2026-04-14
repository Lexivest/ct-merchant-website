import { FEATURED_BANNER_BACKGROUNDS } from "./featuredBannerEngine"

export const PROMO_LAYOUTS = [
  { key: "split", label: "Elegant Split" },
  { key: "grid", label: "Modern Grid" },
  { key: "focus", label: "Glass Focus" },
]

export const PROMO_EXTENDED_COLORS = [
  ...FEATURED_BANNER_BACKGROUNDS,
  {
    key: "neon-power",
    label: "Neon Power",
    bg: "from-[#000000] via-[#1A1A1A] to-[#00FF66]",
    stops: ["#000000", "#1A1A1A", "#00FF66"],
    texture: "radial-gradient(circle_at_20%_20%,rgba(0,255,102,0.2),transparent_40%),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)",
  },
  {
    key: "midnight-rose",
    label: "Midnight Rose",
    bg: "from-[#0F172A] via-[#1E293B] to-[#E11D48]",
    stops: ["#0F172A", "#1E293B", "#E11D48"],
    texture: "radial-gradient(circle_at_80%_20%,rgba(225,29,72,0.3),transparent_40%),linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%)",
  },
]

export function getPromoBackground(key) {
  return PROMO_EXTENDED_COLORS.find((item) => item.key === key) || PROMO_EXTENDED_COLORS[0]
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
  const words = String(value || "").split(" ").filter(Boolean)
  if (!words.length) return []
  const lines = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) current = next
    else { lines.push(current); current = word }
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && current) lines.push(current)
  return lines
}

export function buildPromoBannerSvg({ 
  title, 
  subtitle, 
  backgroundKey = "lagoon-blue", 
  layout = "split",
  products = [], // Expecting array of { image_url }
  isHotDeal = false 
}) {
  const background = getPromoBackground(backgroundKey)
  const [start, middle, end] = background.stops
  
  const width = 1200
  const height = 450
  
  const displayTitle = isHotDeal ? `HOT DEAL: ${title}` : title
  const titleLines = wrapText(displayTitle, 28, 2)
  const subtitleLines = wrapText(subtitle || "", 40, 2)
  
  const productImages = (products || []).slice(0, 3)

  let contentMarkup = ""

  if (layout === "split") {
    // Left: Text, Right: Products
    contentMarkup = `
      <g transform="translate(60, 140)">
        ${titleLines.map((line, i) => `<text y="${i * 60}" font-family="system-ui, sans-serif" font-size="54" font-weight="900" fill="#FFFFFF">${escapeXml(line)}</text>`).join("")}
        ${subtitleLines.map((line, i) => `<text y="${(titleLines.length * 60) + 10 + (i * 30)}" font-family="system-ui, sans-serif" font-size="24" font-weight="600" fill="#FFFFFF" opacity="0.8">${escapeXml(line)}</text>`).join("")}
      </g>
      <g transform="translate(650, 60)">
        ${productImages.map((p, i) => `
          <rect x="${i * 160}" y="${i % 2 === 0 ? 0 : 60}" width="280" height="330" rx="30" fill="#FFFFFF" opacity="0.1" />
          <clipPath id="cp${i}"><rect x="${i * 160}" y="${i % 2 === 0 ? 0 : 60}" width="280" height="330" rx="30" /></clipPath>
          ${p.image_url ? `<image href="${escapeXml(p.image_url)}" x="${i * 160}" y="${i % 2 === 0 ? 0 : 60}" width="280" height="330" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp${i})" />` : ""}
          <rect x="${i * 160}" y="${i % 2 === 0 ? 0 : 60}" width="280" height="330" rx="30" fill="none" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="2" />
        `).join("")}
      </g>
    `
  } else if (layout === "grid") {
    // Top: Text, Bottom: Grid of products
    contentMarkup = `
      <g transform="translate(0, 80)">
        <text x="600" text-anchor="middle" font-family="system-ui, sans-serif" font-size="48" font-weight="900" fill="#FFFFFF">${escapeXml(displayTitle)}</text>
        <text x="600" y="45" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#FFFFFF" opacity="0.7">${escapeXml(subtitle)}</text>
      </g>
      <g transform="translate(180, 180)">
        ${productImages.map((p, i) => `
          <rect x="${i * 300}" width="240" height="200" rx="24" fill="#FFFFFF" opacity="0.1" />
          <clipPath id="cp_g${i}"><rect x="${i * 300}" width="240" height="200" rx="24" /></clipPath>
          ${p.image_url ? `<image href="${escapeXml(p.image_url)}" x="${i * 300}" width="240" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp_g${i})" />` : ""}
        `).join("")}
      </g>
    `
  } else {
    // Focus: Center glass box with text, blurred products behind
    contentMarkup = `
      <g opacity="0.4">
        ${productImages.map((p, i) => `<image href="${escapeXml(p.image_url)}" x="${i * 400}" y="0" width="400" height="450" preserveAspectRatio="xMidYMid slice" />`).join("")}
      </g>
      <rect x="300" y="100" width="600" height="250" rx="40" fill="rgba(0,0,0,0.5)" backdrop-filter="blur(20px)" />
      <g transform="translate(600, 200)" text-anchor="middle">
        <text font-family="system-ui, sans-serif" font-size="58" font-weight="900" fill="#FFFFFF">${escapeXml(displayTitle)}</text>
        <text y="50" font-family="system-ui, sans-serif" font-size="24" font-weight="600" fill="#FFFFFF" opacity="0.8">${escapeXml(subtitle)}</text>
      </g>
    `
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${start}"/>
      <stop offset="50%" stop-color="${middle}"/>
      <stop offset="100%" stop-color="${end}"/>
    </linearGradient>
    <pattern id="tex" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="#FFFFFF" opacity="0.15"/>
    </pattern>
    <filter id="sha" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" rx="40" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" rx="40" fill="url(#tex)"/>
  <g filter="url(#sha)">${contentMarkup}</g>
  <rect x="40" y="360" width="180" height="50" rx="15" fill="#FFFFFF" />
  <text x="130" y="392" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="900" fill="${middle}">CLAIM NOW</text>
</svg>`
}

export function promoSvgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
