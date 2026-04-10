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

  const extension = file.name?.includes(".")
    ? file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")
    : "upload"
  const safeKind = String(paymentKind || "payment").replace(/[^a-z0-9_-]/gi, "")
  const path = `${userId}/${shopId}/${safeKind}_${Date.now()}.${extension || "upload"}`

  const { error } = await supabase.storage
    .from(PAYMENT_RECEIPT_RULE.bucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    })

  if (error) throw error

  return {
    path,
    url: getReceiptPublicUrl(path),
  }
}

export async function fetchLatestPaymentProof({ userId, shopId, paymentKind, plan = null }) {
  if (!userId || !shopId || !paymentKind) return null

  let query = supabase
    .from("offline_payment_proofs")
    .select("*")
    .eq("merchant_id", userId)
    .eq("shop_id", shopId)
    .eq("payment_kind", paymentKind)
    .order("created_at", { ascending: false })
    .limit(1)

  query = plan ? query.eq("plan", plan) : query.is("plan", null)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data || null
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

  if (error) throw error
  return data
}
