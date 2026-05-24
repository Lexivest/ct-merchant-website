/**
 * Supabase Edge Function — /og-image?id=SHOP_ID
 *
 * Returns the best available preview image for a shop's WhatsApp/social link preview.
 * Priority: first product image → shop logo → CTM default logo
 *
 * No image generation — just a redirect to a real public image URL.
 * Simple, fast, guaranteed to work.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CTM_LOGO = "https://www.ctmerchant.com.ng/ctm-logo.jpg"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const url = new URL(req.url)
  const shopId = url.searchParams.get("id")

  if (!shopId) return Response.redirect(CTM_LOGO, 302)

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Fetch shop logo + first approved product image in parallel
    const [shopRes, prodRes] = await Promise.all([
      admin
        .from("shops")
        .select("image_url")
        .eq("id", shopId)
        .single(),
      admin
        .from("products")
        .select("image_url")
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .eq("is_approved", true)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    ])

    // Pick best image: first product → shop logo → CTM logo
    const image =
      prodRes.data?.image_url ||
      shopRes.data?.image_url ||
      CTM_LOGO

    return Response.redirect(image, 302)

  } catch (err) {
    console.error("[og-image]", err)
    return Response.redirect(CTM_LOGO, 302)
  }
})
