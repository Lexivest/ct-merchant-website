/**
 * Supabase Edge Function — /og-image?id=SHOP_ID
 *
 * Generates a 1200×630 PNG product-grid image used as the og:image
 * when merchants share their shop link on WhatsApp / social media.
 *
 * Shows up to 6 products (image + name + price/discount badge).
 * Falls back to shop logo → CTM logo if no product images exist.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

let wasmReady = false
async function ensureWasm() {
  if (wasmReady) return
  await initWasm(
    fetch("https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm")
  )
  wasmReady = true
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const url = new URL(req.url)
  const shopId = url.searchParams.get("id")
  if (!shopId) return new Response("Missing id", { status: 400, headers: CORS })

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  const admin = createClient(supabaseUrl, supabaseKey)

  try {
    // ── 1. Fetch shop + products in parallel ──────────────────────────────
    const [shopRes, prodRes] = await Promise.all([
      admin
        .from("shops")
        .select("name, image_url")
        .eq("id", shopId)
        .single(),
      admin
        .from("products")
        .select("name, price, discount_price, image_url")
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(6),
    ])

    const shop = shopRes.data
    if (!shop) return fallback()

    const withImages = (prodRes.data ?? []).filter((p: any) => p.image_url).slice(0, 6)

    // ── 2. No product images → redirect to shop logo / CTM logo ──────────
    if (withImages.length === 0) {
      return fallback(shop.image_url)
    }

    // ── 3. Fetch each product image as base64 data-URI ────────────────────
    const loaded = await Promise.all(
      withImages.map(async (p: any) => {
        try {
          const r = await fetch(p.image_url)
          if (!r.ok) return null
          const buf = await r.arrayBuffer()
          const mime = r.headers.get("content-type") || "image/jpeg"
          const b64 = bufToBase64(buf)
          return { ...p, dataUri: `data:${mime};base64,${b64}` }
        } catch {
          return null
        }
      })
    )

    const usable = loaded.filter(Boolean)
    if (usable.length === 0) return fallback(shop.image_url)

    // ── 4. Build SVG + render to PNG ──────────────────────────────────────
    const svg = buildSvg(shop.name, usable)
    await ensureWasm()
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } })
    const png = resvg.render().asPng()

    return new Response(png, {
      headers: {
        ...CORS,
        "content-type": "image/png",
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    })
  } catch (err) {
    console.error("[og-image]", err)
    return fallback()
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function fallback(logoUrl?: string) {
  const dest = logoUrl || "https://www.ctmerchant.com.ng/ctm-logo.jpg"
  return Response.redirect(dest, 302)
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ""
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fmtPrice(price: number, discount: number) {
  const val = discount && discount < price ? discount : price
  return val ? `₦${Number(val).toLocaleString()}` : ""
}

function trunc(s: string, max: number) {
  return s && s.length > max ? s.slice(0, max) + "…" : s || ""
}

// ── SVG layout ────────────────────────────────────────────────────────────────

function buildSvg(shopName: string, products: any[]) {
  const W = 1200, H = 630
  const HEADER = 72, FOOTER = 38
  const GRID_H = H - HEADER - FOOTER

  const count = products.length
  const cols  = count <= 2 ? count : 3
  const rows  = Math.ceil(count / cols)

  const cellW  = Math.floor(W / cols)
  const cellH  = Math.floor(GRID_H / rows)
  const imgSz  = Math.min(cellW - 16, cellH - 52)
  const imgPad = Math.floor((cellW - imgSz) / 2)

  // ── Cells ──
  let cells = ""
  products.forEach((p: any, i: number) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x   = col * cellW
    const y   = HEADER + row * cellH

    const priceStr   = fmtPrice(p.price, p.discount_price)
    const hasDiscount = p.discount_price && p.discount_price < p.price
    const priceColor  = hasDiscount ? "#F9A8D4" : "#4ADE80"

    cells += `
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="#171F2E"/>
      <clipPath id="c${i}"><rect x="${x + imgPad}" y="${y + 8}" width="${imgSz}" height="${imgSz}" rx="6"/></clipPath>
      <image href="${p.dataUri}" x="${x + imgPad}" y="${y + 8}"
        width="${imgSz}" height="${imgSz}"
        preserveAspectRatio="xMidYMid slice" clip-path="url(#c${i})"/>
      ${hasDiscount ? `
        <rect x="${x + imgPad + imgSz - 52}" y="${y + 10}" width="48" height="20" rx="4" fill="#db2777"/>
        <text x="${x + imgPad + imgSz - 28}" y="${y + 24}"
          text-anchor="middle" font-size="11" fill="white"
          font-weight="bold" font-family="Arial,sans-serif">SALE</text>` : ""}
      <text x="${x + cellW / 2}" y="${y + 8 + imgSz + 18}"
        text-anchor="middle" font-size="13" fill="#CBD5E1"
        font-family="Arial,sans-serif" font-weight="600">${esc(trunc(p.name, 20))}</text>
      ${priceStr ? `
        <text x="${x + cellW / 2}" y="${y + 8 + imgSz + 38}"
          text-anchor="middle" font-size="15" fill="${priceColor}"
          font-family="Arial,sans-serif" font-weight="bold">${esc(priceStr)}</text>` : ""}
    `
  })

  // ── Grid lines ──
  let lines = ""
  for (let c = 1; c < cols; c++)
    lines += `<line x1="${c * cellW}" y1="${HEADER}" x2="${c * cellW}" y2="${H - FOOTER}" stroke="#2D3748" stroke-width="1.5"/>`
  for (let r = 1; r < rows; r++)
    lines += `<line x1="0" y1="${HEADER + r * cellH}" x2="${W}" y2="${HEADER + r * cellH}" stroke="#2D3748" stroke-width="1.5"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
      width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#131921"/>
      <stop offset="55%"  stop-color="#1B2537"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0D1117"/>
      <stop offset="100%" stop-color="#131921"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#131921"/>
  ${cells}
  ${lines}

  <!-- Header -->
  <rect width="${W}" height="${HEADER}" fill="url(#hg)"/>
  <rect y="${HEADER - 2}" width="${W}" height="2" fill="#db2777"/>
  <text x="22" y="46" font-size="26" fill="white"
    font-weight="bold" font-family="Arial,sans-serif">${esc(trunc(shopName, 45))}</text>
  <rect x="${W - 150}" y="14" width="136" height="44" rx="8" fill="rgba(219,39,119,0.18)"/>
  <text x="${W - 82}" y="34" text-anchor="middle"
    font-size="13" fill="#F9A8D4" font-weight="bold" font-family="Arial,sans-serif">CTMerchant</text>
  <text x="${W - 82}" y="50" text-anchor="middle"
    font-size="10" fill="#94A3B8" font-family="Arial,sans-serif">Verified Store</text>

  <!-- Footer -->
  <rect y="${H - FOOTER}" width="${W}" height="${FOOTER}" fill="url(#fg)"/>
  <rect y="${H - FOOTER}" width="${W}" height="1" fill="#2D3748"/>
  <text x="${W / 2}" y="${H - 12}" text-anchor="middle"
    font-size="12" fill="#475569" font-family="Arial,sans-serif">www.ctmerchant.com.ng</text>
</svg>`
}
