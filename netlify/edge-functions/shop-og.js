/**
 * Netlify Edge Function: shop-og
 *
 * Intercepts requests to /shop-detail and /service-provider from social-media
 * bots (WhatsApp, Facebook, Telegram, Twitter, etc.) and returns a minimal HTML
 * page that has the shop's OG meta tags (logo, name, description) instead of
 * the generic CTMerchant defaults.  Regular users pass straight through to the
 * SPA index.html as normal.
 *
 * Required Netlify environment variables (set in Netlify Dashboard → Site
 * configuration → Environment variables):
 *   SUPABASE_URL       – e.g. https://xdchacdjcgazyckacbpc.supabase.co
 *   SUPABASE_ANON_KEY  – the public anon JWT (safe to expose)
 */

const BOT_UA = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|LinkedInBot|Slackbot-LinkExpanding|Googlebot|bingbot|DuckDuckBot|Applebot|vkShare|Pinterestbot/i

export default async function handler(request, context) {
  const ua = request.headers.get("user-agent") || ""

  // Let real browsers pass straight through to the SPA
  if (!BOT_UA.test(ua)) return context.next()

  const url = new URL(request.url)
  const shopId = url.searchParams.get("id")
  if (!shopId) return context.next()

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
  const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY")
  if (!SUPABASE_URL || !SUPABASE_KEY) return context.next()

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

    if (!res.ok) return context.next()

    const [shop] = await res.json()
    if (!shop) return context.next()

    const title = `${shop.name} | CTMerchant`
    const description = shop.description
      ? shop.description.slice(0, 200)
      : `Visit ${shop.name} on CTMerchant — a ${shop.is_verified ? "verified " : ""}local ${shop.category || "shop"} in Nigeria.`

    // Use the shop logo; fall back to the CTM logo so OG image is never blank
    const image = shop.image_url || "https://www.ctmerchant.com.ng/ctm-logo.jpg"
    const pageUrl = request.url

    return new Response(buildHtml({ title, description, image, pageUrl, shopName: shop.name }), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Cache the bot response for 5 minutes so repeated scrapes don't hammer Supabase
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    })
  } catch {
    // On any error, let the SPA handle it normally
    return context.next()
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
  <meta property="og:title"       content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image"       content="${esc(image)}">
  <meta property="og:image:width" content="400">
  <meta property="og:image:height" content="400">
  <meta property="og:url"         content="${esc(pageUrl)}">
  <meta property="og:type"        content="website">
  <meta property="og:site_name"   content="CTMerchant">

  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image"       content="${esc(image)}">

  <!-- Redirect real users who land here (e.g. following a cached bot URL) -->
  <meta http-equiv="refresh" content="0;url=${esc(pageUrl)}">
  <script>window.location.replace(${JSON.stringify(pageUrl)});</script>
</head>
<body>
  <p>Redirecting to <a href="${esc(pageUrl)}">${esc(shopName)}</a> on CTMerchant&hellip;</p>
</body>
</html>`
}
