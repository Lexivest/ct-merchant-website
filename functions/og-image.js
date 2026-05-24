/**
 * Cloudflare Pages Function — /og-image?id=SHOP_ID
 *
 * Generates a 1200×630 PNG product-grid image for use as og:image.
 * Shows up to 6 products (image + name + price) in a branded grid.
 * Falls back to the shop logo, then the CTM logo, if no product images exist.
 *
 * Env vars required (already set in your Cloudflare Pages project):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */

import { Resvg, initWasm } from "@resvg/resvg-wasm"

// Module-level flag — WASM is initialised only once per Worker isolate.
let wasmReady = false

async function ensureWasm() {
  if (wasmReady) return
  // Fetch the WASM binary from jsDelivr CDN (no bundling required).
  await initWasm(
    fetch("https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm")
  )
  wasmReady = true
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const shopId = url.searchParams.get("id")

  if (!shopId) return new Response("Missing id", { status: 400 })

  const SUPABASE_URL = env.VITE_SUPABASE_URL
  const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) return fallbackRedirect()

  try {
    // ── 1. Fetch shop + products in parallel ────────────────────────────────
    const [shopRes, productsRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/shops?id=eq.${encodeURIComponent(shopId)}&select=name,image_url&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/products` +
          `?shop_id=eq.${encodeURIComponent(shopId)}` +
          `&is_available=eq.true&is_approved=eq.true` +
          `&select=name,price,discount_price,image_url` +
          `&order=created_at.desc&limit=6`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      ),
    ])

    const [shops, products] = await Promise.all([shopRes.json(), productsRes.json()])
    const shop = shops?.[0]

    if (!shop) return fallbackRedirect()

    // Products that actually have an image URL
    const withImages = (products || []).filter((p) => p.image_url).slice(0, 6)

    // ── 2. If no product images at all, fall back to shop logo ───────────────
    if (withImages.length === 0) {
      return fallbackRedirect(shop.image_url)
    }

    // ── 3. Fetch product images as base64 data-URIs ──────────────────────────
    const loaded = await Promise.all(
      withImages.map(async (p) => {
        try {
          const res = await fetch(p.image_url)
          if (!res.ok) return null
          const buf = await res.arrayBuffer()
          const mime = res.headers.get("content-type") || "image/jpeg"
          const b64 = arrayBufferToBase64(buf)
          return { ...p, dataUri: `data:${mime};base64,${b64}` }
        } catch {
          return null
        }
      })
    )

    const usable = loaded.filter(Boolean)
    if (usable.length === 0) return fallbackRedirect(shop.image_url)

    // ── 4. Build SVG ─────────────────────────────────────────────────────────
    const svg = buildSvg(shop.name, usable)

    // ── 5. Render SVG → PNG via resvg-wasm ───────────────────────────────────
    await ensureWasm()
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } })
    const rendered = resvg.render()
    const png = rendered.asPng()

    return new Response(png, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    })
  } catch (err) {
    console.error("[og-image]", err)
    return fallbackRedirect()
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fallbackRedirect(logoUrl) {
  const dest = logoUrl || "https://www.ctmerchant.com.ng/ctm-logo.jpg"
  return Response.redirect(dest, 302)
}

/** Convert ArrayBuffer → base64 string in chunks to avoid call-stack limits. */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fmtPrice(price, discount) {
  const val = discount && discount < price ? discount : price
  if (!val) return ""
  return `₦${Number(val).toLocaleString()}`
}

function truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + "…" : str || ""
}

// ── SVG builder ───────────────────────────────────────────────────────────────

function buildSvg(shopName, products) {
  const W = 1200
  const H = 630
  const HEADER = 72
  const FOOTER = 38
  const GRID_H = H - HEADER - FOOTER

  const count = products.length
  // Layout: up to 3 columns, up to 2 rows
  const cols = count <= 2 ? count : 3
  const rows = Math.ceil(count / cols)

  const cellW = Math.floor(W / cols)
  const cellH = Math.floor(GRID_H / rows)
  // Square product image, leaving room for two text lines below
  const imgSize = Math.min(cellW - 16, cellH - 52)
  const imgPadX = Math.floor((cellW - imgSize) / 2)

  // ── Product cells ──
  let cells = ""
  products.forEach((p, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * cellW
    const y = HEADER + row * cellH

    const priceStr = fmtPrice(p.price, p.discount_price)
    const hasDiscount = p.discount_price && p.discount_price < p.price
    const priceColor = hasDiscount ? "#F9A8D4" : "#4ADE80"

    cells += `
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="#171F2E"/>
      <image
        href="${p.dataUri}"
        x="${x + imgPadX}" y="${y + 8}"
        width="${imgSize}" height="${imgSize}"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#cell${i}clip)"
      />
      <clipPath id="cell${i}clip">
        <rect x="${x + imgPadX}" y="${y + 8}" width="${imgSize}" height="${imgSize}" rx="6"/>
      </clipPath>
      ${
        hasDiscount
          ? `<rect x="${x + imgPadX + imgSize - 52}" y="${y + 10}" width="48" height="20" rx="4" fill="#db2777"/>
             <text x="${x + imgPadX + imgSize - 28}" y="${y + 24}" text-anchor="middle" font-size="11" fill="white" font-weight="bold" font-family="Arial,sans-serif">SALE</text>`
          : ""
      }
      <text
        x="${x + cellW / 2}" y="${y + 8 + imgSize + 18}"
        text-anchor="middle" font-size="13" fill="#CBD5E1"
        font-family="Arial,sans-serif" font-weight="600">
        ${esc(truncate(p.name, 20))}
      </text>
      ${
        priceStr
          ? `<text
               x="${x + cellW / 2}" y="${y + 8 + imgSize + 38}"
               text-anchor="middle" font-size="15" fill="${priceColor}"
               font-family="Arial,sans-serif" font-weight="bold">
               ${esc(priceStr)}
             </text>`
          : ""
      }
    `
  })

  // ── Separator lines between cells ──
  let lines = ""
  for (let c = 1; c < cols; c++) {
    lines += `<line x1="${c * cellW}" y1="${HEADER}" x2="${c * cellW}" y2="${H - FOOTER}" stroke="#2D3748" stroke-width="1.5"/>`
  }
  for (let r = 1; r < rows; r++) {
    lines += `<line x1="0" y1="${HEADER + r * cellH}" x2="${W}" y2="${HEADER + r * cellH}" stroke="#2D3748" stroke-width="1.5"/>`
  }

  const displayName = truncate(shopName, 45)

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#131921"/>
      <stop offset="55%"  stop-color="#1B2537"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#0D1117"/>
      <stop offset="100%" stop-color="#131921"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#131921"/>

  <!-- Product grid -->
  ${cells}
  ${lines}

  <!-- Header bar -->
  <rect width="${W}" height="${HEADER}" fill="url(#hg)"/>
  <!-- Pink accent line at header bottom -->
  <rect y="${HEADER - 2}" width="${W}" height="2" fill="#db2777"/>

  <!-- Shop name -->
  <text x="22" y="46"
    font-size="26" fill="white" font-weight="bold"
    font-family="Arial,sans-serif">${esc(displayName)}</text>

  <!-- CTMerchant badge (top right) -->
  <rect x="${W - 150}" y="14" width="136" height="44" rx="8" fill="rgba(219,39,119,0.18)"/>
  <text x="${W - 82}" y="34"
    text-anchor="middle" font-size="13" fill="#F9A8D4"
    font-weight="bold" font-family="Arial,sans-serif">CTMerchant</text>
  <text x="${W - 82}" y="50"
    text-anchor="middle" font-size="10" fill="#94A3B8"
    font-family="Arial,sans-serif">Verified Store ✓</text>

  <!-- Footer bar -->
  <rect y="${H - FOOTER}" width="${W}" height="${FOOTER}" fill="url(#fg)"/>
  <rect y="${H - FOOTER}" width="${W}" height="1" fill="#2D3748"/>
  <text x="${W / 2}" y="${H - 12}"
    text-anchor="middle" font-size="12" fill="#475569"
    font-family="Arial,sans-serif">www.ctmerchant.com.ng</text>
</svg>`
}
