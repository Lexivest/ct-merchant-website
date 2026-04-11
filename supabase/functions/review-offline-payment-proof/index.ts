import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const PHYSICAL_VERIFICATION_FEE = 5000
const PLAN_OPTIONS = {
  "6_Months": { amount: 6000, monthsToAdd: 6, label: "6 Months" },
  "1_Year": { amount: 10000, monthsToAdd: 12, label: "1 Year" },
} as const

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type ReviewRequest = {
  proofId?: number | string
  action?: string
  note?: string
}

type OfflinePaymentProof = {
  id: number
  merchant_id: string
  shop_id: number
  payment_kind: "physical_verification" | "service_fee"
  plan: keyof typeof PLAN_OPTIONS | null
  amount: number
  status: "pending" | "approved" | "rejected"
}

type ShopRecord = {
  id: number
  owner_id: string
  name: string | null
  is_verified: boolean | null
  kyc_status: string | null
  subscription_end_date: string | null
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

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const errorLike = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
    }
    const parts = [
      errorLike.message,
      errorLike.details,
      errorLike.hint,
      errorLike.code,
    ]
      .map((part) => String(part || "").trim())
      .filter(Boolean)

    if (parts.length) return parts.join(" ")
  }
  return String(error || "")
}

function toPositiveInt(value: unknown) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return null
  return Math.trunc(raw)
}

function normalizeAction(value: unknown) {
  const action = String(value || "").trim().toLowerCase()
  if (action !== "approve" && action !== "reject") {
    throw new HttpError(400, "Invalid review action.")
  }
  return action
}

function normalizeNote(value: unknown) {
  return String(value || "").trim().slice(0, 500)
}

function addMonths(baseDate: Date, months: number) {
  const next = new Date(baseDate)
  next.setMonth(next.getMonth() + months)
  return next
}

function getExpectedAmount(proof: OfflinePaymentProof) {
  if (proof.payment_kind === "physical_verification") return PHYSICAL_VERIFICATION_FEE

  const plan = proof.plan ? PLAN_OPTIONS[proof.plan] : null
  if (!plan) throw new HttpError(400, "Invalid subscription plan on payment proof.")
  return plan.amount
}

function isMissingColumnError(error: unknown, columnName: string) {
  let serialized = ""
  try {
    serialized = JSON.stringify(error)
  } catch {
    serialized = ""
  }

  const message = `${safeErrorMessage(error)} ${serialized}`.toLowerCase()
  return message.includes("column") && message.includes(columnName.toLowerCase())
}

