import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaArrowUpRightFromSquare,
  FaBuildingColumns,
  FaCalendarDays,
  FaCircleCheck,
  FaCircleNotch,
  FaClock,
  FaLocationDot,
  FaMagnifyingGlass,
  FaPrint,
  FaReceipt,
  FaTriangleExclamation,
  FaWallet,
  FaWhatsapp,
  FaXmark,
} from "react-icons/fa6"
import InlineErrorState from "../../components/common/InlineErrorState"
import BrandText from "../../components/common/BrandText"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import ctmLogo from "../../assets/images/logo.jpg"
import { invokeEdgeFunctionAuthed } from "../../lib/edgeFunctions"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { formatNaira, PAYMENT_RECEIPT_RULE } from "../../lib/offlinePayments"
import { fetchStaffPaymentsOverview } from "../../lib/staffPaymentsData"
import { supabase } from "../../lib/supabase"
import { normalizeWhatsAppPhone, openWhatsAppConversation } from "../../lib/whatsapp"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
  useStaffPortalSession,
} from "./StaffPortalShared"

const PROOF_STATUS_FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
]

const CONTROL_FILTERS = [
  { key: "attention", label: "Needs Action" },
  { key: "receipt_pending", label: "Receipt Pending" },
  { key: "physical_due", label: "Physical Fee Due" },
  { key: "kyc_ready", label: "Ready For Video KYC" },
  { key: "video_pending", label: "Video Pending" },
  { key: "expired", label: "Expired Subscription" },
  { key: "expiring", label: "Expiring Soon" },
  { key: "all", label: "All Shops" },
]

const SERVICE_PLAN_OPTIONS = [
  { key: "6_Months", label: "6 Months", amount: 6000 },
  { key: "1_Year", label: "1 Year", amount: 10000 },
]

const COMPANY_DETAILS = {
  name: "CT Merchant LTD",
  website: "www.ctmerchant.com.ng",
  rcNumber: "RC: 8879163",
  email: "finance@ctmerchant.com.ng",
}

async function extractFunctionErrorMessage(error, fallback = "Action failed") {
  if (!error) return fallback
  const rawMessage = typeof error.message === "string" ? error.message : ""

  const context = error.context
  if (context && typeof context.clone === "function") {
    try {
      const asJson = await context.clone().json()
      if (asJson && typeof asJson.error === "string" && asJson.error.trim()) {
        return asJson.error
      }
    } catch {
      // Ignore non-JSON edge function error bodies.
    }

    try {
      const asText = await context.clone().text()
      if (asText && asText.trim()) return asText.trim()
    } catch {
      // Ignore non-text edge function error bodies.
    }
  }

  if (rawMessage && !rawMessage.includes("non-2xx")) return rawMessage
  return fallback
}

function getPaymentKindLabel(proof) {
  if (proof.payment_kind === "physical_verification") return "Physical Verification"
  if (proof.plan === "1_Year") return "Service Fee - 1 Year"
  return "Service Fee - 6 Months"
}

function getPlanLabel(plan) {
  if (plan === "1_Year") return "1 Year"
  return "6 Months"
}

function toDatetimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function parseServicePaymentDate(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Please enter a valid payment date and time.")
  }

  const now = new Date()
  if (parsed.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new Error("Payment date cannot be in the future.")
  }

  return parsed
}

function formatPaymentEffectiveDate(value) {
  return value ? formatDateTime(value) : formatDateTime(new Date().toISOString())
}

function getReceiptBusinessNoun(proof) {
  return proof?.is_service ? "service" : "shop"
}

function isSubscriptionReceipt(proof) {
  return proof?.payment_kind === "service_fee"
}

function getReceiptSubscriptionPlan(proof) {
  const plan = proof?.plan || proof?.subscription_plan_current || proof?.subscription_plan || ""
  if (plan === "1_Year") return "1 Year Plan"
  if (plan === "6_Months") return "6 Months Plan"
  return plan ? String(plan).replace(/_/g, " ") : "Subscription Plan"
}

function getReceiptSubscriptionExpiry(proof) {
  return proof?.subscription_end_date || proof?.subscriptionEndDate || null
}

function getReceiptSubscriptionExpiryLabel(proof) {
  const expiry = getReceiptSubscriptionExpiry(proof)
  return expiry ? formatDateTime(expiry) : "Updated after approval"
}

function getReceiptRenewalNote(proof) {
  return `Please renew before the expiry date to keep your ${getReceiptBusinessNoun(proof)} active in the CTMerchant market.`
}

function getReceiptNumber(proof) {
  return proof?.approval_payment_ref || proof?.transfer_reference || `OFFLINE_${proof?.id || "PENDING"}`
}

function getReceiptDate(proof) {
  return proof?.payment_effective_at || proof?.reviewed_at || proof?.updated_at || proof?.created_at || new Date().toISOString()
}

function getReceiptRecipientPhone(proof) {
  return proof?.shop_whatsapp || proof?.shop_phone || proof?.merchant_phone || ""
}

