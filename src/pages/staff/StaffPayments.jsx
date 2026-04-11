import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaArrowUpRightFromSquare,
  FaBuildingColumns,
  FaCircleCheck,
  FaCircleNotch,
  FaClock,
  FaPrint,
  FaReceipt,
  FaTriangleExclamation,
  FaWhatsapp,
  FaXmark,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { invokeEdgeFunctionAuthed } from "../../lib/edgeFunctions"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { PAYMENT_RECEIPT_RULE, formatNaira } from "../../lib/offlinePayments"
import { normalizeWhatsAppPhone, openWhatsAppConversation } from "../../lib/whatsapp"
import ctmLogo from "../../assets/images/logo.jpg"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
} from "./StaffPortalShared"

const STATUS_FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
]

const COMPANY_DETAILS = {
  name: "CT Merchant LTD",
  website: "www.ctmerchant.com.ng",
  rcNumber: "RC: 8879163",
  email: "finance@ctmerchant.com.ng",
}

async function extractFunctionErrorMessage(error, fallback = "Review failed") {
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

function getReceiptNumber(proof) {
  return proof?.approval_payment_ref || `OFFLINE_${proof?.id || "PENDING"}`
}

function getReceiptDate(proof) {
  return proof?.reviewed_at || proof?.updated_at || proof?.created_at || new Date().toISOString()
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
    "",
    COMPANY_DETAILS.name,
    COMPANY_DETAILS.website,
    COMPANY_DETAILS.rcNumber,
    COMPANY_DETAILS.email,
  ]

  return lines.join("\n")
}

