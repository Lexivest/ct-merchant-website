import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const EXPECTED_FEE_NAIRA = 5000
const PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize"

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type InitRequest = {
  shopId?: number | string
  redirectUrl?: string
}

type ShopRecord = {
  id: number
  owner_id: string
  name: string | null
  is_verified: boolean | null
  kyc_status: string | null
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function isLikelyProduction() {
  const env = (Deno.env.get("DENO_ENV") || Deno.env.get("NODE_ENV") || "").toLowerCase()
  return env === "production"
}

function getEnvStrict(name: string, fallback?: string) {
  const value = Deno.env.get(name)
  if (value && value.trim()) return value.trim()

  if (fallback && !isLikelyProduction()) return fallback
  throw new HttpError(500, `Missing required server configuration: ${name}`)
}

function toPositiveInt(value: unknown) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return null
  return Math.trunc(raw)
}

function normalizeRedirectUrl(value: unknown) {
  const redirectUrl = String(value || "").trim()
  if (!redirectUrl) throw new HttpError(400, "redirectUrl is required.")
  const isAppRedirect = redirectUrl.startsWith("ctmerchant://")
  const isWebRedirect = /^https?:\/\//i.test(redirectUrl)
  if (!isAppRedirect && !isWebRedirect) {
    throw new HttpError(400, "Invalid redirect URL.")
  }
  return redirectUrl
}

function generateTransactionRef(prefix = "CTM-VERIFY") {
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()
  return `${prefix}-${Date.now()}-${randomPart}`
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error || "")
}

function authHeaderPreview(header: string | null) {
  if (!header) return "missing"
  const trimmed = header.trim()
  if (trimmed.length <= 24) return trimmed
  return `${trimmed.slice(0, 18)}...${trimmed.slice(-4)}`
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const payload = (await req.json()) as InitRequest
    console.log("[init-paystack] request", {
      rawShopId: payload?.shopId ?? null,
      hasRedirectUrl: Boolean(payload?.redirectUrl),
    })
    const shopId = toPositiveInt(payload.shopId)
    const redirectUrl = normalizeRedirectUrl(payload.redirectUrl)
    if (!shopId) throw new HttpError(400, "shopId is required.")

    const authHeader = req.headers.get("Authorization")
    console.log("[init-paystack] auth header", {
      hasAuthHeader: Boolean(authHeader),
      authPreview: authHeaderPreview(authHeader),
    })
    if (!authHeader) throw new HttpError(401, "Missing Authorization header.")

    const supabaseUrl = getEnvStrict("SUPABASE_URL")
    const serviceRoleKey = getEnvStrict("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = getEnvStrict("SUPABASE_ANON_KEY")
    const paystackSecret = getEnvStrict("PAYSTACK_SECRET_KEY", "sk_test_dummy")
    console.log("[init-paystack] env", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasAnonKey: Boolean(anonKey),
      hasPaystackSecret: Boolean(paystackSecret),
      shopId,
      redirectUrl,
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()
    console.log("[init-paystack] getUser", {
      hasUser: Boolean(user),
      userId: user?.id ?? null,
      authError: authError ? safeErrorMessage(authError) : null,
    })
    if (authError || !user) throw new HttpError(401, "Unauthorized.")

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("id, owner_id, name, is_verified, kyc_status")
      .eq("id", shopId)
      .eq("owner_id", user.id)
      .maybeSingle<ShopRecord>()

    if (shopError) throw new HttpError(500, `Failed to validate shop ownership: ${shopError.message}`)
    if (!shop) throw new HttpError(403, "Shop not found or access denied.")

    if (shop.is_verified || shop.kyc_status === "approved") {
      throw new HttpError(409, "This shop has already completed verification.")
    }

    const { data: existingPayment, error: paymentError } = await adminClient
      .from("physical_verification_payments")
      .select("id")
      .eq("merchant_id", user.id)
      .eq("status", "success")
      .maybeSingle<{ id: number }>()

    if (paymentError) {
      throw new HttpError(500, `Failed to check previous payment state: ${paymentError.message}`)
    }

    if (existingPayment?.id) {
      throw new HttpError(409, "This verification fee has already been paid.")
    }

    if (!user.email) {
      throw new HttpError(400, "A valid account email is required before payment can begin.")
    }

    const reference = generateTransactionRef()
    const initializeRes = await fetch(PAYSTACK_INITIALIZE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: EXPECTED_FEE_NAIRA * 100,
        currency: "NGN",
        reference,
        callback_url: redirectUrl,
        metadata: {
          shopId: shop.id,
          merchantId: user.id,
          shopName: shop.name || "CTMerchant Shop",
          purpose: "digital_id_kyc",
        },
      }),
    })

    if (!initializeRes.ok) {
      throw new HttpError(502, `Paystack initialize request failed (${initializeRes.status}).`)
    }

    const initializeData = await initializeRes.json()
    const authorizationUrl = initializeData?.data?.authorization_url
    const returnedReference = initializeData?.data?.reference || reference

    if (!authorizationUrl || !returnedReference) {
      throw new HttpError(502, "Paystack did not return a valid checkout session.")
    }

    return jsonResponse({
      success: true,
      reference: returnedReference,
      authorizationUrl,
    })
  } catch (error) {
    console.log("[init-paystack] failed", {
      status: error instanceof HttpError ? error.status : 500,
      message: safeErrorMessage(error),
    })
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }

    const message = error instanceof Error ? error.message : "Unexpected server error."
    return jsonResponse({ error: message }, 500)
  }
})