function buildReceiptMessage(proof) {
  const lines = [
    `Hello ${proof.merchant_name || "Merchant"},`,
    "",
    "Your CTMerchant payment has been confirmed.",
    "",
    `Receipt No: ${getReceiptNumber(proof)}`,
    `Payment: ${getPaymentKindLabel(proof)}`,
    `Shop: ${proof.shop_name || `Shop #${proof.shop_id}`}`,
    `Amount: ${formatNaira(proof.amount)}`,
    `Date: ${formatDateTime(getReceiptDate(proof))}`,
  ]

  if (isSubscriptionReceipt(proof)) {
    lines.push(
      `Subscription Plan: ${getReceiptSubscriptionPlan(proof)}`,
      `Subscription Expiry: ${getReceiptSubscriptionExpiryLabel(proof)}`,
      getReceiptRenewalNote(proof)
    )
  }

  lines.push("", COMPANY_DETAILS.name, COMPANY_DETAILS.website, COMPANY_DETAILS.rcNumber, COMPANY_DETAILS.email)

  return lines.join("\n")
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function openPrintableReceipt(proof) {
  if (typeof window === "undefined") return false

  const printWindow = window.open("", "_blank")
  if (!printWindow) return false

  const receiptNumber = getReceiptNumber(proof)
  const receiptDate = formatDateTime(getReceiptDate(proof))
  const paymentLabel = getPaymentKindLabel(proof)
  const shopName = proof.shop_name || `Shop #${proof.shop_id}`
  const merchantName = proof.merchant_name || "Merchant"
  const hasSubscriptionDetails = isSubscriptionReceipt(proof)
  const subscriptionPlan = getReceiptSubscriptionPlan(proof)
  const subscriptionExpiry = getReceiptSubscriptionExpiryLabel(proof)
  const renewalNote = getReceiptRenewalNote(proof)
  const brandReceiptHtml =
    '<span><span style="color:#db2777;">C</span><span style="color:#4c1d95;">T</span><span style="color:#2563eb;">M</span>erchant</span>'

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(receiptNumber)} - CTMerchant Receipt</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #eef2f7;
            color: #0f172a;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .sheet {
            width: min(860px, calc(100% - 32px));
            margin: 28px auto;
            background: #ffffff;
            border-radius: 28px;
            overflow: hidden;
            box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18);
          }
          .top {
            background: linear-gradient(135deg, #2e1065, #be185d);
            color: white;
            padding: 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
          }
          .brand { display: flex; align-items: center; gap: 16px; }
          .brand img {
            width: 70px;
            height: 70px;
            border-radius: 20px;
            border: 2px solid rgba(255,255,255,0.35);
            object-fit: cover;
            background: white;
          }
          .company { font-size: 30px; font-weight: 950; letter-spacing: -0.04em; }
          .meta { margin-top: 6px; font-size: 13px; font-weight: 750; opacity: 0.86; line-height: 1.55; }
          .paid {
            border: 1px solid rgba(255,255,255,0.35);
            border-radius: 999px;
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 950;
            text-transform: uppercase;
            background: rgba(255,255,255,0.14);
          }
          .body { padding: 34px; }
          .receipt-title {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 22px;
          }
          h1 { margin: 0; font-size: 34px; letter-spacing: -0.04em; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 24px; }
          .box { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 20px; padding: 18px; }
          .label { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; letter-spacing: 0.08em; }
          .value { margin-top: 8px; font-size: 17px; font-weight: 900; color: #0f172a; line-height: 1.45; }
          .amount {
            margin-top: 24px;
            border-radius: 24px;
            background: #0f172a;
            color: white;
            padding: 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
          }
          .amount .value { color: white; font-size: 36px; margin: 0; }
          .subscription {
            margin-top: 24px;
            border: 1px solid #bfdbfe;
            border-radius: 24px;
            background: linear-gradient(135deg, #eff6ff, #fdf2f8);
            padding: 22px;
          }
          .subscription-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          .renewal-note {
            margin-top: 16px;
            border-radius: 18px;
            background: white;
            color: #334155;
            font-size: 13px;
            font-weight: 800;
            line-height: 1.7;
            padding: 14px 16px;
          }
          .foot {
            padding: 22px 34px 32px;
            color: #64748b;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.7;
          }
          @media print {
            body { background: white; }
            .sheet { width: 100%; margin: 0; box-shadow: none; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <section class="top">
            <div class="brand">
              <img src="${ctmLogo}" alt="CTMerchant logo" />
              <div>
                <div class="company">${escapeHtml(COMPANY_DETAILS.name)}</div>
                <div class="meta">
                  ${escapeHtml(COMPANY_DETAILS.website)}<br />
                  ${escapeHtml(COMPANY_DETAILS.rcNumber)}<br />
                  ${escapeHtml(COMPANY_DETAILS.email)}
                </div>
              </div>
            </div>
            <div class="paid">Payment Receipt</div>
          </section>
          <section class="body">
            <div class="receipt-title">
              <div>
                <h1>Payment Receipt</h1>
                <div class="meta" style="color:#64748b;">
                  Receipt No: ${escapeHtml(receiptNumber)}<br />
                  Date: ${escapeHtml(receiptDate)}
                </div>
              </div>
            </div>
            <div class="grid">
              <div class="box">
                <div class="label">Received From</div>
                <div class="value">${escapeHtml(merchantName)}</div>
              </div>
              <div class="box">
                <div class="label">Shop</div>
                <div class="value">${escapeHtml(shopName)}</div>
              </div>
              <div class="box">
                <div class="label">Payment Type</div>
                <div class="value">${escapeHtml(paymentLabel)}</div>
              </div>
              <div class="box">
                <div class="label">Reference</div>
                <div class="value">${escapeHtml(proof.transfer_reference || receiptNumber)}</div>
              </div>
            </div>
            ${
              hasSubscriptionDetails
                ? `
                  <div class="subscription">
                    <div class="subscription-grid">
                      <div>
                        <div class="label">Subscription Plan</div>
                        <div class="value">${escapeHtml(subscriptionPlan)}</div>
                      </div>
                      <div>
                        <div class="label">Subscription Expiry</div>
                        <div class="value">${escapeHtml(subscriptionExpiry)}</div>
                      </div>
                    </div>
                    <div class="renewal-note">${escapeHtml(renewalNote)}</div>
                  </div>
                `
                : ""
            }
            <div class="amount">
              <div>
                <div class="label" style="color:#cbd5e1;">Amount Paid</div>
              </div>
              <div class="value">${escapeHtml(formatNaira(proof.amount))}</div>
            </div>
          </section>
          <section class="foot">
            This receipt confirms payment recorded by ${brandReceiptHtml} staff. For finance support, contact ${escapeHtml(COMPANY_DETAILS.email)}.
          </section>
        </main>
        <script>
          window.addEventListener("load", () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
  return true
}

function getStatusBadge(status) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800"
  if (status === "rejected") return "bg-rose-100 text-rose-800"
  return "bg-amber-100 text-amber-800"
}

function getStatusIcon(status) {
  if (status === "approved") return <FaCircleCheck />
  if (status === "rejected") return <FaTriangleExclamation />
  return <FaClock />
}

function getToneBadgeClasses(tone) {
  if (tone === "success") return "bg-emerald-100 text-emerald-800"
  if (tone === "danger") return "bg-rose-100 text-rose-800"
  if (tone === "warning") return "bg-amber-100 text-amber-800"
  return "bg-slate-100 text-slate-700"
}

function getTonePanelClasses(tone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50/70"
  if (tone === "danger") return "border-rose-200 bg-rose-50/70"
  if (tone === "warning") return "border-amber-200 bg-amber-50/70"
  return "border-slate-200 bg-slate-50/70"
}

function matchShopFilter(row, activeFilter) {
  if (activeFilter === "all") return true
  if (activeFilter === "attention") {
    return (
      ["receipt_pending", "payment_due", "kyc_ready", "video_pending"].includes(row.physicalState?.key) ||
      ["receipt_pending", "expired", "expiring"].includes(row.subscriptionState?.key)
    )
  }
  if (activeFilter === "receipt_pending") {
    return row.physicalState?.key === "receipt_pending" || row.subscriptionState?.key === "receipt_pending"
  }
  if (activeFilter === "physical_due") return row.physicalState?.key === "payment_due"
  if (activeFilter === "kyc_ready") return row.physicalState?.key === "kyc_ready"
  if (activeFilter === "video_pending") return row.physicalState?.key === "video_pending"
  if (activeFilter === "expired") return row.subscriptionState?.key === "expired"
  if (activeFilter === "expiring") return row.subscriptionState?.key === "expiring"
  return true
}

function createManualPaymentRef(paymentKind, shopId, planKey = null) {
  const prefix = paymentKind === "physical_verification" ? "MANUALPHY" : "MANUALSUB"
  const planSuffix = planKey ? `_${planKey}` : ""
  return `${prefix}_${shopId}${planSuffix}_${Date.now()}`
}

function buildManualReceipt(row, result, paymentKind, planKey, paymentRef, paymentEffectiveAt = null) {
  const fallbackAmount =
    paymentKind === "physical_verification"
      ? 5000
      : SERVICE_PLAN_OPTIONS.find((item) => item.key === planKey)?.amount || 6000

  return {
    id: `manual-${paymentKind}-${row.shop.id}-${Date.now()}`,
    shop_id: row.shop.id,
    shop_name: row.shop.name,
    shop_phone: row.shop.phone || "",
    shop_whatsapp: row.shop.whatsapp || "",
    merchant_id: row.shop.owner_id,
    merchant_name: row.merchantName,
    merchant_phone: row.merchantPhone,
    payment_kind: paymentKind,
    plan: result?.plan || planKey || null,
    subscription_plan_current: result?.plan || planKey || row.shop.subscription_plan || null,
    subscription_end_date: result?.subscriptionEndDate || row.shop.subscription_end_date || null,
    payment_effective_at: result?.paymentEffectiveAt || paymentEffectiveAt || null,
    is_service: row.shop.is_service === true,
    amount: Number(result?.amount || fallbackAmount),
    transfer_reference: result?.paymentRef || paymentRef,
    approval_payment_ref: result?.paymentRef || paymentRef,
    reviewed_at: new Date().toISOString(),
  }
}

function SummaryCard({ label, value, tone, detail }) {
  const toneClasses =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"

  return (
    <div className={`rounded-3xl border p-5 ${toneClasses}`}>
      <div className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-2 text-4xl font-black text-slate-900">{value}</div>
      {detail ? <div className="mt-2 text-xs font-semibold text-slate-500">{detail}</div> : null}
    </div>
  )
}

function ReceiptModal({ proof, onClose, onSendWhatsApp }) {
  if (!proof) return null

  const recipientPhone = getReceiptRecipientPhone(proof)
  const normalizedPhone = normalizeWhatsAppPhone(recipientPhone)
  const hasSubscriptionDetails = isSubscriptionReceipt(proof)
  const subscriptionPlan = getReceiptSubscriptionPlan(proof)
  const subscriptionExpiry = getReceiptSubscriptionExpiryLabel(proof)
  const renewalNote = getReceiptRenewalNote(proof)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-lg font-black text-slate-950"><BrandText /> Receipt</div>
            <div className="text-xs font-bold text-slate-500">{getReceiptNumber(proof)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
          >
            <FaXmark />
          </button>
        </div>

        <div className="p-5">
          <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 bg-gradient-to-br from-[#2E1065] to-[#BE185D] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <img src={ctmLogo} alt="CTMerchant logo" className="h-16 w-16 rounded-2xl border border-white/30 bg-white object-cover" />
                <div>
                  <div className="text-2xl font-black tracking-tight">{COMPANY_DETAILS.name}</div>
                  <div className="mt-1 text-xs font-bold leading-5 text-white/80">
                    {COMPANY_DETAILS.website} - {COMPANY_DETAILS.rcNumber}
                    <br />
                    {COMPANY_DETAILS.email}
                  </div>
                </div>
              </div>
              <div className="self-start rounded-full border border-white/30 bg-white/15 px-4 py-2 text-xs font-black uppercase tracking-widest sm:self-center">
                Payment Receipt
              </div>
            </div>

            <div className="p-6">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-3xl font-black tracking-tight text-slate-950">Payment Receipt</div>
                  <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                    Receipt No: <span className="font-black text-slate-950">{getReceiptNumber(proof)}</span>
                    <br />
                    Date: <span className="font-black text-slate-950">{formatDateTime(getReceiptDate(proof))}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Received From</div>
                  <div className="mt-2 font-black text-slate-950">{proof.merchant_name || "Merchant"}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {proof.merchant_email || proof.merchant_phone || proof.merchant_id || "Staff-confirmed payment"}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Shop</div>
                  <div className="mt-2 font-black text-slate-950">{proof.shop_name || `Shop #${proof.shop_id}`}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">WhatsApp: {normalizedPhone || "Not provided"}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Payment Type</div>
                  <div className="mt-2 font-black text-slate-950">{getPaymentKindLabel(proof)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Reference</div>
                  <div className="mt-2 font-black text-slate-950">{proof.transfer_reference || getReceiptNumber(proof)}</div>
                </div>
              </div>

              {hasSubscriptionDetails ? (
                <div className="mt-5 rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-pink-50 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-black uppercase tracking-widest text-slate-400">Subscription Plan</div>
                      <div className="mt-2 text-lg font-black text-slate-950">{subscriptionPlan}</div>
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-widest text-slate-400">Subscription Expiry</div>
                      <div className="mt-2 text-lg font-black text-slate-950">{subscriptionExpiry}</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white p-4 text-sm font-bold leading-6 text-slate-600">
                    {renewalNote}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 rounded-3xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Amount Paid</div>
                </div>
                <div className="text-3xl font-black">{formatNaira(proof.amount)}</div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onSendWhatsApp(proof)}
              disabled={!normalizedPhone}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <FaWhatsapp /> Send Receipt on WhatsApp
            </button>
            <button
              type="button"
              onClick={() => openPrintableReceipt(proof)}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-black text-white transition hover:bg-slate-800"
            >
              <FaPrint /> Print / Save PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StaffPayments() {
  const location = useLocation()
  const { isSuperAdmin, fetchingStaff } = useStaffPortalSession()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-payments"
      ? location.state.prefetchedData
      : null
  const { confirm, notify, prompt } = useGlobalFeedback()
  const [proofs, setProofs] = useState(() => prefetchedData?.proofs || [])
  const [shopRows, setShopRows] = useState(() => prefetchedData?.shopRows || [])
  const [loading, setLoading] = useState(() => !prefetchedData && isSuperAdmin)
  const [pageError, setPageError] = useState("")
  const [activeStatus, setActiveStatus] = useState("pending")
  const [activeControlFilter, setActiveControlFilter] = useState("attention")
  const [searchQuery, setSearchQuery] = useState("")
  const [signedUrls, setSignedUrls] = useState({})
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [reviewingId, setReviewingId] = useState(null)
  const [selectedReceiptProof, setSelectedReceiptProof] = useState(null)
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))
  const [recordingManualKey, setRecordingManualKey] = useState(null)
  const realtimeTimerRef = useRef(null)

  const applyOverviewPayload = useCallback(async (payload) => {
    const nextProofs = Array.isArray(payload?.proofs) ? payload.proofs : []
    const nextShopRows = Array.isArray(payload?.shopRows) ? payload.shopRows : []

    setProofs(nextProofs)
    setShopRows(nextShopRows)
    setReviewDrafts((current) => {
      const next = { ...current }
      nextProofs.forEach((proof) => {
        if (!(proof.id in next)) next[proof.id] = proof.review_note || ""
      })
      return next
    })

    const signedEntries = await Promise.all(
      nextProofs
        .filter((proof) => proof.receipt_path)
        .map(async (proof) => {
          const { data, error } = await supabase.storage
            .from(PAYMENT_RECEIPT_RULE.bucket)
            .createSignedUrl(proof.receipt_path, 60 * 10)

          if (error) return [proof.id, ""]
          return [proof.id, data?.signedUrl || ""]
        })
    )

    setSignedUrls(Object.fromEntries(signedEntries))
    return { proofs: nextProofs, shopRows: nextShopRows }
  }, [])

  const fetchOverview = useCallback(async () => {
    if (!isSuperAdmin) {
      setProofs([])
      setShopRows([])
      setPageError("")
      setLoading(false)
      return null
    }

    if (prefetchedReady && prefetchedData) {
      setPageError("")
      const result = await applyOverviewPayload(prefetchedData)
      setLoading(false)
      setPrefetchedReady(false)
      return result
    }

    setLoading(true)
    setPageError("")
    try {
      const overview = await fetchStaffPaymentsOverview()
      return await applyOverviewPayload(overview)
    } catch (error) {
      console.error("Could not load staff payment overview:", error)
      setPageError(getFriendlyErrorMessage(error, "Could not load staff payment controls. Retry."))
      return null
    } finally {
      setLoading(false)
    }
  }, [applyOverviewPayload, isSuperAdmin, prefetchedData, prefetchedReady])

  useEffect(() => {
    if (fetchingStaff) return
    void fetchOverview()
  }, [fetchOverview, fetchingStaff])

  useEffect(() => {
    if (!isSuperAdmin) return undefined

    const scheduleRefresh = () => {
      if (realtimeTimerRef.current) {
        window.clearTimeout(realtimeTimerRef.current)
      }
      realtimeTimerRef.current = window.setTimeout(() => {
        void fetchOverview()
      }, 180)
    }

    const channel = supabase
      .channel("public:staff-payments-control")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offline_payment_proofs" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "physical_verification_payments" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_fee_payments" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shops" },
        scheduleRefresh
      )
      .subscribe()

    return () => {
      if (realtimeTimerRef.current) {
        window.clearTimeout(realtimeTimerRef.current)
      }
      supabase.removeChannel(channel)
    }
  }, [fetchOverview, isSuperAdmin])

  const filteredProofs = useMemo(() => {
    if (activeStatus === "all") return proofs
    return proofs.filter((proof) => proof.status === activeStatus)
  }, [activeStatus, proofs])

  const filteredShopRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    return shopRows.filter((row) => {
      if (!matchShopFilter(row, activeControlFilter)) return false
      if (!normalizedSearch) return true

      const haystack = [
        row.shop?.name,
        row.shop?.unique_id,
        row.merchantName,
        row.merchantPhone,
        row.cityName,
        row.shop?.phone,
        row.shop?.whatsapp,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [activeControlFilter, searchQuery, shopRows])

  const proofSummary = useMemo(
    () => ({
      pending: proofs.filter((proof) => proof.status === "pending").length,
      approved: proofs.filter((proof) => proof.status === "approved").length,
      rejected: proofs.filter((proof) => proof.status === "rejected").length,
    }),
    [proofs]
  )

  const controlSummary = useMemo(
    () => ({
      receiptPending: shopRows.filter(
        (row) =>
          row.physicalState?.key === "receipt_pending" ||
          row.subscriptionState?.key === "receipt_pending"
      ).length,
      physicalDue: shopRows.filter((row) => row.physicalState?.key === "payment_due").length,
      kycReady: shopRows.filter((row) => row.physicalState?.key === "kyc_ready").length,
      videoPending: shopRows.filter((row) => row.physicalState?.key === "video_pending").length,
      expired: shopRows.filter((row) => row.subscriptionState?.key === "expired").length,
      expiring: shopRows.filter((row) => row.subscriptionState?.key === "expiring").length,
    }),
    [shopRows]
  )

  const reviewProof = useCallback(async (proof, action) => {
    const note = reviewDrafts[proof.id] || ""
    if (action === "reject" && !note.trim()) {
      notify({
        type: "error",
        title: "Add a rejection note",
        message: "Please explain why this receipt is being rejected.",
      })
      return
    }

    let paymentEffectiveAt = null
    if (action === "approve" && proof.payment_kind === "service_fee") {
      const defaultPaymentDate = toDatetimeLocalValue()
      const enteredDate = await prompt({
        title: "Subscription payment date",
        type: "info",
        message:
          "Use the current date/time or adjust it to the actual bank payment time. The subscription expiry and payment record will be calculated from this date, unless an existing active subscription ends later.",
        inputLabel: "Payment date and time",
        inputType: "datetime-local",
        defaultValue: defaultPaymentDate,
        placeholder: defaultPaymentDate,
        confirmText: "Use This Date",
        cancelText: "Cancel",
      })

      if (enteredDate === null) return

      try {
        paymentEffectiveAt = parseServicePaymentDate(enteredDate).toISOString()
      } catch (error) {
        notify({
          type: "error",
          title: "Invalid payment date",
          message: getFriendlyErrorMessage(error, "Please enter a valid payment date and time."),
        })
        return
      }
    }

    try {
      setReviewingId(proof.id)
      const { data, error } = await invokeEdgeFunctionAuthed("review-offline-payment-proof", {
        proofId: proof.id,
        action,
        note,
        effectiveAt: paymentEffectiveAt,
      })

      if (error) {
        const detailedMessage = await extractFunctionErrorMessage(error, "Could not update this payment proof.")
        throw new Error(detailedMessage)
      }
      if (data?.error) throw new Error(data.error)

      notify({
        type: "success",
        title: action === "approve" ? "Payment approved" : "Payment rejected",
        message: data?.message || "Payment proof updated.",
      })

      const refreshed = await fetchOverview()
      if (action === "approve") {
        const approvedProof =
          refreshed?.proofs?.find((item) => item.id === proof.id) || {
            ...proof,
            status: "approved",
            reviewed_at: new Date().toISOString(),
            approval_payment_ref: data?.paymentRef || proof.approval_payment_ref,
            plan: data?.plan || proof.plan,
            subscription_plan_current: data?.plan || proof.subscription_plan_current,
            subscription_end_date: data?.subscriptionEndDate || proof.subscription_end_date,
            payment_effective_at: data?.paymentEffectiveAt || paymentEffectiveAt || proof.payment_effective_at,
          }
        setSelectedReceiptProof(approvedProof)
      }
    } catch (error) {
      console.error(error)
      notify({
        type: "error",
        title: "Review failed",
        message: getFriendlyErrorMessage(error, "Could not update this payment proof."),
      })
    } finally {
      setReviewingId(null)
    }
  }, [fetchOverview, notify, prompt, reviewDrafts])

  const recordManualPayment = useCallback(
    async (row, paymentKind, planKey = null) => {
      const paymentLabel =
        paymentKind === "physical_verification"
          ? "physical verification payment"
          : `${getPlanLabel(planKey)} service fee`
      const defaultPaymentRef = createManualPaymentRef(paymentKind, row.shop.id, planKey)
      const paymentRef = await prompt({
        title: "Bank payment reference",
        type: "info",
        message: "Confirm the bank reference for this payment. You can keep the generated reference or replace it with your bank statement reference.",
        inputLabel: "Payment reference",
        defaultValue: defaultPaymentRef,
        placeholder: defaultPaymentRef,
        confirmText: "Continue",
        cancelText: "Cancel",
      })

      if (paymentRef === null) return

      let paymentEffectiveAt = null
      if (paymentKind === "service_fee") {
        const defaultPaymentDate = toDatetimeLocalValue()
        const enteredDate = await prompt({
          title: "Service payment date",
          type: "info",
          message:
            "Use the current date/time or enter the actual bank payment time. The subscription expiry and receipt date will follow this payment date, unless the shop already has an active plan ending later.",
          inputLabel: "Payment date and time",
          inputType: "datetime-local",
          defaultValue: defaultPaymentDate,
          placeholder: defaultPaymentDate,
          confirmText: "Continue",
          cancelText: "Cancel",
        })

        if (enteredDate === null) return

        try {
          paymentEffectiveAt = parseServicePaymentDate(enteredDate).toISOString()
        } catch (error) {
          notify({
            type: "error",
            title: "Invalid payment date",
            message: getFriendlyErrorMessage(error, "Please enter a valid payment date and time."),
          })
          return
        }
      }

      const isConfirmed = await confirm({
        title: "Record manual bank payment",
        type: "info",
        message:
          `This will record ${paymentLabel} for ${row.shop.name} and update merchant access immediately.` +
          (paymentEffectiveAt ? `\n\nPayment date: ${formatPaymentEffectiveDate(paymentEffectiveAt)}` : ""),
        confirmText: "Record Payment",
        cancelText: "Cancel",
      })

      if (!isConfirmed) return

      const manualKey = `${row.shop.id}:${paymentKind}:${planKey || "none"}`

      try {
        setRecordingManualKey(manualKey)
        const { data, error } = await invokeEdgeFunctionAuthed("staff-manual-payment-review", {
          shopId: row.shop.id,
          paymentKind,
          planKey,
          paymentRef,
          effectiveAt: paymentEffectiveAt,
        })

        if (error) {
          const detailedMessage = await extractFunctionErrorMessage(error, "Could not record this bank payment.")
          throw new Error(detailedMessage)
        }
        if (data?.error) throw new Error(data.error)

        notify({
          kind: "toast",
          type: "success",
          message: data?.message || "Bank payment recorded successfully.",
        })

        setSelectedReceiptProof(buildManualReceipt(row, data, paymentKind, planKey, paymentRef, paymentEffectiveAt))
        await fetchOverview()
      } catch (error) {
        console.error("Manual staff payment failed:", error)
        notify({
          type: "error",
          title: "Could not record payment",
          message: getFriendlyErrorMessage(error, "Could not record this bank payment."),
        })
      } finally {
        setRecordingManualKey(null)
      }
    },
    [confirm, fetchOverview, notify, prompt]
  )

  const sendReceiptToWhatsApp = useCallback((proof) => {
    const phone = getReceiptRecipientPhone(proof)
    const normalizedPhone = normalizeWhatsAppPhone(phone)

    if (!normalizedPhone) {
      notify({
        type: "error",
        title: "WhatsApp unavailable",
        message: "No merchant WhatsApp or phone number is available for this receipt.",
      })
      return
    }

    const opened = openWhatsAppConversation(normalizedPhone, buildReceiptMessage(proof))
    if (!opened) {
      notify({
        type: "error",
        title: "Could not open WhatsApp",
        message: "Please check this device browser settings and try again.",
      })
    }
  }, [notify])

  const hasAnyData = proofs.length > 0 || shopRows.length > 0

  return (
    <>
      <StaffPortalShell
        activeKey="payments"
        title="Payments Control"
        description="Review uploaded receipts, record manual bank confirmations, and keep a clear watch on verification and subscription timelines across all shops."
        headerActions={isSuperAdmin ? [
          <QuickActionButton
            key="refresh"
            icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />}
            label="Refresh Payments"
            tone="white"
            onClick={fetchOverview}
          />,
        ] : null}
      >
        {!isSuperAdmin ? (
          <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl text-rose-600 shadow-sm">
              <FaReceipt />
            </div>
            <h3 className="text-xl font-black text-slate-900">Super admin access required</h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-rose-900">
              Offline payment review and manual bank confirmations are restricted to super admins.
            </p>
          </div>
        ) : pageError && hasAnyData ? (
          <div className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>{pageError}</div>
              <button
                type="button"
                onClick={fetchOverview}
                className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:bg-rose-700"
              >
                Retry Refresh
              </button>
            </div>
          </div>
        ) : null}

        {isSuperAdmin && (!loading && pageError && !hasAnyData ? (
          <InlineErrorState
            title="Payments control unavailable"
            message={pageError}
            onRetry={fetchOverview}
          />
        ) : (
          <>
            <SectionHeading
              eyebrow="Payments"
              title="Receipt Review Queue"
              description="Uploaded receipts still flow through the secure approval queue, while manual bank confirmations can now be handled from the shop control section below."
            />

            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <SummaryCard label="Pending Queue" value={proofSummary.pending} tone="warning" />
              <SummaryCard label="Approved Queue" value={proofSummary.approved} tone="success" />
              <SummaryCard label="Rejected Queue" value={proofSummary.rejected} tone="danger" />
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {PROOF_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveStatus(filter.key)}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${
                    activeStatus === filter.key
                      ? "bg-[#2E1065] text-white"
                      : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {loading && !proofs.length ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                  <FaCircleNotch className="mx-auto mb-3 animate-spin text-3xl" />
                  Loading payment proofs...
                </div>
              ) : filteredProofs.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
                  No payment proofs in this view.
                </div>
              ) : (
                filteredProofs.map((proof) => (
                  <div key={proof.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${getStatusBadge(proof.status)}`}>
                            {getStatusIcon(proof.status)} {proof.status}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            <FaBuildingColumns /> {getPaymentKindLabel(proof)}
                          </span>
                          <span className="rounded-full bg-[#FCE7F3] px-3 py-1 text-xs font-black text-[#BE185D]">
                            {formatNaira(proof.amount)}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                          <div>
                            <div className="text-xs font-bold uppercase text-slate-400">Merchant</div>
                            <div className="mt-1 font-black text-slate-900">{proof.merchant_name || "Merchant"}</div>
                            <div className="text-xs font-semibold text-slate-500">
                              {proof.merchant_email || proof.merchant_phone || proof.merchant_id}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-bold uppercase text-slate-400">Shop</div>
                            <div className="mt-1 font-black text-slate-900">{proof.shop_name || `Shop #${proof.shop_id}`}</div>
                            <div className="text-xs font-semibold text-slate-500">Shop ID: {proof.shop_id}</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold uppercase text-slate-400">Transfer Reference</div>
                            <div className="mt-1 font-black text-slate-900">{proof.transfer_reference || "Not provided"}</div>
                            <div className="text-xs font-semibold text-slate-500">{proof.depositor_name || "Depositor not provided"}</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold uppercase text-slate-400">Submitted</div>
                            <div className="mt-1 font-black text-slate-900">{formatDateTime(proof.created_at)}</div>
                            <div className="text-xs font-semibold text-slate-500">Reviewed: {formatDateTime(proof.reviewed_at)}</div>
                          </div>
                          <div>
                            <div className="text-xs font-bold uppercase text-slate-400">WhatsApp</div>
                            <div className="mt-1 font-black text-slate-900">
                              {normalizeWhatsAppPhone(getReceiptRecipientPhone(proof)) || "Not provided"}
                            </div>
                            <div className="text-xs font-semibold text-slate-500">Shop WhatsApp, shop phone, then profile phone</div>
                          </div>
                        </div>

                        {proof.review_note ? (
                          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                            Staff note: {proof.review_note}
                          </div>
                        ) : null}
                      </div>

                      <div className="w-full shrink-0 lg:w-[280px]">
                        {signedUrls[proof.id] ? (
                          <a
                            href={signedUrls[proof.id]}
                            target="_blank"
                            rel="noreferrer"
                            className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                          >
                            <FaReceipt /> View Uploaded Proof <FaArrowUpRightFromSquare />
                          </a>
                        ) : (
                          <div className="mb-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-400">
                            Uploaded proof unavailable
                          </div>
                        )}

                        {proof.status === "pending" ? (
                          <div className="space-y-3">
                            <textarea
                              value={reviewDrafts[proof.id] || ""}
                              onChange={(event) =>
                                setReviewDrafts((current) => ({
                                  ...current,
                                  [proof.id]: event.target.value,
                                }))
                              }
                              placeholder="Optional approval note. Required for rejection."
                              className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#2E1065]"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={reviewingId === proof.id}
                                onClick={() => reviewProof(proof, "reject")}
                                className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-60"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                disabled={reviewingId === proof.id}
                                onClick={() => reviewProof(proof, "approve")}
                                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {reviewingId === proof.id ? <FaCircleNotch className="mx-auto animate-spin" /> : "Approve"}
                              </button>
                            </div>
                          </div>
                        ) : proof.status === "approved" ? (
                          <div className="grid gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptProof(proof)}
                              className="flex items-center justify-center gap-2 rounded-xl bg-[#2E1065] px-4 py-3 text-sm font-black text-white transition hover:bg-[#4C1D95]"
                            >
                              <FaReceipt /> View CTM Receipt
                            </button>
                            <button
                              type="button"
                              onClick={() => sendReceiptToWhatsApp(proof)}
                              disabled={!normalizeWhatsAppPhone(getReceiptRecipientPhone(proof))}
                              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              <FaWhatsapp /> Send to WhatsApp
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-10">
              <SectionHeading
                eyebrow="Shop Control"
                title="Shop Payment Control Board"
                description="This board pulls every shop into one payment operations view so staff can spot pending receipts, expected physical verification fees, expired subscriptions, and expiring plans even when no receipt was uploaded."
              />

              <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <SummaryCard label="Receipt Pending" value={controlSummary.receiptPending} tone="warning" />
                <SummaryCard label="Physical Fee Due" value={controlSummary.physicalDue} tone="warning" />
                <SummaryCard label="Ready For KYC" value={controlSummary.kycReady} tone="success" />
                <SummaryCard label="Expired Plans" value={controlSummary.expired} tone="danger" />
                <SummaryCard label="Expiring Soon" value={controlSummary.expiring} tone="warning" />
              </div>

              <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {CONTROL_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setActiveControlFilter(filter.key)}
                      className={`rounded-full px-4 py-2 text-sm font-black transition ${
                        activeControlFilter === filter.key
                          ? "bg-[#BE185D] text-white"
                          : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <label className="relative block w-full xl:w-[340px]">
                  <FaMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search shop, merchant, phone, or CT ID"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#BE185D]"
                  />
                </label>
              </div>

              <div className="space-y-4">
                {loading && !shopRows.length ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                    <FaCircleNotch className="mx-auto mb-3 animate-spin text-3xl" />
                    Loading shop payment control...
                  </div>
                ) : filteredShopRows.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
                    No shops match this payment view.
                  </div>
                ) : (
                  filteredShopRows.map((row) => {
                    const physicalProofUrl = signedUrls[row.latestPhysicalProof?.id] || ""
                    const serviceProofUrl = signedUrls[row.latestServiceProof?.id] || ""
                    const subscriptionEndsAt = row.shop?.subscription_end_date
                      ? formatDateTime(row.shop.subscription_end_date)
                      : "No active subscription"

                    return (
                      <div key={row.shop.id} className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-widest text-white">
                                {row.shop?.unique_id || `SHOP-${row.shop.id}`}
                              </span>
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${getToneBadgeClasses(row.physicalState?.tone)}`}>
                                <FaReceipt /> {row.physicalState?.label}
                              </span>
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${getToneBadgeClasses(row.subscriptionState?.tone)}`}>
                                <FaWallet /> {row.subscriptionState?.label}
                              </span>
                            </div>

                            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">{row.shop?.name}</div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <div>
                                <div className="text-xs font-bold uppercase text-slate-400">Merchant</div>
                                <div className="mt-1 font-black text-slate-900">{row.merchantName}</div>
                                <div className="text-xs font-semibold text-slate-500">
                                  {normalizeWhatsAppPhone(row.merchantPhone) || "No phone on profile"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-bold uppercase text-slate-400">Location</div>
                                <div className="mt-1 flex items-center gap-2 font-black text-slate-900">
                                  <FaLocationDot className="text-[#BE185D]" /> {row.cityName}
                                </div>
                                <div className="text-xs font-semibold text-slate-500">Status: {row.shop?.status || "pending"}</div>
                              </div>
                              <div>
                                <div className="text-xs font-bold uppercase text-slate-400">Contact</div>
                                <div className="mt-1 font-black text-slate-900">
                                  {normalizeWhatsAppPhone(row.shop?.whatsapp || row.shop?.phone) || "Not provided"}
                                </div>
                                <div className="text-xs font-semibold text-slate-500">Shop WhatsApp or phone</div>
                              </div>
                              <div>
                                <div className="text-xs font-bold uppercase text-slate-400">Subscription</div>
                                <div className="mt-1 font-black text-slate-900">{row.shop?.subscription_plan || "No Active Plan"}</div>
                                <div className="text-xs font-semibold text-slate-500">{subscriptionEndsAt}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 xl:grid-cols-2">
                          <div className={`rounded-[26px] border p-5 ${getTonePanelClasses(row.physicalState?.tone)}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-black uppercase tracking-widest text-slate-500">Physical Verification</div>
                                <div className="mt-1 text-lg font-black text-slate-950">{row.physicalState?.label}</div>
                              </div>
                              <span className={`rounded-full px-3 py-1 text-xs font-black ${getToneBadgeClasses(row.physicalState?.tone)}`}>
                                {row.shop?.is_verified ? "Verified" : row.shop?.kyc_status || "Not Verified"}
                              </span>
                            </div>

                            <div className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                              {row.physicalState?.detail}
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-2xl bg-white/80 p-4">
                                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Latest bank record</div>
                                <div className="mt-2 font-black text-slate-900">
                                  {row.latestPhysicalPayment?.payment_ref || "No physical payment recorded"}
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                  {row.latestPhysicalPayment?.created_at
                                    ? formatDateTime(row.latestPhysicalPayment.created_at)
                                    : "Waiting for payment"}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-white/80 p-4">
                                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Latest receipt proof</div>
                                <div className="mt-2 font-black text-slate-900">
                                  {row.latestPhysicalProof?.status || "No receipt uploaded"}
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                  {row.latestPhysicalProof?.created_at
                                    ? formatDateTime(row.latestPhysicalProof.created_at)
                                    : "Manual confirmation allowed"}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {physicalProofUrl ? (
                                <a
                                  href={physicalProofUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                                >
                                  <FaArrowUpRightFromSquare /> View Physical Receipt
                                </a>
                              ) : null}

                              {row.canManuallyConfirmPhysical ? (
                                <button
                                  type="button"
                                  disabled={recordingManualKey === `${row.shop.id}:physical_verification:none`}
                                  onClick={() => recordManualPayment(row, "physical_verification")}
                                  className="inline-flex items-center gap-2 rounded-full bg-[#2E1065] px-4 py-2 text-xs font-black text-white transition hover:bg-[#4C1D95] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {recordingManualKey === `${row.shop.id}:physical_verification:none` ? (
                                    <FaCircleNotch className="animate-spin" />
                                  ) : (
                                    <FaBuildingColumns />
                                  )}
                                  Confirm N5,000 Bank Payment
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className={`rounded-[26px] border p-5 ${getTonePanelClasses(row.subscriptionState?.tone)}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-black uppercase tracking-widest text-slate-500">Service Subscription</div>
                                <div className="mt-1 text-lg font-black text-slate-950">{row.subscriptionState?.label}</div>
                              </div>
                              <span className={`rounded-full px-3 py-1 text-xs font-black ${getToneBadgeClasses(row.subscriptionState?.tone)}`}>
                                {row.shop?.subscription_plan || "No Plan"}
                              </span>
                            </div>

                            <div className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                              {row.subscriptionState?.detail}
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-2xl bg-white/80 p-4">
                                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Latest service payment</div>
                                <div className="mt-2 font-black text-slate-900">
                                  {row.latestServicePayment?.payment_ref || "No service payment recorded"}
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                  {row.latestServicePayment?.created_at
                                    ? formatDateTime(row.latestServicePayment.created_at)
                                    : "Waiting for payment"}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-white/80 p-4">
                                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Plan window</div>
                                <div className="mt-2 flex items-center gap-2 font-black text-slate-900">
                                  <FaCalendarDays className="text-[#BE185D]" />
                                  {row.shop?.subscription_end_date ? formatDateTime(row.shop.subscription_end_date) : "No active end date"}
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                  {row.subscriptionState?.daysRemaining === null
                                    ? "No active subscription window"
                                    : `${row.subscriptionState.daysRemaining} day(s) remaining`}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {serviceProofUrl ? (
                                <a
                                  href={serviceProofUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                                >
                                  <FaArrowUpRightFromSquare /> View Service Receipt
                                </a>
                              ) : null}

                              {row.canManuallyConfirmService ? (
                                SERVICE_PLAN_OPTIONS.map((plan) => {
                                  const manualKey = `${row.shop.id}:service_fee:${plan.key}`
                                  return (
                                    <button
                                      key={plan.key}
                                      type="button"
                                      disabled={recordingManualKey === manualKey}
                                      onClick={() => recordManualPayment(row, "service_fee", plan.key)}
                                      className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {recordingManualKey === manualKey ? (
                                        <FaCircleNotch className="animate-spin" />
                                      ) : (
                                        <FaWallet />
                                      )}
                                      Record {plan.label} - {formatNaira(plan.amount)}
                                    </button>
                                  )
                                })
                              ) : (
                                <div className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-500">
                                  Unlocks after physical verification is approved.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </>
        ))}
      </StaffPortalShell>
      <ReceiptModal
        proof={selectedReceiptProof}
        onClose={() => setSelectedReceiptProof(null)}
        onSendWhatsApp={sendReceiptToWhatsApp}
      />
    </>
  )
}
