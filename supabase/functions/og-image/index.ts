/**
 * Supabase Edge Function — /functions/v1/og-image?id=SHOP_ID
 *
 * Generates a 1200×630 product-grid OG image and caches it in Supabase Storage
 * (og-cache bucket). Returns a 302 redirect to the storage CDN URL — the same
 * pattern WhatsApp uses for single product images, which is known to work.
 *
 * Cache TTL: 2 hours. On cache hit the response is ~200ms. On cache miss the
 * PNG is generated (~1–2 s), saved, and the bot is redirected to the CDN URL.
 *
 * Discounted products (non-null discount_price) are sorted first.
 * Each cell shows the product name + price; discounted cells also show a
 * red -X% badge. Font (Roboto Bold) is fetched in parallel with images.
 *
 * Falls back to first-product-image redirect on any error or timeout.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts"

const CTM_LOGO    = "https://www.ctmerchant.com.ng/ctm-logo.jpg"
const FONT_URL    = "https://fonts.gstatic.com/s/roboto/v32/KFOlCnqEu92Fr1MmWUlfBBc4.ttf"
const CACHE_BUCKET = "og-cache"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000  // 2 hours

const OG_W  = 1200
const OG_H  = 630
const CELL_W = OG_W / 2  // 600
const CELL_H = OG_H / 2  // 315

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
  return "₦" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

async function addOverlay(
  cell: Image, name: string, price: number, discountPrice: number | null,
  cW: number, cH: number, font: Uint8Array | null,
): Promise<void> {
  if (!font) return
  const isSmall   = cH <= CELL_H
  const stripH    = isSmall ? 56 : 72
  const nameScale = isSmall ? 12 : 15
  const priceScale = isSmall ? 11 : 13
  const pad   = 8
  const stripY = cH - stripH

  const strip = new Image(cW, stripH)
  strip.fill(0x000000CC)
  cell.composite(strip, 0, stripY)

  const shortName = name.length > (isSmall ? 22 : 26)
    ? name.slice(0, isSmall ? 20 : 24) + "…" : name
  const nameImg = await Image.renderText(font, nameScale, shortName, 0xFFFFFFFF)
  cell.composite(nameImg, pad, stripY + pad)

  const hasDiscount = discountPrice !== null && discountPrice < price
  if (hasDiscount) {
    const pct = Math.round((1 - discountPrice / price) * 100)
    const priceImg = await Image.renderText(font, priceScale, fmtPrice(discountPrice), 0xFFD700FF)
    cell.composite(priceImg, pad, stripY + stripH - priceImg.height - pad)
    const badgeImg = await Image.renderText(font, priceScale - 1, `-${pct}%`, 0xFFFFFFFF)
    const bgW = badgeImg.width + 10
    const bgH = badgeImg.height + 6
    const badge = new Image(bgW, bgH)
    badge.fill(0xE53E3EFF)
    badge.composite(badgeImg, 5, 3)
    cell.composite(badge, cW - bgW - pad, stripY + stripH - bgH - pad)
  } else {
    const priceImg = await Image.renderText(font, priceScale, fmtPrice(price), 0xFFD700FF)
    cell.composite(priceImg, pad, stripY + stripH - priceImg.height - pad)
  }
}

interface Product {
  name: string; image_url: string; price: number; discount_price: number | null
}

async function buildGrid(products: Product[], font: Uint8Array | null): Promise<Uint8Array> {
  const items = products.slice(0, 4)
  const [cellW, cellH] = items.length === 2 ? [CELL_W, OG_H] : [CELL_W, CELL_H]

  const rawBuffers = await Promise.all(items.map(p => fetchRaw(toThumbUrl(p.image_url, cellW, cellH))))

  const cells: Array<{ img: Image; product: Product }> = []
  for (let i = 0; i < rawBuffers.length; i++) {
    if (!rawBuffers[i]) continue
    try { cells.push({ img: await Image.decode(rawBuffers[i]!), product: items[i] }) }
    catch { /* skip corrupt */ }
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
    const positions: [number, number][] = [[0,0],[CELL_W,0],[0,CELL_H],[CELL_W,CELL_H]]
    for (let i = 0; i < Math.min(cells.length, 4); i++) {
      const cell = coverCrop(cells[i].img, CELL_W, CELL_H)
      await addOverlay(cell, cells[i].product.name, cells[i].product.price, cells[i].product.discount_price, CELL_W, CELL_H, font)
      canvas.composite(cell, positions[i][0], positions[i][1])
    }
  }

  return await canvas.encode(1)
}

// deno-lint-ignore no-explicit-any
type Supa = ReturnType<typeof createClient<any>>

/**
 * Build the Image Transform CDN URL for a cached grid PNG. This is what we
 * redirect WhatsApp to: Supabase's transform endpoint reads the source PNG
 * (1+ MB) and serves a WebP/JPEG (50-200 KB) based on the bot's Accept
 * header — well under WhatsApp's ~300 KB og:image size limit.
 */
function transformUrl(shopId: string): string {
  const base = Deno.env.get("SUPABASE_URL")!
  return `${base}/storage/v1/render/image/public/${CACHE_BUCKET}/shop-${shopId}.png` +
    `?width=${OG_W}&height=${OG_H}&resize=cover&quality=75`
}

async function getCachedUrl(admin: Supa, shopId: string): Promise<string | null> {
  const fileName = `shop-${shopId}.png`
  const { data: files } = await admin.storage.from(CACHE_BUCKET).list("", {
    search: fileName, limit: 1,
  })
  if (!files || files.length === 0) return null
  const file = files[0]
  const updatedAt = file.updated_at ?? file.created_at
  if (!updatedAt) return null
  if (Date.now() - new Date(updatedAt).getTime() > CACHE_TTL_MS) return null
  return transformUrl(shopId)
}

async function saveAndGetUrl(admin: Supa, shopId: string, png: Uint8Array): Promise<string> {
  const fileName = `shop-${shopId}.png`
  await admin.storage.from(CACHE_BUCKET).upload(fileName, png, {
    contentType: "image/png",
    upsert: true,
  })
  return transformUrl(shopId)
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
    // Run cache check and data fetch in parallel to minimise latency on cache miss
    const [cachedUrl, shopRes, prodRes, font] = await Promise.all([
      getCachedUrl(admin, shopId),
      admin.from("shops").select("image_url").eq("id", shopId).single(),
      admin.from("products")
        .select("name, image_url, price, discount_price")
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .eq("is_approved", true)
        .not("image_url", "is", null)
        .order("discount_price", { ascending: false, nullsFirst: false })
        .order("created_at",     { ascending: false })
        .limit(4),
      fetchRaw(FONT_URL, 3000),
    ])

    const products    = (prodRes.data ?? []) as Product[]
    const shopLogoUrl = shopRes.data?.image_url as string | undefined

    fallbackUrl = products[0]?.image_url ?? shopLogoUrl ?? CTM_LOGO

    // Fast path: serve cached grid image
    if (cachedUrl) return Response.redirect(cachedUrl, 302)

    // Only one (or zero) products — just redirect, no grid needed
    if (products.length < 2) return Response.redirect(fallbackUrl, 302)

    // Generate grid, save to storage, redirect to CDN URL
    const png = await Promise.race([
      buildGrid(products, font),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("grid timeout")), 9000)
      ),
    ])

    const storageUrl = await saveAndGetUrl(admin, shopId, png)
    return Response.redirect(storageUrl, 302)

  } catch (err) {
    console.error("[og-image] fallback:", (err as Error).message)
    return Response.redirect(fallbackUrl, 302)
  }
})
