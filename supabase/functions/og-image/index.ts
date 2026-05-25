/**
 * Supabase Edge Function — /functions/v1/og-image?id=SHOP_ID
 *
 * Resolves the best preview image for a shop and 302-redirects to it.
 * Uses the service-role key so RLS is bypassed — same as what anon users
 * can see in the marketplace (approved products from verified, active shops).
 *
 * Resolution order:
 *   1. First approved + available product image (newest first)
 *   2. Shop logo
 *   3. CTM default logo
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    const [shopRes, prodRes] = await Promise.all([
      admin.from("shops").select("image_url").eq("id", shopId).single(),
      admin
        .from("products")
        .select("image_url")
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .eq("is_approved", true)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1),
    ])

    const productImageUrl = (prodRes.data ?? [])[0]?.image_url as string | undefined
    const shopLogoUrl = shopRes.data?.image_url as string | undefined

    const imageUrl = productImageUrl ?? shopLogoUrl ?? CTM_LOGO

    return Response.redirect(imageUrl, 302)
  } catch (err) {
    console.error("[og-image] error:", (err as Error).message)
    return Response.redirect(CTM_LOGO, 302)
  }
})
