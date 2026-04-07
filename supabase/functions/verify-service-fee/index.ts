import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const PLAN_OPTIONS = {
  "6_Months": { amount: 6000, monthsToAdd: 6, label: "6 Months" },
  "1_Year": { amount: 10000, monthsToAdd: 12, label: "1 Year" },
} as const

const ALLOWED_GATEWAYS = new Set(["paystack", "remita"])
const PAYSTACK_VERIFY_BASE_URL = "https://api.paystack.co/transaction/verify"
const REMITA_VERIFY_BASE_URL = "https://remitademo.net/payment/v1/payment/query"

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
  plan?: keyof typeof PLAN_OPTIONS | string
  shopId?: number | string
}

type ShopRecord = {
  id: number
  owner_id: string
  name: string | null
  is_verified: boolean | null
  kyc_status: string | null
  subscription_end_date: string | null
  is_subscription_active: boolean | null
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

function normalizePlan(input: unknown) {
  const plan = String(input || "").trim() as keyof typeof PLAN_OPTIONS
  if (!plan || !(plan in PLAN_OPTIONS)) {
    throw new HttpError(400, "Invalid subscription plan.")
  }
  return plan
}

function parseAmountToKobo(value: unknown) {
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null
  return Math.round(asNumber)
}

async function sha512Hex(value: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)
  const hashBuffer = await crypto.subtle.digest("SHA-512", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function addMonths(baseDate: Date, months: number) {
  const next = new Date(baseDate)
  next.setMonth(next.getMonth() + months)
  return next
}

function chooseSubscriptionBaseDate(currentEndDate: string | null | undefined) {
  if (!currentEndDate) return new Date()
  const parsed = new Date(currentEndDate)
  if (Number.isNaN(parsed.getTime())) return new Date()
  return parsed.getTime() > Date.now() ? parsed : new Date()
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const payload = (await req.json()) as VerifyRequest
    console.log("[verify-service-fee] request", {
      rawGateway: payload?.gateway ?? null,
      rawPlan: payload?.plan ?? null,
      rawShopId: payload?.shopId ?? null,
      hasTransactionId: Boolean(payload?.transactionId),
    })
    const gateway = normalizeGateway(payload.gateway)
    const transactionId = normalizeTxId(payload.transactionId)
    const plan = normalizePlan(payload.plan)
    const shopId = toPositiveInt(payload.shopId)
    if (!shopId) throw new HttpError(400, "shopId is required.")

    const authHeader = req.headers.get("Authorization")
    console.log("[verify-service-fee] auth header", {
      hasAuthHeader: Boolean(authHeader),
      authPreview: authHeaderPreview(authHeader),
    })
    if (!authHeader) throw new HttpError(401, "Missing Authorization header.")

    const supabaseUrl = getEnvStrict("SUPABASE_URL")
    const serviceRoleKey = getEnvStrict("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = getEnvStrict("SUPABASE_ANON_KEY")
    console.log("[verify-service-fee] env", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasAnonKey: Boolean(anonKey),
      gateway,
      plan,
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
    console.log("[verify-service-fee] getUser", {
      hasUser: Boolean(user),
      userId: user?.id ?? null,
      authError: authError ? safeErrorMessage(authError) : null,
    })
    if (authError || !user) throw new HttpError(401, "Unauthorized.")

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("id, owner_id, name, is_verified, kyc_status, subscription_end_date, is_subscription_active")
      .eq("id", shopId)
      .eq("owner_id", user.id)
      .maybeSingle<ShopRecord>()
    console.log("[verify-service-fee] shop lookup", {
      foundShop: Boolean(shop),
      shopId: shop?.id ?? null,
      ownerId: shop?.owner_id ?? null,
      shopError: shopError ? safeErrorMessage(shopError) : null,
      isVerified: shop?.is_verified ?? null,
      kycStatus: shop?.kyc_status ?? null,
      subscriptionEndDate: shop?.subscription_end_date ?? null,
      isSubscriptionActive: shop?.is_subscription_active ?? null,
    })

    if (shopError) throw new HttpError(500, `Failed to validate shop ownership: ${shopError.message}`)
    if (!shop) throw new HttpError(403, "Shop not found or access denied.")

    if (!(shop.is_verified || shop.kyc_status === "approved")) {
      throw new HttpError(409, "Your shop must be physically verified before a service plan can be activated.")
    }

    const paymentRef = `${gateway.toUpperCase()}_${transactionId}`
    const { data: existingPayment, error: existingPaymentError } = await adminClient
      .from("service_fee_payments")
      .select("id, status")
      .eq("payment_ref", paymentRef)
      .maybeSingle<{ id: number; status: string }>()
    console.log("[verify-service-fee] existing payment lookup", {
      paymentRef,
      hasExistingPayment: Boolean(existingPayment),
      existingStatus: existingPayment?.status ?? null,
      existingPaymentError: existingPaymentError ? safeErrorMessage(existingPaymentError) : null,
    })

    if (existingPaymentError && !String(existingPaymentError.message || "").toLowerCase().includes("does not exist")) {
      throw new HttpError(500, `Failed to check existing payment: ${existingPaymentError.message}`)
    }

    if (existingPayment?.status === "success") {
      return jsonResponse({ success: true, idempotent: true, message: "Subscription already verified." })
    }

    let verified = false
    const planOption = PLAN_OPTIONS[plan]

    if (gateway === "paystack") {
      const paystackSecret = getEnvStrict("PAYSTACK_SECRET_KEY", "sk_test_dummy")
      const paystackRes = await fetch(`${PAYSTACK_VERIFY_BASE_URL}/${encodeURIComponent(transactionId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${paystackSecret}` },
      })
      console.log("[verify-service-fee] paystack response", {
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
      const expectedKobo = planOption.amount * 100
      const amountMatches = amountKobo === expectedKobo
      const currencyMatches = currency === "NGN"
      const emailMatches = !!user.email && customerEmail === user.email.toLowerCase()
      const referenceMatches = reference === transactionId
      console.log("[verify-service-fee] paystack checks", {
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
    } else {
      const merchantId = getEnvStrict("REMITA_MERCHANT_ID", "2547916")
      const secretKey = getEnvStrict("REMITA_SECRET_KEY", "1946")
      const publicKey = getEnvStrict("REMITA_PUBLIC_KEY")
      const hashHex = await sha512Hex(`${merchantId}${transactionId}${secretKey}`)

      const remitaRes = await fetch(`${REMITA_VERIFY_BASE_URL}/${encodeURIComponent(transactionId)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          publicKey,
          TXN_HASH: hashHex,
        },
      })

      if (!remitaRes.ok) {
        throw new HttpError(502, `Remita verify request failed (${remitaRes.status}).`)
      }

      const remitaData = await remitaRes.json()
      const status = String(remitaData?.status || "")
      const statusOk = status === "00" || status === "01"
      const amountRaw =
        remitaData?.amount ??
        remitaData?.data?.amount ??
        remitaData?.paymentDetails?.amount ??
        remitaData?.paymentState?.amount
      const amountNaira = Number(amountRaw)
      const amountMatches =
        Number.isFinite(amountNaira) && Math.round(amountNaira) === planOption.amount

      if (!statusOk || !amountMatches) {
        throw new HttpError(400, "Remita verification failed strict checks.")
      }

      verified = true
    }

    if (!verified) throw new HttpError(400, "Subscription payment could not be verified.")

    const baseDate = chooseSubscriptionBaseDate(shop.subscription_end_date)
    const subscriptionEndDate = addMonths(baseDate, planOption.monthsToAdd).toISOString()
    console.log("[verify-service-fee] activation target", {
      plan,
      amount: planOption.amount,
      monthsToAdd: planOption.monthsToAdd,
      baseDate: baseDate.toISOString(),
      subscriptionEndDate,
    })

    const { error: updateError } = await adminClient
      .from("shops")
      .update({
        subscription_plan: plan,
        is_subscription_active: true,
        subscription_end_date: subscriptionEndDate,
      })
      .eq("id", shop.id)
      .eq("owner_id", user.id)
    console.log("[verify-service-fee] shop update", {
      shopId: shop.id,
      updateError: updateError ? safeErrorMessage(updateError) : null,
    })

    if (updateError) {
      throw new HttpError(500, `Failed to activate subscription: ${updateError.message}`)
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string | null }>()

    const auditInsert = await adminClient.from("service_fee_payments").insert({
      merchant_id: user.id,
      merchant_name: profile?.full_name || "Merchant",
      shop_id: shop.id,
      shop_name: shop.name || "Unknown Shop",
      plan,
      amount: planOption.amount,
      payment_ref: paymentRef,
      status: "success",
      subscription_end_date: subscriptionEndDate,
    })
    console.log("[verify-service-fee] audit insert", {
      paymentRef,
      auditError: auditInsert.error ? safeErrorMessage(auditInsert.error) : null,
    })

    if (auditInsert.error) {
      console.log("[verify-service-fee] audit insert skipped", {
        message: auditInsert.error.message,
      })
    }

    return jsonResponse({
      success: true,
      message: "Subscription confirmed.",
      subscription_end_date: subscriptionEndDate,
      plan,
    })
  } catch (error) {
    console.log("[verify-service-fee] failed", {
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
