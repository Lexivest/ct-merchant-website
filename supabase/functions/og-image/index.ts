/**
 * Supabase Edge Function — /functions/v1/og-image?id=SHOP_ID
 *
 * Generates a 1200×630 product-grid OG image for WhatsApp/social previews.
 * Up to 4 products shown in a grid; discounted products come first.
 * Each cell has the product name + price overlaid. Discount badge shown when
 * discount_price < price.
 *
 * Layout:
 *   1 product  → full canvas (redirect, no PNG)
 *   2 products → side by side (600×630 each)
 *   3–4 products → 2×2 grid (600×315 each)
 *
 * Falls back to a 302 redirect on timeout or any error.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts"

const CTM_LOGO = "https://www.ctmerchant.com.ng/ctm-logo.jpg"
// Roboto Bold — good Unicode coverage, includes the Naira sign (₦ U+20A6)
const FONT_URL = "https://fonts.gstatic.com/s/roboto/v32/KFOlCnqEu92Fr1MmWUlfBBc4.ttf"

const OG_W = 1200
const OG_H = 630
const CELL_W = OG_W / 2   // 600
const CELL_H = OG_H / 2   // 315

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SUPABASE_STORAGE_RE =
  /^(https:\/\/[^/]+\/storage\/v1\/object\/)(public\/.+)$/

function toThumbUrl(url: string, w: number, h: number): string {
  const m = url.match(SUPABASE_STORAGE_RE)
  if (!m) return url
  return `${m[1].replace("/object/", "/render/image/")}${m[2]}?width=${w}&height=${h}&resize=cover&quality=80`
}

async function fetchRaw(url: string, timeoutMs = 5000): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!resp.ok) return null
    return new Uint8Array(await resp.arrayBuffer())
  } catch {
    return null
  }
}

function coverCrop(img: Image, targetW: number, targetH: number): Image {
  const scale = Math.max(targetW / img.width, targetH / img.height)
  const sw = Math.max(1, Math.round(img.width * scale))
  const sh = Math.max(1, Math.round(img.height * scale))
  const resized = img.resize(sw, sh)
  const dx = Math.max(0, Math.floor((sw - targetW) / 2))
  const dy = Math.max(0, Math.floor((sh - targetH) / 2))
  return resized.crop(dx, dy, targetW, targetH)
}

function fmtPrice(n: number): string {
  // ₦ + comma-formatted integer
  return "₦" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Overlay product name + price badge onto a cell image.
 * If font is unavailable, skips text (grid still shows).
 */
async function addOverlay(
  cell: Image,
  name: string,
  price: number,
  discountPrice: number | null,
  cW: number,
  cH: number,
  font: Uint8Array | null,
): Promise<void> {
  if (!font) return

  const isSmall = cH <= CELL_H         // 315px cells (2×2 grid)
  const stripH  = isSmall ? 56 : 72
  const nameScale  = isSmall ? 12 : 15
  const priceScale = isSmall ? 11 : 13
  const pad = 8
  const stripY = cH - stripH

  // Dark semi-transparent bottom strip
  const strip = new Image(cW, stripH)
  strip.fill(0x000000CC)
  cell.composite(strip, 0, stripY)

  // Product name (truncated to fit)
  const shortName = name.length > (isSmall ? 22 : 26)
    ? name.slice(0, isSmall ? 20 : 24) + "…"
    : name
  const nameImg = await Image.renderText(font, nameScale, shortName, 0xFFFFFFFF)
  cell.composite(nameImg, pad, stripY + pad)

  const hasDiscount = discountPrice !== null && discountPrice < price
  if (hasDiscount) {
    const pct = Math.round((1 - discountPrice / price) * 100)

    // Discounted price in gold
    const priceImg = await Image.renderText(font, priceScale, fmtPrice(discountPrice), 0xFFD700FF)
    cell.composite(priceImg, pad, stripY + stripH - priceImg.height - pad)

    // Red discount badge on right
    const badgeImg = await Image.renderText(font, priceScale - 1, `-${pct}%`, 0xFFFFFFFF)
    const bgW = badgeImg.width + 10
    const bgH = badgeImg.height + 6
    const badge = new Image(bgW, bgH)
    badge.fill(0xE53E3EFF)
    badge.composite(badgeImg, 5, 3)
    cell.composite(badge, cW - bgW - pad, stripY + stripH - bgH - pad)
  } else {
    // Regular price in gold
    const priceImg = await Image.renderText(font, priceScale, fmtPrice(price), 0xFFD700FF)
    cell.composite(priceImg, pad, stripY + stripH - priceImg.height - pad)
  }
}

