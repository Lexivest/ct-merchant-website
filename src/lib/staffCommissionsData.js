import { supabase } from "./supabase"
import { PAYMENT_RECEIPT_RULE, formatNaira } from "./offlinePayments"
import { getAcceptValue, getRuleLabel, isMimeAllowed } from "./uploadRules"

export const COMMISSION_RATE = 0.2
export const COMMISSION_RECEIPT_ACCEPT = getAcceptValue(PAYMENT_RECEIPT_RULE, "image/*,.pdf")
export const COMMISSION_RECEIPT_RULE_LABEL = getRuleLabel(PAYMENT_RECEIPT_RULE)

function pad2(value) {
  return String(value).padStart(2, "0")
}

function parseDateValue(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function getCurrentMonthInputValue() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
}

export function toMonthStartDate(monthInputValue) {
  const value = String(monthInputValue || "").trim()
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value.slice(0, 7)}-01`
  return `${getCurrentMonthInputValue()}-01`
}

export function toMonthInputValue(monthStart) {
  const value = String(monthStart || "")
  if (/^\d{4}-\d{2}/.test(value)) return value.slice(0, 7)
  return getCurrentMonthInputValue()
}

export function formatMonthLabel(monthStart) {
  const parsed = parseDateValue(`${toMonthStartDate(monthStart)}T12:00:00`)
  if (!parsed) return "Current Month"
  return parsed.toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  })
}

export function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`
}

export function formatCommissionFormula(row) {
  const subscription = Number(row?.subscription_total || 0)
  const verification = Number(row?.verification_total || 0)
  const rate = Number(row?.commission_rate || COMMISSION_RATE)
  const commission = Number(row?.commission_amount || 0)
  return `${formatNaira(subscription)} subscriptions + ${formatNaira(verification)} verification = ${formatNaira(subscription + verification)} x ${formatPercent(rate)} = ${formatNaira(commission)}`
}

export async function fetchStaffCommissionsOverview(monthStart = null) {
  const { data, error } = await supabase.rpc("ctm_get_staff_commission_summary", {
    p_month: monthStart ? toMonthStartDate(monthStart) : null,
  })

  if (error) throw error
  return data || null
}

function getSafeExtension(file) {
  const fromName = file?.name?.includes(".")
    ? file.name.split(".").pop().toLowerCase()
    : ""
  const fromType = file?.type?.split("/")?.[1] || ""
  return String(fromName || fromType || "receipt").replace(/[^a-z0-9]/gi, "").slice(0, 12) || "receipt"
}

export async function uploadCommissionReceipt({ file, userId, cityId, monthStart }) {
  if (!file) throw new Error("Please select the city admin payment receipt.")
  if (!userId) throw new Error("Staff session unavailable. Please sign in again.")
  if (!cityId) throw new Error("City is missing.")

  if (file.size > PAYMENT_RECEIPT_RULE.maxBytes) {
    throw new Error(`Receipt is too large. ${COMMISSION_RECEIPT_RULE_LABEL}.`)
  }

  if (!isMimeAllowed(PAYMENT_RECEIPT_RULE, file.type)) {
    throw new Error(`Receipt type is not supported. ${COMMISSION_RECEIPT_RULE_LABEL}.`)
  }

  const safeMonth = toMonthStartDate(monthStart)
  const extension = getSafeExtension(file)
  const path = `${userId}/commission-payouts/city-${Number(cityId)}/${safeMonth}_${Date.now()}.${extension}`

  const { error } = await supabase.storage
    .from(PAYMENT_RECEIPT_RULE.bucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    })

  if (error) {
    console.error("Commission receipt upload failed:", error)
    throw new Error("Could not upload commission receipt. Please check your network and try again.")
  }

  const publicUrl = supabase.storage.from(PAYMENT_RECEIPT_RULE.bucket).getPublicUrl(path).data.publicUrl

  return {
    path,
    url: publicUrl || path,
  }
}

export async function createCommissionReceiptSignedUrls(rows) {
  const entries = await Promise.all(
    (Array.isArray(rows) ? rows : [])
      .filter((row) => row?.receipt_path)
      .map(async (row) => {
        const { data, error } = await supabase.storage
          .from(PAYMENT_RECEIPT_RULE.bucket)
          .createSignedUrl(row.receipt_path, 60 * 30)

        return [row.city_id, error ? "" : data?.signedUrl || ""]
      })
  )

  return Object.fromEntries(entries)
}
