/**
 * Supabase Edge Function — /functions/v1/og-image?id=SHOP_ID
 *
 * Generates a 1200×630 PNG product-grid preview image for WhatsApp/social
 * link previews. Fetches up to 4 approved product images and stitches them
 * into a 2×2 grid using imagescript (pure Deno, no WASM).
 *
 * Falls back to:
 *   1+ product  → single product image (302 redirect)
 *   0 products  → shop logo (302 redirect)
 *   no logo     → CTM default logo (302 redirect)
 *
 * Grid generation errors also fall back gracefully to a redirect.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts"

const CTM_LOGO = "https://www.ctmerchant.com.ng/ctm-logo.jpg"

// 1200×630 — standard OG image dimensions (1.91:1 ratio, optimal for WhatsApp)
const OG_W = 1200
const OG_H = 630
const CELL_W = OG_W / 2  // 600 px per column
const CELL_H = OG_H / 2  // 315 px per row

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

/** Fetch a remote image as raw bytes. Returns null on any failure. */
async function fetchRaw(url: string): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return null
    return new Uint8Array(await resp.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Resize + center-crop an image to exactly (targetW × targetH) — CSS "cover" behaviour.
 * Ensures the cell is always fully filled regardless of the source aspect ratio.
 */
function coverCrop(img: Image, targetW: number, targetH: number): Image {
  const scale = Math.max(targetW / img.width, targetH / img.height)
  const sw = Math.max(1, Math.round(img.width * scale))
  const sh = Math.max(1, Math.round(img.height * scale))
  const resized = img.resize(sw, sh)
  const dx = Math.max(0, Math.floor((sw - targetW) / 2))
  const dy = Math.max(0, Math.floor((sh - targetH) / 2))
  return resized.crop(dx, dy, targetW, targetH)
}

/**
 * Build a 1200×630 PNG grid from up to 4 product image URLs.
 * Layout:
 *   2 images → side by side (600×630 each)
 *   3 images → 2 top + 1 bottom-left (bottom-right is dark fill)
 *   4 images → 2×2 grid (600×315 each)
 */
async function buildGrid(imageUrls: string[]): Promise<Uint8Array> {
  const urls = imageUrls.slice(0, 4)

  // Fetch all images in parallel
  const rawBuffers = await Promise.all(urls.map(fetchRaw))

  // Decode each successfully fetched image
  const decoded: Image[] = []
  for (const buf of rawBuffers) {
    if (!buf) continue
    try {
      decoded.push(await Image.decode(buf))
    } catch { /* skip corrupt images */ }
  }

  if (decoded.length === 0) throw new Error("no decodable images")

  const canvas = new Image(OG_W, OG_H)
  // Dark charcoal background — shows between cells and behind any partial fills
  canvas.fill(0x1a1a2eff)

  if (decoded.length === 1) {
    // Single image: fill the whole canvas
    canvas.composite(coverCrop(decoded[0], OG_W, OG_H), 0, 0)
  } else if (decoded.length === 2) {
    // Two images: side by side, full height
    canvas.composite(coverCrop(decoded[0], CELL_W, OG_H), 0, 0)
    canvas.composite(coverCrop(decoded[1], CELL_W, OG_H), CELL_W, 0)
  } else {
    // 3–4 images: 2×2 grid (3rd and optional 4th fill bottom row)
    const positions: [number, number][] = [
      [0, 0],      [CELL_W, 0],
      [0, CELL_H], [CELL_W, CELL_H],
    ]
    for (let i = 0; i < Math.min(decoded.length, 4); i++) {
      canvas.composite(coverCrop(decoded[i], CELL_W, CELL_H), positions[i][0], positions[i][1])
    }
  }

  // Encode as PNG with light compression (faster than max, still much smaller than raw)
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

  // Establish a fallback early so the catch block always has something to redirect to
  let fallbackImageUrl = CTM_LOGO

  try {
    const [shopRes, prodsRes] = await Promise.all([
      admin.from("shops").select("image_url").eq("id", shopId).single(),
      admin
        .from("products")
        .select("image_url")
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .eq("is_approved", true)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(4),
    ])

    const productUrls = (prodsRes.data ?? [])
      .map((p: { image_url: string }) => p.image_url)
      .filter(Boolean) as string[]

    const shopLogoUrl = shopRes.data?.image_url as string | undefined

    // Update fallback now that we have real URLs
    fallbackImageUrl = productUrls[0] ?? shopLogoUrl ?? CTM_LOGO

    // Need at least 2 product images to justify the PNG generation cost;
    // a single image is served more efficiently as a direct redirect.
    if (productUrls.length < 2) {
      return Response.redirect(fallbackImageUrl, 302)
    }

    // Race grid generation against an 8-second wall-clock timeout.
    // If it loses, the catch block redirects to the fallback.
    const png = await Promise.race([
      buildGrid(productUrls),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("grid timeout")), 8000)
      ),
    ])

    return new Response(png, {
      headers: {
        ...CORS,
        "Content-Type": "image/png",
        // Cache for 1 hour — product inventory changes slowly
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    })
  } catch (err) {
    console.error("[og-image] falling back to redirect:", (err as Error).message)
    return Response.redirect(fallbackImageUrl, 302)
  }
})
