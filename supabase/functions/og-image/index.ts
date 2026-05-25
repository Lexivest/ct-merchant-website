/**
 * Supabase Edge Function — /functions/v1/og-image?id=SHOP_ID
 *
 * Generates a 1200×630 product-grid OG image and caches it in Supabase Storage
 * (og-cache bucket). Returns a 302 redirect to the storage CDN URL — the same
 * pattern WhatsApp uses for single product images, which is known to work.
 *
 * Layout:
 *   - 1200×590 product grid (2×2 cells of 600×295, or wide variants)
 *   - 1200×40  shop-name bar at the bottom
 *
 * Cache TTL: 2 hours. Cache key includes CACHE_VERSION so bumping the suffix
 * forces all shops to regenerate on next request without deleting old files.
 * Falls back to first-product-image redirect on any error.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts"

const CTM_LOGO     = "https://www.ctmerchant.com.ng/ctm-logo.jpg"
const FONT_URL     = "https://fonts.gstatic.com/s/roboto/v32/KFOlCnqEu92Fr1MmWUlfBBc4.ttf"
const CACHE_BUCKET = "og-cache"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000

const OG_W       = 1200
const OG_H       = 630
const SHOP_BAR_H = 40
const GRID_H     = OG_H - SHOP_BAR_H  // 590
const CELL_W     = OG_W / 2           // 600
const CELL_H     = GRID_H / 2         // 295

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
  const isSmall    = cH <= CELL_H
  const stripH     = isSmall ? 64 : 80
  const nameScale  = isSmall ? 12 : 15
  const priceScale = isSmall ? 12 : 14
  const pad        = 10
  const stripY     = cH - stripH

  // Dark semi-transparent overlay strip (single solid strip — reliable across all runtimes)
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
    const bgW = badgeImg.width + 12
    const bgH = badgeImg.height + 8
    const badge = new Image(bgW, bgH)
    badge.fill(0xE53E3EFF)
    badge.composite(badgeImg, 6, 4)
    cell.composite(badge, cW - bgW - pad, stripY + stripH - bgH - pad)
  } else {
    const priceImg = await Image.renderText(font, priceScale, fmtPrice(price), 0xFFD700FF)
    cell.composite(priceImg, pad, stripY + stripH - priceImg.height - pad)
  }
}

interface Product {
  name: string; image_url: string; price: number; discount_price: number | null
}

async function buildGrid(
  products: Product[], shopName: string | undefined, font: Uint8Array | null,
): Promise<Uint8Array> {
  const items = products.slice(0, 4)
  const [cellW, cellH] = items.length === 2 ? [CELL_W, GRID_H] : [CELL_W, CELL_H]

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
    const cell = coverCrop(cells[0].img, OG_W, GRID_H)
    await addOverlay(cell, cells[0].product.name, cells[0].product.price, cells[0].product.discount_price, OG_W, GRID_H, font)
    canvas.composite(cell, 0, 0)
  } else if (cells.length === 2) {
    for (let i = 0; i < 2; i++) {
      const cell = coverCrop(cells[i].img, CELL_W, GRID_H)
      await addOverlay(cell, cells[i].product.name, cells[i].product.price, cells[i].product.discount_price, CELL_W, GRID_H, font)
      canvas.composite(cell, i * CELL_W, 0)
    }
    // vertical divider
    const vDiv = new Image(2, GRID_H); vDiv.fill(0x00000099)
    canvas.composite(vDiv, CELL_W - 1, 0)
  } else {
    const positions: [number, number][] = [[0, 0], [CELL_W, 0], [0, CELL_H], [CELL_W, CELL_H]]
    for (let i = 0; i < Math.min(cells.length, 4); i++) {
      const cell = coverCrop(cells[i].img, CELL_W, CELL_H)
      await addOverlay(cell, cells[i].product.name, cells[i].product.price, cells[i].product.discount_price, CELL_W, CELL_H, font)
      canvas.composite(cell, positions[i][0], positions[i][1])
    }
    // cell dividers
    const vDiv = new Image(2, GRID_H); vDiv.fill(0x00000099)
    canvas.composite(vDiv, CELL_W - 1, 0)
    const hDiv = new Image(OG_W, 2); hDiv.fill(0x00000099)
    canvas.composite(hDiv, 0, CELL_H - 1)
  }

  // Shop name bar across the full bottom
  const shopBar = new Image(OG_W, SHOP_BAR_H)
  shopBar.fill(0x0D0D1AFF)
  canvas.composite(shopBar, 0, GRID_H)

  // Shop name + brand tag — wrapped defensively: text rendering failures
  // (unsupported characters, zero-size glyphs, etc.) must not abort the PNG.
  if (shopName && font) {
    try {
      // Strip non-Latin characters that Roboto Bold may not support to avoid
      // renderText throwing or producing a zero-dimension image.
      const safe = shopName
        .replace(/[^\x20-\x7EÀ-ɏ]/g, "")
        .trim()
        .slice(0, 44)
      if (safe) {
        const nameImg = await Image.renderText(font, 14, safe, 0xFFFFFFFF)
        if (nameImg.width > 0 && nameImg.height > 0) {
          const nameX = Math.max(16, Math.floor((OG_W - nameImg.width) / 2))
          const nameY = GRID_H + Math.max(0, Math.floor((SHOP_BAR_H - nameImg.height) / 2))
          canvas.composite(nameImg, nameX, nameY)
        }
      }
    } catch { /* non-fatal — shop bar still shows without text */ }

    try {
      const ctmImg = await Image.renderText(font, 11, "CTMerchant", 0xFF9944FF)
      if (ctmImg.width > 0 && ctmImg.height > 0) {
        const ctmY = GRID_H + Math.max(0, Math.floor((SHOP_BAR_H - ctmImg.height) / 2))
        canvas.composite(ctmImg, OG_W - ctmImg.width - 16, ctmY)
      }
    } catch { /* non-fatal */ }
  }

  return await canvas.encode(1)
}

// deno-lint-ignore no-explicit-any
type Supa = ReturnType<typeof createClient<any>>

// Bump this suffix whenever a breaking visual change is deployed so existing
// cached files are bypassed and shops regenerate on next request.
const CACHE_VERSION = "v2"

function cacheFileName(shopId: string): string {
  return `shop-${shopId}-${CACHE_VERSION}.png`
}

function transformUrl(shopId: string): string {
  const base = Deno.env.get("SUPABASE_URL")!
  return `${base}/storage/v1/render/image/public/${CACHE_BUCKET}/${cacheFileName(shopId)}` +
    `?width=${OG_W}&height=${OG_H}&resize=cover&quality=75`
}

async function getCachedUrl(admin: Supa, shopId: string): Promise<string | null> {
  const fileName = cacheFileName(shopId)
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
  const fileName = cacheFileName(shopId)
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
    const [cachedUrl, shopRes, prodRes, font] = await Promise.all([
      getCachedUrl(admin, shopId),
      admin.from("shops").select("image_url, name").eq("id", shopId).single(),
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
    const shopName    = shopRes.data?.name as string | undefined

    fallbackUrl = products[0]?.image_url ?? shopLogoUrl ?? CTM_LOGO

    if (cachedUrl) return Response.redirect(cachedUrl, 302)
    if (products.length < 2) return Response.redirect(fallbackUrl, 302)

    const png = await Promise.race([
      buildGrid(products, shopName, font),
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
