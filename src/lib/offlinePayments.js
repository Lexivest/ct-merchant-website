import { supabase } from "./supabase"
import { UPLOAD_RULES, getRuleLabel, isMimeAllowed } from "./uploadRules"

export const PAYMENT_RECEIPT_RULE = UPLOAD_RULES.paymentReceipts

export function getPaymentReceiptRuleLabel() {
  return getRuleLabel(PAYMENT_RECEIPT_RULE)
}

export function formatNaira(amount) {
  return `N${Number(amount || 0).toLocaleString()}`
}

export function getProofStatusCopy(status) {
  if (status === "approved") {
    return {
      title: "Payment confirmed",
      message: "Your payment has been confirmed by CTMerchant staff.",
      tone: "success",
    }
  }

  if (status === "rejected") {
    return {
      title: "Receipt needs attention",
      message: "Your receipt was not approved. Please review the note and upload a clearer proof.",
      tone: "danger",
    }
  }

  return {
    title: "Receipt submitted",
    message: "We have received your proof of payment. Confirmation can take up to 48 hours.",
    tone: "pending",
  }
}

export function getReceiptPublicUrl(path) {
  if (!path) return ""
  return supabase.storage.from(PAYMENT_RECEIPT_RULE.bucket).getPublicUrl(path).data.publicUrl
}

function parseDateValue(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function belongsToCurrentShopLifecycle(record, shopCreatedAt) {
  if (!record) return false
  if (!shopCreatedAt) return true

  const recordDate = parseDateValue(record.created_at)
  const shopDate = parseDateValue(shopCreatedAt)

  if (!recordDate || !shopDate) return true
  return recordDate.getTime() >= shopDate.getTime()
}

export function isFutureDate(value) {
  const parsed = parseDateValue(value)
  return Boolean(parsed && parsed.getTime() > Date.now())
}

async function fetchOwnedPaymentShop({ userId, shopId }) {
  if (!userId) throw new Error("Session unavailable. Please sign in again.")
  if (!shopId) throw new Error("Shop ID is missing.")

  const { data, error } = await supabase
    .from("shops")
    .select("id, owner_id, name, status, is_verified, kyc_status, created_at, subscription_end_date, subscription_plan")
    .eq("id", shopId)
    .eq("owner_id", userId)
    .maybeSingle()

  if (error) {
    console.error("Fetch payment shop failed:", error)
    throw new Error("Could not confirm this shop payment status.")
  }

  if (!data) throw new Error("Shop not found or access denied.")
  return data
}

export async function uploadPaymentReceipt({ file, userId, shopId, paymentKind }) {
  if (!file) throw new Error("Please select a receipt image or PDF.")
  if (!userId) throw new Error("Session unavailable. Please sign in again.")
  if (!shopId) throw new Error("Shop ID is missing.")

  if (file.size > PAYMENT_RECEIPT_RULE.maxBytes) {
    throw new Error(`Receipt is too large. ${getPaymentReceiptRuleLabel()}.`)
  }

  if (!isMimeAllowed(PAYMENT_RECEIPT_RULE, file.type)) {
    throw new Error(`Receipt type is not supported. ${getPaymentReceiptRuleLabel()}.`)
  }

  // Sanitize kind for path safety
  const safeKind = String(paymentKind || "payment").toLowerCase().replace(/[^a-z0-9_-]/g, "")
  const extension = file.name?.includes(".")
    ? file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")
    : file.type.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "upload"
  
  const path = `${userId}/${shopId}/${safeKind}_${Date.now()}.${extension}`

  const { error } = await supabase.storage
    .from(PAYMENT_RECEIPT_RULE.bucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    })

  if (error) {
    console.error("Storage upload failed:", error)
    throw new Error("Could not upload receipt. Please check your network and try again.")
  }

  return {
    path,
    url: getReceiptPublicUrl(path),
  }
}

export async function fetchLatestPaymentProof({
  userId,
  shopId,
  paymentKind,
  plan,
  shopCreatedAt = null,
}) {
  if (!userId || !shopId || !paymentKind) return null

  let query = supabase
    .from("offline_payment_proofs")
    .select("*")
    .eq("merchant_id", userId)
    .eq("shop_id", shopId)
    .eq("payment_kind", paymentKind)
    .order("created_at", { ascending: false })
    .limit(1)

  if (typeof plan === "string" && plan.trim()) {
    query = query.eq("plan", plan)
  } else if (plan === null) {
    query = query.is("plan", null)
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    console.error("Fetch latest proof failed:", error)
    return null
  }

  if (!belongsToCurrentShopLifecycle(data, shopCreatedAt)) {
    return null
  }

  return data || null
}

