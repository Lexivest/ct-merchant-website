import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaArrowUpRightFromSquare,
  FaBuildingColumns,
  FaCircleCheck,
  FaCircleNotch,
  FaClock,
  FaReceipt,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { invokeEdgeFunctionAuthed } from "../../lib/edgeFunctions"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { PAYMENT_RECEIPT_RULE, formatNaira } from "../../lib/offlinePayments"
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

function getPaymentKindLabel(proof) {
  if (proof.payment_kind === "physical_verification") return "Physical Verification"
  if (proof.plan === "1_Year") return "Service Fee · 1 Year"
  return "Service Fee · 6 Months"
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
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  const fetchProofs = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      const rows = prefetchedData.proofs || []
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
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("offline_payment_proofs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error

      const rows = data || []
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
    } catch (error) {
      console.error("Could not load offline payment proofs:", error)
      notify({
        type: "error",
        title: "Could not load payments",
        message: getFriendlyErrorMessage(error, "Could not load payment proofs. Retry."),
      })
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

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      notify({
        type: "success",
        title: action === "approve" ? "Payment approved" : "Payment rejected",
        message: data?.message || "Payment proof updated.",
      })
      await fetchProofs()
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

  return (
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

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                      <FaReceipt /> View Receipt <FaArrowUpRightFromSquare />
                    </a>
                  ) : (
                    <div className="mb-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-400">
                      Receipt preview unavailable
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
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </StaffPortalShell>
  )
}
