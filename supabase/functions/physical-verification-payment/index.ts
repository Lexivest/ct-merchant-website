import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type VerifyRequest = {
  transactionId?: string // This will act as the Promo Code
  shopId?: number | string
}

type ShopRecord = {
  id: number
  owner_id: string
  name: string | null
  city_id: number | null
  status: string | null
  is_verified: boolean | null
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function getEnvStrict(name: string) {
  const value = Deno.env.get(name)
  if (value && value.trim()) return value.trim()
  throw new HttpError(500, `Missing required server configuration: ${name}`)
}

function toPositiveInt(value: unknown) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return null
  return Math.trunc(raw)
}

function normalizePromoCode(input: unknown) {
  const code = String(input || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
  if (code.length !== 6) throw new HttpError(400, "Promo code must be 6 alphanumeric characters.")
  return code
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const payload = (await req.json()) as VerifyRequest
    const promoCode = normalizePromoCode(payload.transactionId)
    const shopId = toPositiveInt(payload.shopId)
    
    if (!shopId) throw new HttpError(400, "shopId is required.")

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) throw new HttpError(401, "Missing Authorization header.")

    const supabaseUrl = getEnvStrict("SUPABASE_URL")
    const serviceRoleKey = getEnvStrict("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = getEnvStrict("SUPABASE_ANON_KEY")

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) throw new HttpError(401, "Unauthorized.")

    // 1. Verify Shop Ownership
    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("id, owner_id, name, city_id, status, is_verified")
      .eq("id", shopId)
      .eq("owner_id", user.id)
      .maybeSingle<ShopRecord>()

    if (shopError) throw new HttpError(500, `Failed to validate shop ownership: ${shopError.message}`)
    if (!shop) throw new HttpError(403, "Shop not found or access denied.")
    if (shop.is_verified) {
      return jsonResponse({
        success: true,
        idempotent: true,
        message: "Your shop is already physically verified.",
      })
    }
    if (shop.status !== "approved") {
      throw new HttpError(409, "Your shop must be digitally approved before promo verification can continue.")
    }

    // 2. Grab Profile Details for the Receipt
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("full_name, cities(name)")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string | null; cities?: { name: string | null } | null }>()

    if (profileError) throw new HttpError(500, `Failed to load merchant profile: ${profileError.message}`)

    const merchantName = profile?.full_name || "Merchant"
    const cityName = profile?.cities?.name || "Unknown City"
    const shopName = shop.name || "Unknown Shop"

    // 3. Fire the Atomic RPC Transaction
    const { data: rpcResult, error: rpcError } = await adminClient.rpc('redeem_verification_promo_code', {
      p_merchant_id: user.id,
      p_code: promoCode,
      p_shop_id: shop.id,
      p_merchant_name: merchantName,
      p_shop_name: shopName,
      p_city_name: cityName
    });

    if (rpcError) {
        // If the RPC threw our custom error message about an invalid code, return a 409
        if (rpcError.message.includes('Invalid or already used promo code')) {
            throw new HttpError(409, rpcError.message);
        }
        throw new HttpError(500, `Database transaction failed: ${rpcError.message}`);
    }

    return jsonResponse(rpcResult)

  } catch (error) {
    console.log("[verify-promo-payment] failed", error)
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message = error instanceof Error ? error.message : "Unexpected server error."
    return jsonResponse({ error: message }, 500)
  }
})
