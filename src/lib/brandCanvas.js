const BRAND_TOKEN_COLORS = {
  C: "#DB2777",
  T: "#FFD400",
  M: "#2563EB",
}

const BRAND_PATTERN = /(CTMerchant|CTMERCHANT|CT Merchant)/g
const BRAND_DETECT_PATTERN = /(CTMerchant|CTMERCHANT|CT Merchant)/
const BRAND_EXACT_PATTERN = /^(CTMerchant|CTMERCHANT|CT Merchant)$/

function getTextStartX(ctx, tokens, x) {
  const totalWidth = tokens.reduce(
    (sum, token) => sum + ctx.measureText(token.text).width,
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
  const brandColors = {
    C: options.cColor || BRAND_TOKEN_COLORS.C,
    T: options.tColor || BRAND_TOKEN_COLORS.T,
    M: options.mColor || BRAND_TOKEN_COLORS.M,
  }

  const tokens = value
    .split(BRAND_PATTERN)
    .flatMap((part) => {
      if (!part) return []
      if (!BRAND_EXACT_PATTERN.test(part)) return [{ text: part, color: baseColor }]

      return [
        { text: "C", color: brandColors.C },
        { text: "T", color: brandColors.T },
        { text: "M", color: brandColors.M },
        { text: "erchant", color: baseColor },
      ]
    })

  ctx.save()
  const startX = getTextStartX(ctx, tokens, x)
  ctx.textAlign = "left"

  tokens.reduce((cursor, token) => {
    ctx.fillStyle = token.color
    ctx.fillText(token.text, cursor, y)
    return cursor + ctx.measureText(token.text).width
  }, startX)

  ctx.restore()
}
