/**
 * Shared handler for Cloudflare Pages Functions.
 * Intercepts social-media bot requests to /shop-detail and /service-provider,
 * fetches the shop's name/logo/description from Supabase, and returns an HTML
 * page with correct OG meta tags so WhatsApp / Facebook / Telegram previews
 * show the merchant's own branding instead of the generic CTM logo.
 *
 * Real users pass through via next() to the SPA index.html as normal.
 *
 * Env vars (Cloudflare Pages → Settings → Environment variables):
 *   VITE_SUPABASE_URL       – https://xdchacdjcgazyckacbpc.supabase.co
 *   VITE_SUPABASE_ANON_KEY  – public anon JWT
 *
 * Hardcoded fallbacks are safe: both values are already embedded in the
 * built JS bundle that any visitor can download.
 */

const BOT_UA =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|LinkedInBot|Slackbot-LinkExpanding|Googlebot|bingbot|DuckDuckBot|Applebot|vkShare|Pinterestbot/i

const FALLBACK_URL = "https://xdchacdjcgazyckacbpc.supabase.co"
const FALLBACK_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY2hhY2RqY2dhenlja2FjYnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA2MzMsImV4cCI6MjA4NTExNjYzM30.41V3RaUX-ii-EHysbcVpUCgm0-RsNmuOb8FmYsz72Ow"

export async function handleShopOg(context) {
  const { request, env, next } = context

  // Let real browsers pass straight through to the SPA
  const ua = request.headers.get("user-agent") || ""
  if (!BOT_UA.test(ua)) return next()

  const url = new URL(request.url)
  const shopId = url.searchParams.get("id")
  if (!shopId) return next()

  // Use env vars when available, fall back to hardcoded public values
  const SUPABASE_URL = env.VITE_SUPABASE_URL || FALLBACK_URL
  const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY

  try {
    const apiUrl =
      `${SUPABASE_URL}/rest/v1/shops` +
      `?id=eq.${encodeURIComponent(shopId)}` +
      `&select=name,description,image_url,address,category,is_verified` +
      `&limit=1`

    const res = await fetch(apiUrl, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    })

    if (!res.ok) return next()

    const shops = await res.json()
    const shop = shops?.[0]
    if (!shop) return next()

    const title = `${shop.name} | CTMerchant`
    const description = shop.description
      ? shop.description.slice(0, 200)
      : `Visit ${shop.name} on CTMerchant — a ${shop.is_verified ? "verified " : ""}local ${shop.category || "shop"} in Nigeria.`

    // og:image points to the Supabase Edge Function that generates a product-grid PNG.
    // apikey is included so any reverse-proxy or CDN can pass it through; the function
    // itself uses its service-role key internally and has verify_jwt: false.
    const image = `${SUPABASE_URL}/functions/v1/og-image?id=${encodeURIComponent(shopId)}&apikey=${encodeURIComponent(SUPABASE_KEY)}`
    const pageUrl = request.url

    const html = buildHtml({ title, description, image, pageUrl, shopName: shop.name })

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Cache bot responses for 5 minutes to reduce Supabase load
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    })
  } catch {
    return next()
  }
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildHtml({ title, description, image, pageUrl, shopName }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">

  <!-- Open Graph (WhatsApp, Facebook, LinkedIn, etc.) -->
  <meta property="og:title"        content="${esc(title)}">
  <meta property="og:description"  content="${esc(description)}">
  <meta property="og:image"        content="${esc(image)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url"          content="${esc(pageUrl)}">
  <meta property="og:type"         content="website">
  <meta property="og:site_name"    content="CTMerchant">

  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image"       content="${esc(image)}">

  <!-- Redirect real users who land on this URL directly -->
  <meta http-equiv="refresh" content="0;url=${esc(pageUrl)}">
  <script>window.location.replace(${JSON.stringify(pageUrl)});</script>
</head>
<body>
  <p>Redirecting to <a href="${esc(pageUrl)}">${esc(shopName)}</a> on CTMerchant&hellip;</p>
</body>
</html>`
}
