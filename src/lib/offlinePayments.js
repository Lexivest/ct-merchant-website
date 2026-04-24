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
    insertError = error
    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
  }

  console.error("Create payment proof failed after retries:", insertError)
  throw new Error("We could not save your payment proof. Please contact support if the issue persists.")
}
