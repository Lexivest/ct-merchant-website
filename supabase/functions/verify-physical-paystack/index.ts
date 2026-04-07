import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const EXPECTED_FEE_NAIRA = 5000
const PAYSTACK_VERIFY_BASE_URL = "https://api.paystack.co/transaction/verify"
const ALLOWED_GATEWAYS = new Set(["promo", "paystack"])

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type VerifyRequest = {
  transactionId?: string
  gateway?: string
  shopId?: number | string
}

type ShopRecord = {
  id: number
  owner_id: string
  name: string | null
  city_id: number | null
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

function normalizeTxId(input: unknown) {
  const txId = String(input || "").trim()
  if (!txId) throw new HttpError(400, "transactionId is required.")
  if (txId.length > 200) throw new HttpError(400, "transactionId is too long.")
  if (!/^[A-Za-z0-9._:-]+$/.test(txId)) {
    throw new HttpError(400, "transactionId contains invalid characters.")
  }
  return txId
}

function normalizeGateway(input: unknown) {
  const gateway = String(input || "").trim().toLowerCase()
  if (!ALLOWED_GATEWAYS.has(gateway)) {
    throw new HttpError(400, "Invalid payment gateway provided.")
  }
  return gateway
}

function normalizePromoCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
}

function parseAmountToKobo(value: unknown) {
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber)) return null
  if (asNumber <= 0) return null

  // Most providers return amount in kobo for NGN.
  return Math.round(asNumber)
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
    const payload = (await req.json()) as VerifyRequest
    console.log("[verify-payment] request", {
      rawGateway: payload?.gateway ?? null,
      rawShopId: payload?.shopId ?? null,
      hasTransactionId: Boolean(payload?.transactionId),
    })
    const gateway = normalizeGateway(payload.gateway)
    const transactionId = normalizeTxId(payload.transactionId)
    const shopId = toPositiveInt(payload.shopId)
    if (!shopId) throw new HttpError(400, "shopId is required.")

    const authHeader = req.headers.get("Authorization")
    console.log("[verify-payment] auth header", {
      hasAuthHeader: Boolean(authHeader),
      authPreview: authHeaderPreview(authHeader),
    })
    if (!authHeader) throw new HttpError(401, "Missing Authorization header.")

    const supabaseUrl = getEnvStrict("SUPABASE_URL")
    const serviceRoleKey = getEnvStrict("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = getEnvStrict("SUPABASE_ANON_KEY")
    console.log("[verify-payment] env", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasAnonKey: Boolean(anonKey),
      gateway,
      shopId,
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()
    console.log("[verify-payment] getUser", {
      hasUser: Boolean(user),
      userId: user?.id ?? null,
      authError: authError ? safeErrorMessage(authError) : null,
    })
    if (authError || !user) throw new HttpError(401, "Unauthorized.")

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("id, owner_id, name, city_id")
      .eq("id", shopId)
      .eq("owner_id", user.id)
      .maybeSingle<ShopRecord>()
    console.log("[verify-payment] shop lookup", {
      foundShop: Boolean(shop),
      shopId: shop?.id ?? null,
      ownerId: shop?.owner_id ?? null,
      shopError: shopError ? safeErrorMessage(shopError) : null,
    })

    if (shopError) throw new HttpError(500, `Failed to validate shop ownership: ${shopError.message}`)
    if (!shop) throw new HttpError(403, "Shop not found or access denied.")

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("full_name, cities(name)")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string | null; cities?: { name: string | null } | null }>()
    console.log("[verify-payment] profile lookup", {
      hasProfile: Boolean(profile),
      profileError: profileError ? safeErrorMessage(profileError) : null,
    })

    if (profileError) throw new HttpError(500, `Failed to load merchant profile: ${profileError.message}`)

    const merchantName = profile?.full_name || "Merchant"
    const cityName = profile?.cities?.name || "Unknown City"
    const shopName = shop.name || "Unknown Shop"
    const paymentRef = `${gateway.toUpperCase()}_${transactionId}`

    // Idempotency guard.
    const { data: existingPayment, error: existingPaymentError } = await adminClient
      .from("physical_verification_payments")
      .select("id, status")
      .eq("payment_ref", paymentRef)
      .maybeSingle<{ id: number; status: string }>()
    console.log("[verify-payment] payment_ref lookup", {
      paymentRef,
      hasExistingPayment: Boolean(existingPayment),
      existingStatus: existingPayment?.status ?? null,
      existingPaymentError: existingPaymentError ? safeErrorMessage(existingPaymentError) : null,
    })

    if (existingPaymentError) {
      throw new HttpError(500, `Failed to check existing payment: ${existingPaymentError.message}`)
    }

    if (existingPayment?.status === "success") {
      return jsonResponse({ success: true, idempotent: true, message: "Payment already verified." })
    }

    let verified = false
    let finalAmount = EXPECTED_FEE_NAIRA

    if (gateway === "promo") {
      const code = normalizePromoCode(transactionId)
      if (code.length !== 6) throw new HttpError(400, "Promo code must be 6 alphanumeric characters.")

      // Atomic redemption (single statement update with is_used=false predicate).
      const { data: redeemedCode, error: redeemError } = await adminClient
        .from("promo_codes")
        .update({
          is_used: true,
          used_by: user.id,
          used_at: new Date().toISOString(),
        })
        .eq("code", code)
        .eq("is_used", false)
        .select("id")
        .maybeSingle<{ id: number }>()

      if (redeemError) {
        throw new HttpError(500, `Failed to redeem promo code: ${redeemError.message}`)
      }
      if (!redeemedCode) throw new HttpError(409, "Invalid or already used promo code.")

      verified = true
      finalAmount = 0
    } else if (gateway === "paystack") {
      const devBypassEnabled =
        Deno.env.get("ALLOW_DEV_TEST_BYPASS") === "true" && !isLikelyProduction()

      if (devBypassEnabled && transactionId.startsWith("DEV-TEST")) {
        verified = true
      } else {
        const paystackSecret = getEnvStrict("PAYSTACK_SECRET_KEY", "sk_test_dummy")
        const paystackRes = await fetch(`${PAYSTACK_VERIFY_BASE_URL}/${encodeURIComponent(transactionId)}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${paystackSecret}` },
        })
        console.log("[verify-payment] paystack response", {
          transactionId,
          status: paystackRes.status,
          ok: paystackRes.ok,
        })

        if (!paystackRes.ok) {
          throw new HttpError(502, `Paystack verify request failed (${paystackRes.status}).`)
        }

        const paystackData = await paystackRes.json()
        const statusOk = paystackData?.status === true && paystackData?.data?.status === "success"
        const amountKobo = parseAmountToKobo(paystackData?.data?.amount)
        const currency = String(paystackData?.data?.currency || "").toUpperCase()
        const customerEmail = String(paystackData?.data?.customer?.email || "").toLowerCase()
        const reference = String(paystackData?.data?.reference || "")

        const expectedKobo = EXPECTED_FEE_NAIRA * 100
        const amountMatches = amountKobo === expectedKobo
        const currencyMatches = currency === "NGN"
        const emailMatches = !!user.email && customerEmail === user.email.toLowerCase()
        const referenceMatches = reference === transactionId
        console.log("[verify-payment] paystack checks", {
          statusOk,
          amountKobo,
          expectedKobo,
          amountMatches,
          currency,
          currencyMatches,
          customerEmail,
          expectedEmail: user.email?.toLowerCase?.() || null,
          emailMatches,
          reference,
          transactionId,
          referenceMatches,
        })

        if (!statusOk || !amountMatches || !currencyMatches || !emailMatches || !referenceMatches) {
          throw new HttpError(400, "Paystack verification failed strict checks.")
        }
        verified = true
      }
    }

    if (!verified) throw new HttpError(400, "Payment could not be verified.")

    const { error: insertError } = await adminClient
      .from("physical_verification_payments")
      .insert({
        merchant_id: user.id,
        merchant_name: merchantName,
        shop_name: shopName,
        city: cityName,
        amount: finalAmount,
        payment_ref: paymentRef,
        status: "success",
      })
    console.log("[verify-payment] insert result", {
      paymentRef,
      insertError: insertError ? safeErrorMessage(insertError) : null,
      finalAmount,
      gateway,
    })

    if (insertError) {
      // Unique-constraint conflict can happen in races; treat as idempotent success.
      if (String(insertError.code) === "23505") {
        return jsonResponse({ success: true, idempotent: true, message: "Payment already recorded." })
      }
      throw new HttpError(500, `Database insert failed: ${insertError.message}`)
    }

    return jsonResponse({ success: true, message: "Payment verified and receipt generated." })
  } catch (error) {
    console.log("[verify-payment] failed", {
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