interface Product {
  name: string
  image_url: string
  price: number
  discount_price: number | null
}

async function buildGrid(products: Product[], font: Uint8Array | null): Promise<Uint8Array> {
  const count = Math.min(products.length, 4)
  const items = products.slice(0, count)

  const [cellW, cellH] = count === 2 ? [CELL_W, OG_H] : [CELL_W, CELL_H]

  // Fetch pre-resized thumbnails in parallel
  const rawBuffers = await Promise.all(
    items.map(p => fetchRaw(toThumbUrl(p.image_url, cellW, cellH)))
  )

  // Decode — skip corrupt / failed fetches
  const cells: Array<{ img: Image; product: Product }> = []
  for (let i = 0; i < rawBuffers.length; i++) {
    const buf = rawBuffers[i]
    if (!buf) continue
    try {
      cells.push({ img: await Image.decode(buf), product: items[i] })
    } catch { /* skip */ }
  }

  if (cells.length === 0) throw new Error("no decodable images")

  const canvas = new Image(OG_W, OG_H)
  canvas.fill(0x1a1a2eff)

  if (cells.length === 1) {
    const cell = coverCrop(cells[0].img, OG_W, OG_H)
    await addOverlay(cell, cells[0].product.name, cells[0].product.price, cells[0].product.discount_price, OG_W, OG_H, font)
    canvas.composite(cell, 0, 0)
  } else if (cells.length === 2) {
    for (let i = 0; i < 2; i++) {
      const cell = coverCrop(cells[i].img, CELL_W, OG_H)
      await addOverlay(cell, cells[i].product.name, cells[i].product.price, cells[i].product.discount_price, CELL_W, OG_H, font)
      canvas.composite(cell, i * CELL_W, 0)
    }
  } else {
    const positions: [number, number][] = [
      [0, 0],      [CELL_W, 0],
      [0, CELL_H], [CELL_W, CELL_H],
    ]
    for (let i = 0; i < Math.min(cells.length, 4); i++) {
      const cell = coverCrop(cells[i].img, CELL_W, CELL_H)
      await addOverlay(cell, cells[i].product.name, cells[i].product.price, cells[i].product.discount_price, CELL_W, CELL_H, font)
      canvas.composite(cell, positions[i][0], positions[i][1])
    }
  }

  // Compression level 1 = fastest encode that still produces a valid PNG
  return await canvas.encode(1)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const url = new URL(req.url)
  const shopId = url.searchParams.get("id")
  if (!shopId) return Response.redirect(CTM_LOGO, 302)

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  let fallbackUrl = CTM_LOGO

  try {
    // Fetch shop info, products, and font in parallel
    const [shopRes, prodRes, font] = await Promise.all([
      admin.from("shops").select("image_url").eq("id", shopId).single(),
      admin
        .from("products")
        .select("name, image_url, price, discount_price")
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .eq("is_approved", true)
        .not("image_url", "is", null)
        // Discounted products (non-null discount_price) first, then by newest
        .order("discount_price", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(4),
      fetchRaw(FONT_URL, 3000),
    ])

    const products = (prodRes.data ?? []) as Product[]
    const shopLogoUrl = shopRes.data?.image_url as string | undefined

    fallbackUrl = products[0]?.image_url ?? shopLogoUrl ?? CTM_LOGO

    // Need 2+ products to justify PNG generation; single image → fast redirect
    if (products.length < 2) {
      return Response.redirect(fallbackUrl, 302)
    }

    // Race grid generation against a 9-second wall-clock limit
    const png = await Promise.race([
      buildGrid(products, font),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("grid timeout")), 9000)
      ),
    ])

    return new Response(png, {
      headers: {
        ...CORS,
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    })
  } catch (err) {
    console.error("[og-image] fallback:", (err as Error).message)
    return Response.redirect(fallbackUrl, 302)
  }
})
