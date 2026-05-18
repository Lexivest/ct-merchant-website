import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const PLAN_OPTIONS = {
  "6_Months": { amount: 6000, label: "6 Months" },
  "1_Year":   { amount: 10000, label: "1 Year" },
} as const

type ManualPaymentKind = "physical_verification" | "service_fee"

type ManualPaymentRequest = {
  shopId?:       number | string
  paymentKind?:  ManualPaymentKind
  planKey?:      keyof typeof PLAN_OPTIONS | null
  paymentRef?:   string | null
  effectiveAt?:  string | null
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
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

function normalizePaymentKind(value: unknown): ManualPaymentKind {
  const kind = String(value || "").trim().toLowerCase()
  if (kind !== "physical_verification" && kind !== "service_fee") {
    throw new HttpError(400, "Invalid payment kind.")
  }
  return kind as ManualPaymentKind
}

function normalizePlanKey(value: unknown): keyof typeof PLAN_OPTIONS | null {
  const key = String(value || "").trim()
  if (key in PLAN_OPTIONS) return key as keyof typeof PLAN_OPTIONS
  return null
}

function normalizePaymentRef(value: unknown): string | null {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^A-Z0-9/_-]/gi, "")
    .toUpperCase()
    .slice(0, 80)
  return cleaned || null
}

function normalizePaymentEffectiveAt(value: unknown): Date {
  const now = new Date()
  if (value === null || value === undefined || String(value).trim() === "") return now

  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, "Invalid payment date.")
  if (parsed.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new HttpError(400, "Payment date cannot be in the future.")
  }
  return parsed
}

/**
 * Maps RPC error messages to appropriate HTTP status codes.
 * The RPC is the authoritative source of business rule validation,
 * so we just need to translate its exceptions into HTTP responses.
 */
function rpcErrorToHttpError(message: string): HttpError {
  if (message.includes("Super admin access required")) return new HttpError(403, message)
  if (message.includes("Shop not found"))              return new HttpError(404, message)
  if (
    message.includes("must be digitally approved") ||
    message.includes("must be physically verified") ||
    message.includes("Invalid payment kind") ||
    message.includes("Invalid subscription plan") ||
    message.includes("Payment date cannot be in the future")
  ) return new HttpError(409, message)
  return new HttpError(500, `Database transaction failed: ${message}`)
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const payload      = (await req.json()) as ManualPaymentRequest
    const shopId       = toPositiveInt(payload?.shopId)
    const paymentKind  = normalizePaymentKind(payload?.paymentKind)
    const planKey      = paymentKind === "service_fee" ? normalizePlanKey(payload?.planKey) : null
    const paymentRef   = normalizePaymentRef(payload?.paymentRef)
    const effectiveAt  = normalizePaymentEffectiveAt(payload?.effectiveAt)

    if (!shopId) throw new HttpError(400, "shopId is required.")
    if (paymentKind === "service_fee" && !planKey) {
      throw new HttpError(400, "A valid subscription plan is required.")
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) throw new HttpError(401, "Missing Authorization header.")

    const supabaseUrl    = getEnvStrict("SUPABASE_URL")
    const serviceRoleKey = getEnvStrict("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey        = getEnvStrict("SUPABASE_ANON_KEY")

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const authClient  = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) throw new HttpError(401, "Unauthorized.")

    // All DB work (authorization re-check, shop load, payment record creation,
    // notification) is handled atomically by record_manual_payment().
    // This eliminates the previous non-atomic multi-step approach where a failed
    // service_fee_payments insert could leave the shop subscription activated
    // without a corresponding ledger record.
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "record_manual_payment",
      {
        p_staff_id:     user.id,
        p_shop_id:      shopId,
        p_payment_kind: paymentKind,
        p_plan_key:     planKey,
        p_payment_ref:  paymentRef,
        p_effective_at: effectiveAt.toISOString(),
      },
    )

    if (rpcError) throw rpcErrorToHttpError(rpcError.message)

    return jsonResponse(rpcResult)

  } catch (error) {
    console.log("[staff-manual-payment-review] failed", error)
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status)
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error." }, 500)
  }
})