function getMissingColumnName(error: unknown) {
  const message = safeErrorMessage(error)
  const quotedMatch = message.match(/'([^']+)' column/i)
  if (quotedMatch?.[1]) return quotedMatch[1]

  const columnMatch = message.match(/column\s+["']?([a-zA-Z0-9_]+)["']?/i)
  if (columnMatch?.[1]) return columnMatch[1]

  return ""
}

async function insertWithMissingColumnRetries(
  adminClient: ReturnType<typeof createClient>,
  tableName: string,
  payload: Record<string, unknown>,
  optionalColumns: string[],
) {
  let nextPayload = { ...payload }
  let lastError: unknown = null

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { error } = await adminClient.from(tableName).insert(nextPayload)
    if (!error) return null
    if (String(error.code) === "23505") return error

    lastError = error
    const missingColumn = getMissingColumnName(error)
    if (!missingColumn || !optionalColumns.includes(missingColumn)) {
      return error
    }

    const { [missingColumn]: _removed, ...rest } = nextPayload
    nextPayload = rest
  }

  return lastError
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const payload = (await req.json()) as ReviewRequest
    const proofId = toPositiveInt(payload?.proofId)
    const action = normalizeAction(payload?.action)
    const note = normalizeNote(payload?.note)

    if (!proofId) throw new HttpError(400, "proofId is required.")
    if (action === "reject" && !note) {
      throw new HttpError(400, "A rejection note is required.")
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) throw new HttpError(401, "Missing Authorization header.")

    const supabaseUrl = getEnvStrict("SUPABASE_URL")
    const serviceRoleKey = getEnvStrict("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = getEnvStrict("SUPABASE_ANON_KEY")
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()

    if (authError || !user) throw new HttpError(401, "Unauthorized.")

    const { data: staffProfile, error: staffError } = await adminClient
      .from("staff_profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle<{ id: string; full_name: string | null }>()

    if (staffError) throw new HttpError(500, `Failed to validate staff access: ${staffError.message}`)
    if (!staffProfile) throw new HttpError(403, "Staff access required.")

    const { data: proof, error: proofError } = await adminClient
      .from("offline_payment_proofs")
      .select("id, merchant_id, shop_id, payment_kind, plan, amount, status")
      .eq("id", proofId)
      .maybeSingle<OfflinePaymentProof>()

    if (proofError) throw new HttpError(500, `Failed to load payment proof: ${proofError.message}`)
    if (!proof) throw new HttpError(404, "Payment proof not found.")

    if (proof.status !== "pending") {
      return jsonResponse({
        success: true,
        idempotent: true,
        status: proof.status,
        message: `Payment proof is already ${proof.status}.`,
      })
    }

    if (action === "reject") {
      const { error: rejectError } = await adminClient
        .from("offline_payment_proofs")
        .update({
          status: "rejected",
          review_note: note,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", proof.id)
        .eq("status", "pending")

      if (rejectError) throw new HttpError(500, `Failed to reject proof: ${rejectError.message}`)

      return jsonResponse({
        success: true,
        status: "rejected",
        message: "Payment proof rejected.",
      })
    }

    const expectedAmount = getExpectedAmount(proof)
    if (Number(proof.amount) !== expectedAmount) {
      throw new HttpError(409, `Proof amount does not match the expected amount of NGN ${expectedAmount}.`)
    }

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("id, owner_id, name, is_verified, kyc_status, subscription_end_date, city_id")
      .eq("id", proof.shop_id)
      .maybeSingle<ShopRecord>()

    if (shopError) throw new HttpError(500, `Failed to load shop: ${shopError.message}`)
    if (!shop) throw new HttpError(404, "Shop not found.")
    if (shop.owner_id !== proof.merchant_id) {
      throw new HttpError(409, "Payment proof does not match the current shop owner.")
    }

    const paymentRef = `OFFLINE_${proof.id}`

    if (proof.payment_kind === "physical_verification") {
      const { data: existingPhysical, error: existingPhysicalError } = await adminClient
        .from("physical_verification_payments")
        .select("id, payment_ref")
        .eq("merchant_id", proof.merchant_id)
        .eq("status", "success")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: number; payment_ref: string | null }>()

      if (existingPhysicalError) {
        throw new HttpError(500, `Failed to check existing physical payment: ${existingPhysicalError.message}`)
      }

      if (!existingPhysical) {
        const { data: profile, error: profileError } = await adminClient
          .from("profiles")
          .select("full_name, cities(name)")
          .eq("id", proof.merchant_id)
          .maybeSingle<{ full_name: string | null; cities?: { name: string | null } | null }>()

        if (profileError) throw new HttpError(500, `Failed to load merchant profile: ${profileError.message}`)

        const { error: insertError } = await adminClient
          .from("physical_verification_payments")
          .insert({
            merchant_id: proof.merchant_id,
            merchant_name: profile?.full_name || "Merchant",
            shop_name: shop.name || "Unknown Shop",
            city: profile?.cities?.name || "Unknown City",
            amount: expectedAmount,
            payment_ref: paymentRef,
            status: "success",
          })

        if (insertError && String(insertError.code) !== "23505") {
          throw new HttpError(500, `Failed to record physical payment: ${insertError.message}`)
        }
      }

      const finalPaymentRef = existingPhysical?.payment_ref || paymentRef
      const { error: approveError } = await adminClient
        .from("offline_payment_proofs")
        .update({
          status: "approved",
          review_note: note || "Payment confirmed by staff.",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          approval_payment_ref: finalPaymentRef,
        })
        .eq("id", proof.id)
        .eq("status", "pending")

      if (approveError) throw new HttpError(500, `Failed to approve proof: ${approveError.message}`)

      return jsonResponse({
        success: true,
        status: "approved",
        paymentRef: finalPaymentRef,
        message: "Physical verification payment approved.",
      })
    }

    if (!(shop.is_verified || shop.kyc_status === "approved")) {
      throw new HttpError(409, "Shop must be physically verified before subscription payment can be approved.")
    }

    const planKey = proof.plan as keyof typeof PLAN_OPTIONS
    const planOption = PLAN_OPTIONS[planKey]
    if (!planOption) throw new HttpError(400, "Invalid subscription plan on payment proof.")

    const subscriptionEndDate = addMonths(new Date(), planOption.monthsToAdd).toISOString()

    let { error: updateShopError } = await adminClient
      .from("shops")
      .update({
        subscription_plan: planKey,
        subscription_end_date: subscriptionEndDate,
        is_subscription_active: true,
      })
      .eq("id", shop.id)
      .eq("owner_id", proof.merchant_id)

    if (updateShopError && isMissingColumnError(updateShopError, "is_subscription_active")) {
      const fallbackUpdate = await adminClient
        .from("shops")
        .update({
          subscription_plan: planKey,
          subscription_end_date: subscriptionEndDate,
        })
        .eq("id", shop.id)
        .eq("owner_id", proof.merchant_id)

      updateShopError = fallbackUpdate.error
    }

    if (updateShopError) throw new HttpError(500, `Failed to activate subscription: ${updateShopError.message}`)

    const serviceReceiptPayload = {
      merchant_id: proof.merchant_id,
      shop_id: shop.id,
      amount: expectedAmount,
      plan: planKey,
      payment_ref: paymentRef,
      status: "success",
    }

    const serviceInsertError = await insertWithMissingColumnRetries(
      adminClient,
      "service_fee_payments",
      serviceReceiptPayload,
      ["status"],
    )

    if (serviceInsertError && String(serviceInsertError.code) !== "23505") {
      throw new HttpError(500, `Failed to record subscription payment: ${serviceInsertError.message}`)
    }

    const { error: approveError } = await adminClient
      .from("offline_payment_proofs")
      .update({
        status: "approved",
        review_note: note || "Payment confirmed by staff.",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        approval_payment_ref: paymentRef,
      })
      .eq("id", proof.id)
      .eq("status", "pending")

    if (approveError) throw new HttpError(500, `Failed to approve proof: ${approveError.message}`)

    return jsonResponse({
      success: true,
      status: "approved",
      paymentRef,
      plan: planKey,
      subscriptionEndDate,
      message: "Subscription payment approved and activated.",
    })
  } catch (error) {
    console.log("[review-offline-payment-proof] failed", {
      status: error instanceof HttpError ? error.status : 500,
      message: safeErrorMessage(error),
    })

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }

    return jsonResponse({ error: safeErrorMessage(error) || "Unexpected server error." }, 500)
  }
})
