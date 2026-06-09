import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const PHYSICAL_VERIFICATION_FEE = 5000
const PLAN_OPTIONS = {
  "6_Months": { amount: 6000, label: "6 Months" },
  "1_Year":   { amount: 10000, label: "1 Year" },
} as const

// Staff may backdate a subscription to the date payment was actually received,
// but only up to this many days. Beyond it the review lag is treated as the
// platform's fault (payment hung in transit, settlement delay, review backlog)
// and the effective date is clamped to now, so a slow review never shortens the
// merchant's paid term.
const MAX_BACKDATE_DAYS = 7

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type ReviewRequest = {
  proofId?:    number | string
  action?:     string
  note?:       string
  effectiveAt?: string | null
}

type OfflinePaymentProof = {
  id:           number
  merchant_id:  string
  shop_id:      number
  payment_kind: "physical_verification" | "service_fee"
  plan:         keyof typeof PLAN_OPTIONS | null
  amount:       number
  status:       "pending" | "approved" | "rejected"
}

type ShopRecord = {
  id:                    number
  owner_id:              string
  name:                  string | null
  status:                string | null
  is_verified:           boolean | null
  kyc_status:            string | null
  subscription_end_date: string | null
  city_id:               number | null
  cities?:               { name: string | null } | null
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

function normalizeAction(value: unknown) {
  const action = String(value || "").trim().toLowerCase()
  if (action !== "approve" && action !== "reject") throw new HttpError(400, "Invalid review action.")
  return action
}

function normalizeNote(value: unknown) {
  return String(value || "").trim().slice(0, 500)
}

/**
 * Parse and validate the effectiveAt timestamp supplied by the caller.
 * Returns the parsed Date, or now() if the field was omitted/empty.
 * - Rejects future timestamps (>5-min tolerance).
 * - Clamps to now() when the date is more than MAX_BACKDATE_DAYS before now,
 *   so a long review lag (not the merchant's fault) never shortens their term.
 */
function normalizePaymentEffectiveAt(value: unknown): Date {
  const now = new Date()
  if (value === null || value === undefined || String(value).trim() === "") return now

  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, "Invalid payment date.")
  if (parsed.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new HttpError(400, "Payment date cannot be in the future.")
  }
  // Inclusive calendar-day cap: a gap of 7 full days still backdates; only a
  // gap that has rolled past the 7th day is clamped to now.
  const lagDays = Math.floor((now.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000))
  if (lagDays > MAX_BACKDATE_DAYS) return now

  return parsed
}

function getExpectedAmount(proof: OfflinePaymentProof) {
  if (proof.payment_kind === "physical_verification") return PHYSICAL_VERIFICATION_FEE
  const plan = proof.plan ? PLAN_OPTIONS[proof.plan] : null
  if (!plan) throw new HttpError(400, "Invalid subscription plan on payment proof.")
  return plan.amount
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const payload      = (await req.json()) as ReviewRequest
    const proofId      = toPositiveInt(payload?.proofId)
    const action       = normalizeAction(payload?.action)
    const note         = normalizeNote(payload?.note)

    if (!proofId) throw new HttpError(400, "proofId is required.")
    if (action === "reject" && !note) throw new HttpError(400, "A rejection note is required.")

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

    // ── Staff / super-admin gate ──────────────────────────────────────────
    const { data: staffProfile } = await adminClient
      .from("staff_profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle()

    if (!staffProfile) throw new HttpError(403, "Staff access required.")

    const { data: adminProfile } = await adminClient
      .from("admins")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (adminProfile?.role !== "super_admin") {
      throw new HttpError(403, "Super admin access required.")
    }

    // ── Load proof ────────────────────────────────────────────────────────
    const { data: proof } = await adminClient
      .from("offline_payment_proofs")
      .select("id, merchant_id, shop_id, payment_kind, plan, amount, status")
      .eq("id", proofId)
      .maybeSingle<OfflinePaymentProof>()

    if (!proof) throw new HttpError(404, "Payment proof not found.")

    if (proof.status !== "pending") {
      return jsonResponse({
        success:   true,
        idempotent: true,
        status:    proof.status,
        message:   `Payment proof is already ${proof.status}.`,
      })
    }

    // ── Load shop (for pre-flight validation only — final state is locked inside RPC) ──
    const { data: shop } = await adminClient
      .from("shops")
      .select("id, owner_id, name, status, is_verified, kyc_status, subscription_end_date, city_id, cities(name)")
      .eq("id", proof.shop_id)
      .maybeSingle<ShopRecord>()

    if (!shop) throw new HttpError(404, "Shop not found.")
    if (shop.owner_id !== proof.merchant_id) {
      throw new HttpError(409, "Payment proof does not match the current shop owner.")
    }

    // ── Pre-flight checks (duplicated in RPC for defence-in-depth) ────────
    let expectedAmount  = 0
    let planKey:          keyof typeof PLAN_OPTIONS | null = null
    let merchantName      = "Merchant"
    const cityName        = shop.cities?.name || "Unknown City"
    let paymentEffectiveAt: Date | null = null

    if (action === "approve") {
      expectedAmount = getExpectedAmount(proof)

      if (Number(proof.amount) !== expectedAmount) {
        throw new HttpError(409, `Proof amount does not match the expected NGN ${expectedAmount}.`)
      }
      if (shop.status !== "approved") {
        throw new HttpError(409, "Shop must be digitally approved before payment can be approved.")
      }

      if (proof.payment_kind === "service_fee") {
        if (!(shop.is_verified || shop.kyc_status === "approved")) {
          throw new HttpError(409, "Shop must be physically verified before subscription can be approved.")
        }
        planKey = proof.plan as keyof typeof PLAN_OPTIONS

        // Parse the effectiveAt supplied by staff.
        // The subscription end date is intentionally NOT pre-computed here.
        // The RPC computes it atomically from the freshly-locked shop row,
        // eliminating any race between this read and the RPC's FOR UPDATE lock.
        paymentEffectiveAt = normalizePaymentEffectiveAt(payload?.effectiveAt)
      }

      if (proof.payment_kind === "physical_verification") {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("full_name, cities(name)")
          .eq("id", proof.merchant_id)
          .maybeSingle<{ full_name: string | null; cities?: { name: string | null } | null }>()

        if (profile?.full_name) merchantName = profile.full_name
      }
    }

    // ── Fire the atomic RPC ───────────────────────────────────────────────
    // p_new_end_date is intentionally omitted — the RPC now computes it from
    // p_payment_effective_at + the locked shop row, so there is no pre-computed
    // stale value that could be wrong under concurrent approvals.
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "process_offline_payment_review",
      {
        p_proof_id:             proof.id,
        p_staff_id:             user.id,
        p_action:               action,
        p_note:                 note || null,
        p_payment_ref:          `OFFLINE_${proof.id}`,
        p_amount:               expectedAmount,
        p_plan_key:             planKey,
        p_payment_effective_at: paymentEffectiveAt ? paymentEffectiveAt.toISOString() : null,
        p_merchant_name:        merchantName,
        p_shop_name:            shop.name || "Unknown Shop",
        p_city_name:            cityName,
      },
    )

    if (rpcError) throw new HttpError(500, `Database transaction failed: ${rpcError.message}`)

    return jsonResponse({
      ...(rpcResult && typeof rpcResult === "object" ? rpcResult : {}),
      paymentEffectiveAt: paymentEffectiveAt ? paymentEffectiveAt.toISOString() : null,
    })

  } catch (error) {
    console.log("[review-offline-payment-proof] failed", error)
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status)
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error." }, 500)
  }
})