export async function fetchVerificationAccessStatus({
  userId,
  shopId,
  paymentKind = "physical_verification",
  shopCreatedAt = null,
}) {
  if (!userId || !shopId) {
    return {
      paymentRecord: null,
      latestProof: null,
      verificationProofStatus: null,
      hasVerificationAccess: false,
      paymentConfirmed: false,
    }
  }

  const [{ data: paymentRecord, error: paymentError }, latestProof] =
    await Promise.all([
      supabase
        .from("physical_verification_payments")
        .select("id, payment_ref, created_at")
        .eq("merchant_id", userId)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchLatestPaymentProof({
        userId,
        shopId,
        paymentKind,
        plan: null,
        shopCreatedAt,
      }),
    ])

  if (paymentError) {
    console.error("Fetch verification payment status failed:", paymentError)
    throw new Error("Could not confirm verification payment status.")
  }

  // Physical verification is a one-time merchant payment.
  // A confirmed record stays valid even if the merchant later edits or recreates a shop.
  const currentPaymentRecord = paymentRecord || null
  const verificationProofStatus =
    latestProof?.status || (currentPaymentRecord ? "approved" : null)
  const hasVerificationAccess =
    Boolean(currentPaymentRecord) ||
    verificationProofStatus === "pending" ||
    verificationProofStatus === "approved"
  const paymentConfirmed =
    Boolean(currentPaymentRecord) || verificationProofStatus === "approved"

  return {
    paymentRecord: currentPaymentRecord || null,
    latestProof,
    verificationProofStatus,
    hasVerificationAccess,
    paymentConfirmed,
  }
}

export async function assertCanSubmitPaymentProof({
  userId,
  shopId,
  paymentKind,
  plan = null,
}) {
  const shop = await fetchOwnedPaymentShop({ userId, shopId })

  if (paymentKind === "physical_verification") {
    if (shop.status !== "approved") {
      throw new Error("Your shop must be digitally approved before physical verification payment.")
    }

    if (shop.is_verified || shop.kyc_status === "approved") {
      throw new Error("This shop has already completed physical verification.")
    }

    const verificationAccess = await fetchVerificationAccessStatus({
      userId,
      shopId,
      shopCreatedAt: shop.created_at,
    })

    if (verificationAccess.paymentConfirmed) {
      throw new Error("Your verification payment is already confirmed. Continue to video KYC.")
    }

    if (verificationAccess.latestProof?.status === "pending") {
      throw new Error("A verification receipt is already awaiting staff review.")
    }

    return {
      shop,
      latestProof: verificationAccess.latestProof,
      verificationAccess,
    }
  }

  if (paymentKind === "service_fee") {
    if (!(shop.is_verified || shop.kyc_status === "approved")) {
      throw new Error("Your shop must be physically verified before service fee payment.")
    }

    if (isFutureDate(shop.subscription_end_date)) {
      throw new Error("This shop already has an active subscription.")
    }

    const [latestAnyServiceProof, latestSelectedPlanProof] = await Promise.all([
      fetchLatestPaymentProof({
        userId,
        shopId,
        paymentKind: "service_fee",
        shopCreatedAt: shop.created_at,
      }),
      plan
        ? fetchLatestPaymentProof({
            userId,
            shopId,
            paymentKind: "service_fee",
            plan,
            shopCreatedAt: shop.created_at,
          })
        : Promise.resolve(null),
    ])

    if (latestAnyServiceProof?.status === "pending") {
      throw new Error("A service fee receipt is already awaiting staff review.")
    }

    return {
      shop,
      latestProof: latestSelectedPlanProof || latestAnyServiceProof,
    }
  }

  throw new Error("Unsupported payment type.")
}

function getPaymentProofInsertMessage(error) {
  const message = String(error?.message || "")
  const code = String(error?.code || "")

  if (
    code === "23505" ||
    message.includes("idx_offline_payment_proofs_one_pending") ||
    message.includes("offline_payment_proofs_one_pending_service_shop_uidx")
  ) {
    return "A payment receipt is already awaiting staff review."
  }

  const safeMessages = [
    "Payment proof merchant mismatch.",
    "Payment proof does not belong to the shop owner.",
    "Shop must be digitally approved before physical verification payment proof can be submitted.",
    "Shop must be physically verified before service fee payment proof can be submitted.",
    "Verification payment is already confirmed for this merchant.",
    "This shop has already completed physical verification.",
    "This shop already has an active subscription.",
    "A payment receipt is already awaiting staff review.",
    "Invalid service fee plan.",
    "Payment amount must match the selected payment type.",
    "Payment receipt file not found.",
  ]

  return safeMessages.find((safeMessage) => message.includes(safeMessage)) || ""
}

export async function createPaymentProof({
  user,
  shopId,
  paymentKind,
  plan = null,
  amount,
  merchantName = "",
  shopName = "",
  depositorName = "",
  transferReference = "",
  receiptPath,
  receiptUrl,
}) {
  if (!user?.id) throw new Error("Session unavailable. Please sign in again.")

  let insertError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await supabase
      .from("offline_payment_proofs")
      .insert({
        merchant_id: user.id,
        merchant_email: user.email || null,
        merchant_name: merchantName || user.user_metadata?.full_name || "Merchant",
        shop_id: Number(shopId),
        shop_name: shopName || null,
        payment_kind: paymentKind,
        plan,
        amount: Number(amount),
        depositor_name: depositorName.trim() || null,
        transfer_reference: transferReference.trim() || null,
        receipt_path: receiptPath,
        receipt_url: receiptUrl,
        status: "pending",
      })
      .select("*")
      .single()

    if (!error) return data
    const insertMessage = getPaymentProofInsertMessage(error)
    if (insertMessage) {
      console.error("Create payment proof rejected:", error)
      throw new Error(insertMessage)
    }

    insertError = error
    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
  }

  console.error("Create payment proof failed after retries:", insertError)
  throw new Error("We could not save your payment proof. Please contact support if the issue persists.")
}