async function enrichPaymentProofs(rows) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!safeRows.length) return []

  const merchantIds = [...new Set(safeRows.map((proof) => proof.merchant_id).filter(Boolean))]
  const shopIds = [...new Set(safeRows.map((proof) => proof.shop_id).filter(Boolean))]

  const [profilesResult, shopsResult] = await Promise.all([
    merchantIds.length
      ? supabase.from("profiles").select("id, full_name, phone").in("id", merchantIds)
      : Promise.resolve({ data: [], error: null }),
    shopIds.length
      ? supabase
          .from("shops")
          .select("id, name, phone, whatsapp, owner_id, subscription_end_date, subscription_plan")
          .in("id", shopIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (profilesResult.error) {
    console.warn("Could not load payment merchant profiles:", profilesResult.error)
  }
  if (shopsResult.error) {
    console.warn("Could not load payment shop contacts:", shopsResult.error)
  }

  const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]))
  const shopsById = new Map((shopsResult.data || []).map((shop) => [shop.id, shop]))

  return safeRows.map((proof) => {
    const profile = profilesById.get(proof.merchant_id) || null
    const shop = shopsById.get(proof.shop_id) || null

    return {
      ...proof,
      merchant_name: proof.merchant_name || profile?.full_name || "Merchant",
      merchant_phone: profile?.phone || "",
      shop_name: proof.shop_name || shop?.name || "",
      shop_phone: shop?.phone || "",
      shop_whatsapp: shop?.whatsapp || "",
      subscription_end_date: shop?.subscription_end_date || proof.subscription_end_date || null,
      subscription_plan_current: shop?.subscription_plan || "",
    }
  })
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
          .receipt-no { text-align: right; color: #475569; font-size: 13px; font-weight: 850; line-height: 1.7; }
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
            <div class="paid">Payment Confirmed</div>
          </section>
          <section class="body">
            <div class="receipt-title">
              <div>
                <h1>Official Receipt</h1>
                <div class="meta" style="color:#64748b;">Issued after CTMerchant staff payment confirmation.</div>
              </div>
              <div class="receipt-no">
                Receipt No: ${escapeHtml(receiptNumber)}<br />
                Date: ${escapeHtml(receiptDate)}
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
            <div class="amount">
              <div>
                <div class="label" style="color:#cbd5e1;">Amount Paid</div>
                <div style="margin-top:6px;font-weight:800;color:#cbd5e1;">Bank transfer confirmed by CTMerchant Finance</div>
              </div>
              <div class="value">${escapeHtml(formatNaira(proof.amount))}</div>
            </div>
          </section>
          <section class="foot">
            This receipt confirms payment recorded by CTMerchant staff. For finance support, contact ${escapeHtml(COMPANY_DETAILS.email)}.
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

function ReceiptModal({ proof, onClose, onSendWhatsApp }) {
  if (!proof) return null

  const recipientPhone = getReceiptRecipientPhone(proof)
  const normalizedPhone = normalizeWhatsAppPhone(recipientPhone)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-lg font-black text-slate-950">CTMerchant Receipt</div>
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
                Payment Confirmed
              </div>
            </div>

            <div className="p-6">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-3xl font-black tracking-tight text-slate-950">Official Receipt</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">Issued after staff payment confirmation.</div>
                </div>
                <div className="text-left text-sm font-bold leading-6 text-slate-500 sm:text-right">
                  Receipt No: <span className="text-slate-950">{getReceiptNumber(proof)}</span>
                  <br />
                  Date: <span className="text-slate-950">{formatDateTime(getReceiptDate(proof))}</span>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Received From</div>
                  <div className="mt-2 font-black text-slate-950">{proof.merchant_name || "Merchant"}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{proof.merchant_email || proof.merchant_id}</div>
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

              <div className="mt-5 flex flex-col gap-3 rounded-3xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Amount Paid</div>
                  <div className="mt-1 text-sm font-bold text-slate-300">Bank transfer confirmed by CTMerchant Finance</div>
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

export default function StaffPayments() {
  const location = useLocation()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-payments"
      ? location.state.prefetchedData
      : null
  const { notify } = useGlobalFeedback()
  const [proofs, setProofs] = useState(() => prefetchedData?.proofs || [])
  const [loading, setLoading] = useState(() => !prefetchedData)
  const [activeStatus, setActiveStatus] = useState("pending")
  const [signedUrls, setSignedUrls] = useState({})
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [reviewingId, setReviewingId] = useState(null)
  const [selectedReceiptProof, setSelectedReceiptProof] = useState(null)
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  const fetchProofs = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      const rows = await enrichPaymentProofs(prefetchedData.proofs || [])
      setProofs(rows)
      setReviewDrafts((current) => {
        const next = { ...current }
        rows.forEach((proof) => {
          if (!(proof.id in next)) next[proof.id] = proof.review_note || ""
        })
        return next
      })
      const signedEntries = await Promise.all(
        rows
          .filter((proof) => proof.receipt_path)
          .map(async (proof) => {
            const { data: signed, error: signedError } = await supabase.storage
              .from(PAYMENT_RECEIPT_RULE.bucket)
              .createSignedUrl(proof.receipt_path, 60 * 10)

            if (signedError) return [proof.id, ""]
            return [proof.id, signed?.signedUrl || ""]
          })
      )
      setSignedUrls(Object.fromEntries(signedEntries))
      setLoading(false)
      setPrefetchedReady(false)
      return rows
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("offline_payment_proofs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error

      const rows = await enrichPaymentProofs(data || [])
      setProofs(rows)
      setReviewDrafts((current) => {
        const next = { ...current }
        rows.forEach((proof) => {
          if (!(proof.id in next)) next[proof.id] = proof.review_note || ""
        })
        return next
      })

      const signedEntries = await Promise.all(
        rows
          .filter((proof) => proof.receipt_path)
          .map(async (proof) => {
            const { data: signed, error: signedError } = await supabase.storage
              .from(PAYMENT_RECEIPT_RULE.bucket)
              .createSignedUrl(proof.receipt_path, 60 * 10)

            if (signedError) return [proof.id, ""]
            return [proof.id, signed?.signedUrl || ""]
          })
      )

      setSignedUrls(Object.fromEntries(signedEntries))
      return rows
    } catch (error) {
      console.error("Could not load offline payment proofs:", error)
      notify({
        type: "error",
        title: "Could not load payments",
        message: getFriendlyErrorMessage(error, "Could not load payment proofs. Retry."),
      })
      return []
    } finally {
      setLoading(false)
    }
  }, [notify, prefetchedData, prefetchedReady])

  useEffect(() => {
    fetchProofs()
  }, [fetchProofs])

  useEffect(() => {
    const channel = supabase
      .channel("public:offline_payment_proofs:staff")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offline_payment_proofs",
        },
        () => {
          void fetchProofs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchProofs])

  const filteredProofs = useMemo(() => {
    if (activeStatus === "all") return proofs
    return proofs.filter((proof) => proof.status === activeStatus)
  }, [activeStatus, proofs])

  const summary = useMemo(
    () => ({
      pending: proofs.filter((proof) => proof.status === "pending").length,
      approved: proofs.filter((proof) => proof.status === "approved").length,
      rejected: proofs.filter((proof) => proof.status === "rejected").length,
    }),
    [proofs]
  )

  const reviewProof = async (proof, action) => {
    const note = reviewDrafts[proof.id] || ""
    if (action === "reject" && !note.trim()) {
      notify({
        type: "error",
        title: "Add a rejection note",
        message: "Please explain why this receipt is being rejected.",
      })
      return
    }

    try {
      setReviewingId(proof.id)
      const { data, error } = await invokeEdgeFunctionAuthed("review-offline-payment-proof", {
        proofId: proof.id,
        action,
        note,
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
      const refreshedProofs = await fetchProofs()
      if (action === "approve") {
        const approvedProof =
          refreshedProofs.find((item) => item.id === proof.id) || {
            ...proof,
            status: "approved",
            reviewed_at: new Date().toISOString(),
            approval_payment_ref: data?.paymentRef || proof.approval_payment_ref,
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
  }

  const sendReceiptToWhatsApp = (proof) => {
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
  }

  return (
    <>
      <StaffPortalShell
      activeKey="payments"
      title="Offline Payments"
      description="Review bank-transfer receipts, approve subscription activations, and reject unclear proofs with a staff note."
      headerActions={[
        <QuickActionButton key="refresh" icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />} label="Refresh Payments" tone="white" onClick={fetchProofs} />,
      ]}
      >
      <SectionHeading
        eyebrow="Payments"
        title="Receipt Review Queue"
        description="Approvals run through the secure edge function so staff action writes the final receipt and updates shop subscription time in one controlled path."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-amber-700">Pending</div>
          <div className="mt-2 text-4xl font-black text-slate-900">{summary.pending}</div>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Approved</div>
          <div className="mt-2 text-4xl font-black text-slate-900">{summary.approved}</div>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-rose-700">Rejected</div>
          <div className="mt-2 text-4xl font-black text-slate-900">{summary.rejected}</div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
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
        {loading ? (
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
                      <div className="text-xs font-semibold text-slate-500">{proof.merchant_email || proof.merchant_id}</div>
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
      </StaffPortalShell>
      <ReceiptModal
        proof={selectedReceiptProof}
        onClose={() => setSelectedReceiptProof(null)}
        onSendWhatsApp={sendReceiptToWhatsApp}
      />
    </>
  )
}
