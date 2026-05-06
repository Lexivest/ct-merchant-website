import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaArrowUpRightFromSquare,
  FaBuildingColumns,
  FaCalendarDays,
  FaCircleCheck,
  FaCircleNotch,
  FaClock,
  FaDownload,
  FaReceipt,
  FaRotateRight,
  FaTriangleExclamation,
  FaUpload,
  FaWallet,
} from "react-icons/fa6"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import InlineErrorState from "../../components/common/InlineErrorState"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { formatNaira } from "../../lib/offlinePayments"
import {
  COMMISSION_RECEIPT_ACCEPT,
  COMMISSION_RECEIPT_RULE_LABEL,
  createCommissionReceiptSignedUrls,
  fetchStaffCommissionsOverview,
  formatCommissionFormula,
  formatMonthLabel,
  formatPercent,
  getCurrentMonthInputValue,
  toMonthInputValue,
  toMonthStartDate,
  uploadCommissionReceipt,
} from "../../lib/staffCommissionsData"
import { supabase } from "../../lib/supabase"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
  useStaffPortalSession,
} from "./StaffPortalShared"

function StatCard({ icon, label, value, detail, tone = "slate" }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "pink"
          ? "border-pink-200 bg-pink-50 text-pink-700"
          : "border-slate-200 bg-white text-slate-700"

  return (
    <div className={`rounded-[28px] border p-5 shadow-sm ${toneClass}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/75 text-xl shadow-sm">
        {icon}
      </div>
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</div>
      {detail ? <div className="mt-2 text-xs font-bold leading-5 text-slate-500">{detail}</div> : null}
    </div>
  )
}

function StatusPill({ row, isClosed }) {
  if (!isClosed) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700 ring-1 ring-sky-100">
        <FaClock /> Live month
      </span>
    )
  }

  if (row?.payout_status === "paid") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
        <FaCircleCheck /> Paid
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-100">
      <FaTriangleExclamation /> Unpaid
    </span>
  )
}

function AdminNames({ admins }) {
  const safeAdmins = Array.isArray(admins) ? admins : []
  if (!safeAdmins.length) {
    return <span className="text-xs font-bold text-slate-400">No city admin profile linked yet</span>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {safeAdmins.slice(0, 3).map((admin) => (
        <span
          key={admin.id}
          className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600"
        >
          {admin.name}
        </span>
      ))}
      {safeAdmins.length > 3 ? (
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500">
          +{safeAdmins.length - 3}
        </span>
      ) : null}
    </div>
  )
}

function formatPlanLabel(plan) {
  if (plan === "1_Year") return "1 Year"
  if (plan === "6_Months") return "6 Months"
  return "Not applicable"
}

function PaymentBreakdown({ payments }) {
  const safePayments = Array.isArray(payments) ? payments : []

  return (
    <div className="mt-5 rounded-[26px] border border-slate-200 bg-white">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Eligible payments
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            Merchant-by-merchant proof for this month’s commission math.
          </div>
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
          {safePayments.length.toLocaleString()} payment{safePayments.length === 1 ? "" : "s"}
        </span>
      </div>

      {safePayments.length === 0 ? (
        <div className="p-5 text-sm font-semibold text-slate-500">
          No eligible merchant payments were found for this city and month.
        </div>
      ) : (
        <div className="max-h-[360px] overflow-auto">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Fee type</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Paid date</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {safePayments.map((payment) => (
                <tr key={payment.id} className="align-top">
                  <td className="px-4 py-3 font-black text-slate-900">
                    {payment.merchant_name || "Merchant"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-black text-slate-800">
                      {payment.shop_name || `Shop #${payment.shop_id || "unknown"}`}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-400">
                      {payment.shop_id ? `Shop ID ${payment.shop_id}` : "No shop id"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                      payment.fee_type === "subscription"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-pink-50 text-pink-700"
                    }`}>
                      {payment.fee_label || "Payment"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-600">
                    {formatPlanLabel(payment.subscription_plan)}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-slate-950">
                    {formatNaira(payment.amount)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-500">
                    {formatDateTime(payment.paid_at)}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs font-bold text-slate-500">
                    {payment.payment_ref || "No reference"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CommissionRow({
  row,
  isClosed,
  isSuperAdmin,
  signedUrl,
  paying,
  onMarkPaid,
}) {
  const commissionAmount = Number(row?.commission_amount || 0)
  const hasCommission = commissionAmount > 0
  const canMarkPaid =
    isSuperAdmin &&
    isClosed &&
    hasCommission &&
    row?.payout_status !== "paid" &&
    !paying

  return (
    <article className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
      <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1e1b4b_55%,#be185d_100%)] p-5 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill row={row} isClosed={isClosed} />
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/80">
                City #{row.city_id}
              </span>
            </div>
            <h3 className="mt-4 text-2xl font-black tracking-tight">{row.city_name}</h3>
            <p className="mt-1 text-sm font-semibold text-white/65">{row.state || "State not set"}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 px-5 py-4 text-right">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">
              Take home
            </div>
            <div className="mt-1 text-3xl font-black">{formatNaira(commissionAmount)}</div>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Subscriptions/Renewals</div>
            <div className="mt-2 text-xl font-black text-slate-950">{formatNaira(row.subscription_total)}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Verification Fees</div>
            <div className="mt-2 text-xl font-black text-slate-950">{formatNaira(row.verification_total)}</div>
          </div>
          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <div className="text-xs font-black uppercase tracking-widest text-white/45">Gross Inflow</div>
            <div className="mt-2 text-xl font-black">{formatNaira(row.gross_inflow)}</div>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-pink-100 bg-pink-50/70 p-4">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-pink-700">Clear math</div>
          <div className="mt-2 text-sm font-black leading-6 text-slate-900">
            {formatCommissionFormula(row)}
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            Promo-code verification is excluded because it is not real cash inflow.
          </p>
        </div>

        <PaymentBreakdown payments={row.payments} />

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">City admin account</div>
            <div className="mt-2">
              <AdminNames admins={row.city_admins} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {row.payout_status === "paid" ? (
              <>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
                  <FaCircleCheck /> Paid {row.paid_at ? formatDateTime(row.paid_at) : ""}
                </span>
                {signedUrl ? (
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800"
                  >
                    <FaDownload /> Download receipt
                  </a>
                ) : row.receipt_path ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-500">
                    Receipt secured
                  </span>
                ) : null}
              </>
            ) : null}

            {isSuperAdmin ? (
              <button
                type="button"
                disabled={!canMarkPaid}
                onClick={() => onMarkPaid(row)}
                className="inline-flex items-center gap-2 rounded-full bg-[#DB2777] px-4 py-2 text-xs font-black text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {paying ? <FaCircleNotch className="animate-spin" /> : <FaUpload />}
                {row.payout_status === "paid" ? "Already paid" : isClosed ? "Mark paid" : "Month still open"}
              </button>
            ) : null}
          </div>
        </div>

        {row.payment_reference || row.note ? (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-semibold leading-5 text-slate-500">
            {row.payment_reference ? (
              <div>
                <span className="font-black text-slate-700">Payment ref:</span> {row.payment_reference}
              </div>
            ) : null}
            {row.note ? (
              <div className="mt-1">
                <span className="font-black text-slate-700">Note:</span> {row.note}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default function StaffCommissions() {
  const location = useLocation()
  const {
    authUser,
    isSuperAdmin,
    isCityAdmin,
    fetchingStaff,
  } = useStaffPortalSession()
  const { confirm, notify, prompt } = useGlobalFeedback()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-commissions"
      ? location.state.prefetchedData
      : null

  const [monthInput, setMonthInput] = useState(() =>
    toMonthInputValue(prefetchedData?.month_start || getCurrentMonthInputValue())
  )
  const [summary, setSummary] = useState(() => prefetchedData || null)
  const [signedUrls, setSignedUrls] = useState({})
  const [loading, setLoading] = useState(() => !prefetchedData && !fetchingStaff)
  const [pageError, setPageError] = useState("")
  const [payingCityId, setPayingCityId] = useState(null)
  const receiptInputRef = useRef(null)
  const pendingPaymentRowRef = useRef(null)
  const realtimeTimerRef = useRef(null)

  const rows = useMemo(() => {
    const safeRows = Array.isArray(summary?.rows) ? summary.rows : []
    if (!isSuperAdmin) return safeRows
    return safeRows.filter((row) => row.has_activity)
  }, [isSuperAdmin, summary])

  const totals = summary?.totals || {}
  const isClosed = Boolean(summary?.is_closed)
  const monthStart = summary?.month_start || toMonthStartDate(monthInput)
  const monthLabel = formatMonthLabel(monthStart)
  const actorLabel = isSuperAdmin ? "All cities" : isCityAdmin ? "Your city" : "Staff"

  const loadCommissions = useCallback(async (nextMonthInput = monthInput) => {
    setLoading(true)
    setPageError("")
    try {
      const nextSummary = await fetchStaffCommissionsOverview(toMonthStartDate(nextMonthInput))
      setSummary(nextSummary)
      setMonthInput(toMonthInputValue(nextSummary?.month_start || nextMonthInput))
      const urls = await createCommissionReceiptSignedUrls(nextSummary?.rows || [])
      setSignedUrls(urls)
      return nextSummary
    } catch (error) {
      console.error("Could not load staff commissions:", error)
      setPageError(getFriendlyErrorMessage(error, "Could not load commission records. Retry."))
      return null
    } finally {
      setLoading(false)
    }
  }, [monthInput])

  useEffect(() => {
    if (fetchingStaff) return

    if (prefetchedData) {
      void createCommissionReceiptSignedUrls(prefetchedData.rows || []).then(setSignedUrls)
      return
    }

    void loadCommissions(monthInput)
  }, [fetchingStaff, loadCommissions, monthInput, prefetchedData])

  useEffect(() => {
    if (fetchingStaff || (!isSuperAdmin && !isCityAdmin)) return undefined

    const scheduleRefresh = () => {
      if (realtimeTimerRef.current) {
        window.clearTimeout(realtimeTimerRef.current)
      }
      realtimeTimerRef.current = window.setTimeout(() => {
        void loadCommissions(monthInput)
      }, 220)
    }

    const channel = supabase
      .channel("public:staff-commissions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_fee_payments" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "physical_verification_payments" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "city_admin_commission_payouts" },
        scheduleRefresh
      )
      .subscribe()

    return () => {
      if (realtimeTimerRef.current) {
        window.clearTimeout(realtimeTimerRef.current)
      }
      supabase.removeChannel(channel)
    }
  }, [fetchingStaff, isCityAdmin, isSuperAdmin, loadCommissions, monthInput])

  const beginMarkPaid = useCallback((row) => {
    if (!isClosed) {
      notify({
        type: "error",
        title: "Month still open",
        message: "Commission can only be marked paid after the selected month has ended.",
      })
      return
    }

    pendingPaymentRowRef.current = row
    receiptInputRef.current?.click()
  }, [isClosed, notify])

  const handleReceiptSelected = useCallback(async (event) => {
    const file = event.target.files?.[0] || null
    event.target.value = ""

    const row = pendingPaymentRowRef.current
    pendingPaymentRowRef.current = null
    if (!file || !row) return

    const paymentReference = await prompt({
      type: "info",
      title: "Commission payment reference",
      message: `Enter the bank transfer reference for ${row.city_name} ${monthLabel}.`,
      inputLabel: "Payment reference",
      placeholder: `COM-${row.city_id}-${monthStart}`,
      defaultValue: `COM-${row.city_id}-${monthStart}`,
      confirmText: "Continue",
      cancelText: "Cancel",
    })

    if (paymentReference === null) return

    const confirmed = await confirm({
      type: "info",
      title: "Mark commission paid",
      message:
        `${row.city_name} commission for ${monthLabel} will be marked paid.\n\n` +
        `${formatCommissionFormula(row)}\n\n` +
        "The uploaded receipt will become visible to that city admin.",
      confirmText: "Mark paid",
      cancelText: "Cancel",
    })

    if (!confirmed) return

    try {
      setPayingCityId(row.city_id)
      const uploaded = await uploadCommissionReceipt({
        file,
        userId: authUser?.id,
        cityId: row.city_id,
        monthStart,
      })

      const { data, error } = await supabase.rpc("ctm_mark_city_admin_commission_paid", {
        p_month: monthStart,
        p_city_id: row.city_id,
        p_receipt_path: uploaded.path,
        p_receipt_url: uploaded.url,
        p_payment_reference: String(paymentReference || "").trim(),
        p_note: `Commission payout for ${monthLabel}`,
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      notify({
        kind: "toast",
        type: "success",
        message: "Commission payout marked paid.",
      })
      await loadCommissions(monthInput)
    } catch (error) {
      console.error("Commission payout failed:", error)
      notify({
        type: "error",
        title: "Could not mark commission paid",
        message: getFriendlyErrorMessage(error, "Could not mark this commission paid."),
      })
    } finally {
      setPayingCityId(null)
    }
  }, [authUser?.id, confirm, loadCommissions, monthInput, monthLabel, monthStart, notify, prompt])

  const handleMonthSubmit = useCallback((event) => {
    event.preventDefault()
    void loadCommissions(monthInput)
  }, [loadCommissions, monthInput])

  return (
    <StaffPortalShell
      activeKey="commissions"
      title="Commission Payments"
      description="Monthly city-admin take-home pay calculated from verified cash inflow."
      headerActions={[
        <QuickActionButton
          key="refresh"
          icon={<FaRotateRight className={loading ? "animate-spin" : ""} />}
          label="Refresh"
          tone="white"
          onClick={() => loadCommissions(monthInput)}
        />,
      ]}
    >
      <input
        ref={receiptInputRef}
        type="file"
        accept={COMMISSION_RECEIPT_ACCEPT}
        className="hidden"
        onChange={handleReceiptSelected}
      />

      <SectionHeading
        eyebrow="Finance"
        title={`${monthLabel} Commission`}
        description={`${actorLabel} commission is calculated as subscriptions/renewals plus paid N5,000 verification fees, multiplied by 20%. Promo verification is excluded.`}
        actions={
          <form onSubmit={handleMonthSubmit} className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 shadow-sm">
              <FaCalendarDays className="text-pink-600" />
              <input
                type="month"
                value={monthInput}
                max={getCurrentMonthInputValue()}
                onChange={(event) => setMonthInput(event.target.value)}
                className="bg-transparent font-black text-slate-900 outline-none"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <FaArrowUpRightFromSquare />
              Open month
            </button>
          </form>
        }
      />

      {pageError ? (
        <InlineErrorState
          title="Commission records unavailable"
          message={pageError}
          retryLabel="Retry"
          onRetry={() => loadCommissions(monthInput)}
        />
      ) : null}

      <section className="mb-6 overflow-hidden rounded-[36px] bg-slate-950 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <div className="relative p-6 sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(219,39,119,0.38),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.28),transparent_28%)]" />
          <div className="relative grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/65">
                <FaBuildingColumns />
                {isClosed ? "Closed month ledger" : "Live month estimate"}
              </div>
              <h3 className="mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                {formatNaira(totals.commission_amount)}
              </h3>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/65">
                Total take-home commission from {formatNaira(totals.gross_inflow)} gross inflow at {formatPercent(summary?.commission_rate || 0.2)}.
                {isSuperAdmin ? " Super admin sees the all-city total." : " City admin view is limited to assigned city."}
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/10 p-5 backdrop-blur">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Formula</div>
              <div className="mt-3 text-lg font-black leading-8">
                ({formatNaira(totals.subscription_total)} + {formatNaira(totals.verification_total)}) x {formatPercent(summary?.commission_rate || 0.2)}
              </div>
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950">
                Payable: {formatNaira(totals.commission_amount)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<FaWallet />}
          label="Subscription inflow"
          value={formatNaira(totals.subscription_total)}
          detail="Approved service-fee and renewal payments."
          tone="green"
        />
        <StatCard
          icon={<FaReceipt />}
          label="Verification inflow"
          value={formatNaira(totals.verification_total)}
          detail="Paid N5,000 verification fees only. Promo is excluded."
          tone="pink"
        />
        <StatCard
          icon={<FaBuildingColumns />}
          label="Paid commission"
          value={formatNaira(totals.paid_commission)}
          detail="Months already marked paid with receipt."
          tone="slate"
        />
        <StatCard
          icon={<FaClock />}
          label="Unpaid commission"
          value={formatNaira(totals.unpaid_commission)}
          detail={isClosed ? "Ready for payout review." : "Current month is still accumulating."}
          tone="amber"
        />
      </div>

      {loading ? (
        <div className="rounded-[32px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          <FaCircleNotch className="mx-auto mb-3 animate-spin text-4xl text-pink-600" />
          <p className="font-black">Loading commission ledger...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[32px] border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          <FaWallet className="mx-auto mb-3 text-4xl text-slate-300" />
          <h3 className="text-xl font-black text-slate-900">No commission activity</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6">
            There is no eligible cash inflow for this month yet. The ledger will update automatically when qualifying payments are recorded.
          </p>
        </div>
      ) : (
        <div className="grid gap-5">
          {rows.map((row) => (
            <CommissionRow
              key={row.city_id}
              row={row}
              isClosed={isClosed}
              isSuperAdmin={isSuperAdmin}
              signedUrl={signedUrls[row.city_id] || ""}
              paying={payingCityId === row.city_id}
              onMarkPaid={beginMarkPaid}
            />
          ))}
        </div>
      )}

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <FaTriangleExclamation />
          </div>
          <div>
            <h3 className="font-black text-slate-950">Finance guardrails</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              Super admins can mark only completed months as paid, and each payout requires an uploaded receipt. Receipt uploads must follow {COMMISSION_RECEIPT_RULE_LABEL}.
            </p>
          </div>
        </div>
      </div>
    </StaffPortalShell>
  )
}
