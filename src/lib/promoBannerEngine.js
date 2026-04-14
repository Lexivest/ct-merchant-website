import { FEATURED_BANNER_BACKGROUNDS } from "./featuredBannerEngine"

export function getPromoBannerBackground(key) {
  return FEATURED_BANNER_BACKGROUNDS.find((item) => item.key === key) || FEATURED_BANNER_BACKGROUNDS[0]
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

  return lines
}

function svgTextLines({ lines, x, y, fontSize, lineHeight, weight = 900, fill = "#FFFFFF", opacity = 1, anchor = "start" }) {
  return lines
    .map((line, index) => (
      `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${escapeXml(line)}</text>`
    ))
    .join("")
}

export function buildPromoBannerSvg({ 
  title, 
  subtitle, 
  backgroundKey = "lagoon-blue", 
  isHotDeal = false 
}) {
  const background = getPromoBannerBackground(backgroundKey)
  const [start, middle, end] = background.stops
  
  // A wider, thinner banner for the market screen
  const width = 1200
  const height = 160
  
  const displayTitle = isHotDeal ? `HOT DEAL: ${title}` : title
  const titleLines = wrapText(displayTitle, 45, 1)
  const subtitleLines = wrapText(subtitle || "", 60, 1)
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${start}"/>
      <stop offset="50%" stop-color="${middle}"/>
      <stop offset="100%" stop-color="${end}"/>
    </linearGradient>
    <pattern id="texture" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="#FFFFFF" opacity="0.1"/>
    </pattern>
  </defs>
  
  <rect width="${width}" height="${height}" rx="24" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" rx="24" fill="url(#texture)"/>
  
  <!-- Decorative shapes -->
  <circle cx="1150" cy="30" r="80" fill="#FFFFFF" opacity="0.1"/>
  <circle cx="50" cy="130" r="60" fill="#FFFFFF" opacity="0.05"/>

  <g transform="translate(40, 0)">
    ${svgTextLines({ 
      lines: titleLines, 
      x: 0, 
      y: 65, 
      fontSize: 38, 
      lineHeight: 45 
    })}
    ${svgTextLines({ 
      lines: subtitleLines, 
      x: 0, 
      y: 110, 
      fontSize: 18, 
      lineHeight: 24, 
      weight: 600, 
      opacity: 0.8 
    })}
  </g>
  
  <!-- "Ticket" icon decoration -->
  <g transform="translate(1080, 45) scale(2.5)" fill="#FFFFFF" opacity="0.2">
    <path d="M1.5 3A1.5 1.5 0 0 0 0 4.5V6a.75.75 0 0 0 .75.75 1.5 1.5 0 1 1 0 3 .75.75 0 0 0-.75.75v1.5A1.5 1.5 0 0 0 1.5 13.5h13a1.5 1.5 0 0 0 1.5-1.5V10.5a.75.75 0 0 0-.75-.75 1.5 1.5 0 1 1 0-3A.75.75 0 0 0 16 6V4.5A1.5 1.5 0 0 0 14.5 3h-13Z" />
  </g>
</svg>`
}

export function promoSvgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
