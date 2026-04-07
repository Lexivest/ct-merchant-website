import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const PLAN_OPTIONS = {
  "6_Months": { amount: 6000, label: "6 Months" },
  "1_Year": { amount: 10000, label: "1 Year" },
} as const

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
  plan?: keyof typeof PLAN_OPTIONS | string
  redirectUrl?: string
}

type ShopRecord = {
  id: number
  owner_id: string
  name: string | null
  is_verified: boolean | null
  kyc_status: string | null
  is_subscription_active: boolean | null
  subscription_end_date: string | null
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
  if (!redirectUrl.startsWith("ctmerchant://")) {
    throw new HttpError(400, "Invalid redirect URL.")
  }
  return redirectUrl
}

function normalizePlan(value: unknown) {
  const plan = String(value || "").trim() as keyof typeof PLAN_OPTIONS
  if (!plan || !(plan in PLAN_OPTIONS)) throw new HttpError(400, "Invalid subscription plan.")
  return plan
}

function generateTransactionRef(prefix = "CTM-SUB") {
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()
  return `${prefix}-${Date.now()}-${randomPart}`
}

function isFutureDate(value: string | null | undefined) {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() > Date.now()
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const payload = (await req.json()) as InitRequest
    const shopId = toPositiveInt(payload.shopId)
    const plan = normalizePlan(payload.plan)
    const redirectUrl = normalizeRedirectUrl(payload.redirectUrl)
    if (!shopId) throw new HttpError(400, "shopId is required.")

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) throw new HttpError(401, "Missing Authorization header.")

    const supabaseUrl = getEnvStrict("SUPABASE_URL")
    const serviceRoleKey = getEnvStrict("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = getEnvStrict("SUPABASE_ANON_KEY")
    const paystackSecret = getEnvStrict("PAYSTACK_SECRET_KEY", "sk_test_dummy")

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()
    if (authError || !user) throw new HttpError(401, "Unauthorized.")

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("id, owner_id, name, is_verified, kyc_status, is_subscription_active, subscription_end_date")
      .eq("id", shopId)
      .eq("owner_id", user.id)
      .maybeSingle<ShopRecord>()

    if (shopError) throw new HttpError(500, `Failed to validate shop ownership: ${shopError.message}`)
    if (!shop) throw new HttpError(403, "Shop not found or access denied.")

    if (!(shop.is_verified || shop.kyc_status === "approved")) {
      throw new HttpError(409, "Your shop must be physically verified before a service plan can be activated.")
    }

    if (shop.is_subscription_active && isFutureDate(shop.subscription_end_date)) {
      throw new HttpError(409, "Your shop already has an active subscription.")
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
        amount: PLAN_OPTIONS[plan].amount * 100,
        currency: "NGN",
        reference,
        callback_url: redirectUrl,
        metadata: {
          shopId: shop.id,
          merchantId: user.id,
          shopName: shop.name || "CTMerchant Shop",
          plan,
          purpose: "service_fee",
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
      plan,
    })
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }

    const message = error instanceof Error ? error.message : "Unexpected server error."
    return jsonResponse({ error: message }, 500)
  }
})
