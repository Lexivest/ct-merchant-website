const BRAND_PATTERN = /(CTMerchant|CTMERCHANT|CT Merchant)/g
const BRAND_DETECT_PATTERN = /(CTMerchant|CTMERCHANT|CT Merchant)/
const BRAND_EXACT_PATTERN = /^(CTMerchant|CTMERCHANT|CT Merchant)$/

// Inject "bold" weight into an existing CSS font string while preserving
// size and family. Handles: "12px Arial", "normal 14px sans-serif", etc.
function toBoldFont(font) {
  const withoutWeight = font
    .replace(/\b(normal|bold|bolder|lighter|[1-9]00)\b\s*/g, "")
    .trim()
  return `bold ${withoutWeight}`
}

// Measure a token's width using the correct font weight.
function measureTokenWidth(ctx, token, baseFont) {
  if (!token.bold) return ctx.measureText(token.text).width
  ctx.font = toBoldFont(baseFont)
  const w = ctx.measureText(token.text).width
  ctx.font = baseFont
  return w
}

function getTextStartX(ctx, tokens, x, baseFont) {
  const totalWidth = tokens.reduce(
    (sum, token) => sum + measureTokenWidth(ctx, token, baseFont),
    0
  )

  if (ctx.textAlign === "center") return x - totalWidth / 2
  if (ctx.textAlign === "right" || ctx.textAlign === "end") return x - totalWidth
  return x
}

export function drawBrandedCanvasText(ctx, text, x, y, options = {}) {
  const value = String(text || "")
  if (!BRAND_DETECT_PATTERN.test(value)) {
    ctx.fillText(value, x, y)
    return
  }

  const baseColor = options.baseColor || ctx.fillStyle

  // "CTM" is bold; "erchant" and all surrounding text are normal weight.
  const tokens = value
    .split(BRAND_PATTERN)
    .flatMap((part) => {
      if (!part) return []
      if (!BRAND_EXACT_PATTERN.test(part)) return [{ text: part, bold: false }]

      return [
        { text: "CTM", bold: true },
        { text: "erchant", bold: false },
      ]
    })

  ctx.save()
  const baseFont = ctx.font
  const startX = getTextStartX(ctx, tokens, x, baseFont)
  ctx.textAlign = "left"
  ctx.fillStyle = baseColor

  tokens.reduce((cursor, token) => {
    ctx.font = token.bold ? toBoldFont(baseFont) : baseFont
    ctx.fillText(token.text, cursor, y)
    const w = ctx.measureText(token.text).width
    return cursor + w
  }, startX)

  ctx.restore()
}
