import React, { useCallback, useEffect, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaArrowUpFromBracket,
  FaBuildingColumns,
  FaCheck,
  FaCircleCheck,
  FaCircleNotch,
  FaCircleXmark,
  FaClock,
  FaReceipt,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import useAuthSession from "../../hooks/useAuthSession"
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { CTM_BANK_ACCOUNT, SERVICE_FEE_PLANS } from "../../lib/paymentConfig"
import {
  createPaymentProof,
  fetchLatestPaymentProof,
  formatNaira,
  getPaymentReceiptRuleLabel,
  getProofStatusCopy,
  uploadPaymentReceipt,
} from "../../lib/offlinePayments"

function isFutureDate(value) {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() > Date.now()
}

function StatusCard({ proof }) {
  if (!proof) return null

  const copy = getProofStatusCopy(proof.status)
  const toneClass =
    copy.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : copy.tone === "danger"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-800"
  const Icon = copy.tone === "success" ? FaCircleCheck : copy.tone === "danger" ? FaTriangleExclamation : FaClock

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-1 shrink-0 text-lg" />
        <div>
          <div className="font-black">{copy.title}</div>
          <p className="mt-1 text-sm font-semibold leading-6">{copy.message}</p>
          {proof.review_note ? <p className="mt-2 rounded-xl bg-white/70 p-3 text-sm font-semibold">Staff note: {proof.review_note}</p> : null}
        </div>
      </div>
    </div>
  )
}

export default function MerchantServiceFee() {
  const navigate = useNavigate()
  const location = useLocation()
  usePreventPullToRefresh()
  const { notify } = useGlobalFeedback()
  const [searchParams] = useSearchParams()
  const urlShopId = searchParams.get("shop_id")
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-service-fee"
      ? location.state.prefetchedData
      : null

  const { user, loading: authLoading, isOffline } = useAuthSession()

  const [loading, setLoading] = useState(() => !prefetchedData)
  const [error, setError] = useState(null)
  const [submittingProof, setSubmittingProof] = useState(false)
  const [shopData, setShopData] = useState(() => prefetchedData?.shopData || null)
  const [selectedPlan, setSelectedPlan] = useState("6_Months")
  const [paymentProof, setPaymentProof] = useState(null)
  const [receiptFile, setReceiptFile] = useState(null)
  const [depositorName, setDepositorName] = useState("")
  const [transferReference, setTransferReference] = useState("")
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  const selectedPlanData = SERVICE_FEE_PLANS[selectedPlan]
  const currentPlan = shopData?.subscription_plan || "Free Trial"
  const isFreeTrial = currentPlan === "Free Trial"
  const isActive = isFutureDate(shopData?.subscription_end_date)
  const isVerified = shopData?.is_verified || shopData?.kyc_status === "approved"
  const canUploadProof = Boolean(
    receiptFile &&
      selectedPlanData &&
      isVerified &&
      !isActive &&
      !submittingProof &&
      paymentProof?.status !== "pending"
  )

  const fetchSubscription = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      setShopData(prefetchedData.shopData || null)
      setError(null)
      setLoading(false)
      setPrefetchedReady(false)
      return
    }

    if (!user) return
    if (isOffline) {
      setError("Network unavailable. Retry.")
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      let currentShopId = urlShopId
      if (!currentShopId) {
        const { data: shopLookup } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle()
        if (!shopLookup) throw new Error("Shop not found.")
        currentShopId = shopLookup.id
      }

      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("id, name, subscription_end_date, subscription_plan, is_verified, kyc_status")
        .eq("id", currentShopId)
        .eq("owner_id", user.id)
        .maybeSingle()

      if (shopErr || !shop) throw new Error("Could not load shop details.")
      setShopData(shop)
      setError(null)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."))
    } finally {
      setLoading(false)
    }
  }, [isOffline, prefetchedData, prefetchedReady, urlShopId, user])

  useEffect(() => {
    if (!authLoading) fetchSubscription()
  }, [authLoading, fetchSubscription])

  useEffect(() => {
    if (!user?.id || !shopData?.id || isOffline) return undefined

    const channel = supabase
      .channel(`public:shops:id=eq.${shopData.id}:service-fee`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shops",
          filter: `id=eq.${shopData.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setShopData(null)
            setError("Shop record is no longer available.")
            return
          }

          const nextShop = payload.new || null
          setShopData((prev) => (prev ? { ...prev, ...nextShop } : nextShop))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, shopData?.id, isOffline])

  useEffect(() => {
    if (!user?.id || !shopData?.id || !selectedPlan) return

    fetchLatestPaymentProof({
      userId: user.id,
      shopId: shopData.id,
      paymentKind: "service_fee",
      plan: selectedPlan,
    })
      .then(setPaymentProof)
      .catch((proofError) => console.warn("Could not load service payment proof", proofError))
  }, [selectedPlan, shopData?.id, user?.id])

  useEffect(() => {
    if (!user?.id || !shopData?.id) return undefined

    const channel = supabase
      .channel(`offline-service-payment-${user.id}-${shopData.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offline_payment_proofs",
          filter: `merchant_id=eq.${user.id}`,
        },
        (payload) => {
          const nextProof = payload.new
          if (
            nextProof?.shop_id === shopData.id &&
            nextProof?.payment_kind === "service_fee" &&
            nextProof?.plan === selectedPlan
          ) {
            setPaymentProof(nextProof)
            if (nextProof.status === "approved") {
              notify({
                type: "success",
                title: "Subscription payment approved",
                message: "Your subscription has been activated.",
              })
              void fetchSubscription()
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchSubscription, notify, selectedPlan, shopData?.id, user?.id])

  const handleSubmitProof = async () => {
    if (!canUploadProof || !user?.id || !shopData?.id || !selectedPlanData) return

    try {
      setSubmittingProof(true)

      const uploadedReceipt = await uploadPaymentReceipt({
        file: receiptFile,
        userId: user.id,
        shopId: shopData.id,
        paymentKind: `service_fee_${selectedPlan}`,
      })

      const proof = await createPaymentProof({
        user,
        shopId: shopData.id,
        paymentKind: "service_fee",
        plan: selectedPlan,
        amount: selectedPlanData.amount,
        merchantName: user.user_metadata?.full_name || "Merchant",
        shopName: shopData.name,
        depositorName,
        transferReference,
        receiptPath: uploadedReceipt.path,
        receiptUrl: uploadedReceipt.url,
      })

      setPaymentProof(proof)
      setReceiptFile(null)
      setDepositorName("")
      setTransferReference("")
      notify({
        type: "success",
        title: "Receipt submitted",
        message: "Your subscription proof has been sent to CTMerchant staff for confirmation.",
      })
    } catch (submitError) {
      console.error(submitError)
      notify({
        type: "error",
        title: "Could not submit receipt",
        message: getFriendlyErrorMessage(submitError, "Could not submit receipt. Please try again."),
      })
    } finally {
      setSubmittingProof(false)
    }
  }

  const endDate = shopData?.subscription_end_date ? new Date(shopData.subscription_end_date) : null
  const hasValidEndDate = endDate instanceof Date && !Number.isNaN(endDate.getTime())
  const formattedExpiry = hasValidEndDate
    ? endDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "Unknown"

  if ((authLoading && !shopData) || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F8FAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2E1065]/20 border-t-[#2E1065]"></div>
        <p className="mt-4 font-semibold text-[#64748B]">Loading subscription details...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F8FAFC]">
        <div className="flex w-full items-center gap-4 bg-[#2E1065] px-4 py-4 text-white shadow-sm">
          <button onClick={() => navigate("/vendor-panel")} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 transition hover:bg-white/30"><FaArrowLeft /></button>
          <div className="text-[1.25rem] font-bold">Service Fee Portal</div>
        </div>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="w-full max-w-sm rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="mb-2 font-bold text-slate-900">Failed to load</h3>
            <p className="text-sm text-slate-600">{error}</p>
            <button onClick={() => navigate("/vendor-panel")} className="mt-5 w-full rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-6 py-3 font-bold text-[#1E293B] transition hover:bg-[#E2E8F0]">Back</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen bg-[#F8FAFC] p-5 text-[#1E293B] ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <div className="mx-auto w-full max-w-[980px]">
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-[#2E1065] p-4 text-white shadow-sm">
          <button onClick={() => navigate("/vendor-panel")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-[1.1rem] transition hover:bg-white/30">
            <FaArrowLeft />
          </button>
          <div>
            <div className="text-[1.25rem] font-bold">Service Fee Portal</div>
            <div className="mt-0.5 text-sm font-semibold text-white/70">Offline transfer and receipt confirmation</div>
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-sm sm:flex-nowrap sm:p-6">
          <div>
            <h3 className="mb-1 text-[0.95rem] font-semibold text-[#64748B] sm:text-[1rem]">Current Plan</h3>
            <h2 className="mb-3 text-[1.45rem] font-black leading-[1.05] text-[#2E1065] sm:text-[1.65rem]">{currentPlan.replace("_", " ")}</h2>
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-bold sm:px-4 sm:py-2 sm:text-[0.85rem] ${isActive ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEE2E2] text-[#DC2626]"}`}>
              {isActive ? <><FaCircleCheck /> {isFreeTrial ? "ACTIVE TRIAL" : "ACTIVE"}</> : <><FaCircleXmark /> EXPIRED</>}
            </div>
          </div>

          <div className="max-w-[280px] text-left sm:max-w-[250px] sm:text-right">
            <div className={`text-[1.8rem] font-black leading-none sm:text-[2.1rem] ${!isActive ? "text-[#DC2626]" : "text-[#16A34A]"}`}>
              {!isActive ? "Locked" : "Active"}
            </div>
            <div className="mt-1 text-[0.8rem] font-semibold leading-[1.35] text-[#64748B] sm:text-[0.88rem]">
              {!isActive ? "Choose a plan, transfer, then upload receipt." : `Valid Until: ${formattedExpiry}`}
            </div>
          </div>
        </div>

        {!isVerified ? (
          <div className="mb-8 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-[0.95rem] font-semibold text-[#991B1B]">
            Your shop must pass physical verification before you can activate a service fee plan.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <div>
            <h2 className="mb-5 text-center text-[1.5rem] font-black text-[#0F172A]">Subscription Plans</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {Object.entries(SERVICE_FEE_PLANS).map(([planKey, plan]) => {
                const isCurrentPlan = currentPlan === planKey
                const isSelected = selectedPlan === planKey
                const isDisabled = !isVerified || isActive || submittingProof

                return (
                  <button
                    type="button"
                    key={planKey}
                    disabled={isDisabled}
                    onClick={() => setSelectedPlan(planKey)}
                    className={`relative overflow-hidden rounded-[20px] border-2 bg-white p-8 text-center transition-transform hover:-translate-y-1 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 ${
                      isSelected ? "border-[#2E1065] shadow-lg" : isCurrentPlan && isActive ? "border-[#16A34A]" : "border-[#E2E8F0]"
                    }`}
                  >
                    {planKey === "1_Year" ? (
                      <div className="absolute right-[-30px] top-[12px] rotate-45 bg-[#E11D48] px-8 py-1 text-[0.75rem] font-black tracking-widest text-white">BEST VALUE</div>
                    ) : null}
                    <div className={`mb-3 text-[1.2rem] font-bold ${planKey === "1_Year" ? "text-[#2E1065]" : "text-[#64748B]"}`}>{plan.tier}</div>
                    <div className="mb-2 text-[2.5rem] font-black leading-none text-[#0F172A]">{formatNaira(plan.amount)}</div>
                    <div className="mb-6 text-[0.9rem] font-bold text-[#16A34A]">{plan.hint}</div>

                    <ul className="mb-6 flex flex-col gap-3 text-left text-[0.95rem] text-[#64748B]">
                      <li><FaCheck className="mr-2 inline text-[#16A34A]" /> Continuous AI Indexing</li>
                      <li><FaCheck className="mr-2 inline text-[#16A34A]" /> Unlimited Product Updates</li>
                      <li><FaCheck className="mr-2 inline text-[#16A34A]" /> {plan.label} Validity</li>
                    </ul>

                    <div className={`w-full rounded-xl p-3.5 text-[1rem] font-extrabold ${
                      isSelected ? "bg-[#2E1065] text-white" : "bg-[#F1F5F9] text-[#1E293B]"
                    }`}>
                      {isCurrentPlan && isActive ? "Active Plan" : isSelected ? "Selected" : "Select Plan"}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[22px] border border-[#DBEAFE] bg-[#EFF6FF] p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[#1D4ED8]">
                <FaBuildingColumns /> Bank Transfer Details
              </div>
              <div className="grid gap-3 text-sm">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-bold uppercase text-[#64748B]">Bank Name</div>
                  <div className="mt-1 font-black text-[#0F172A]">{CTM_BANK_ACCOUNT.bankName}</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-bold uppercase text-[#64748B]">Account Name</div>
                  <div className="mt-1 font-black text-[#0F172A]">{CTM_BANK_ACCOUNT.accountName}</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-bold uppercase text-[#64748B]">Account Number</div>
                  <div className="mt-1 font-mono text-2xl font-black tracking-wide text-[#0F172A]">{CTM_BANK_ACCOUNT.accountNumber}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-[#E2E8F0] bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-black uppercase tracking-widest text-[#DB2777]">Selected Plan</div>
                <div className="mt-1 text-2xl font-black text-[#0F172A]">
                  {selectedPlanData?.label} · {formatNaira(selectedPlanData?.amount)}
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">
                  Transfer the exact amount, then upload your receipt. Confirmation can take up to 48 hours.
                </p>
              </div>

              <StatusCard proof={paymentProof} />

              {!isActive && isVerified && paymentProof?.status !== "pending" ? (
                <div className="mt-5">
                  <label className="mb-2 block text-[0.85rem] font-bold text-[#64748B]">Depositor name, optional</label>
                  <input
                    type="text"
                    value={depositorName}
                    onChange={(event) => setDepositorName(event.target.value)}
                    disabled={submittingProof}
                    className="mb-3 w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 font-semibold text-[#0F172A] outline-none focus:border-[#2E1065] focus:bg-white"
                  />

                  <label className="mb-2 block text-[0.85rem] font-bold text-[#64748B]">Transfer reference, optional</label>
                  <input
                    type="text"
                    value={transferReference}
                    onChange={(event) => setTransferReference(event.target.value)}
                    disabled={submittingProof}
                    className="mb-3 w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 font-semibold text-[#0F172A] outline-none focus:border-[#2E1065] focus:bg-white"
                  />

                  <label className="mb-2 flex items-center gap-2 text-[0.85rem] font-bold text-[#64748B]">
                    <FaReceipt className="text-[#D97706]" /> Upload payment receipt
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
                    disabled={submittingProof}
                    className="mb-2 w-full rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-4 text-sm font-semibold text-[#475569]"
                  />
                  <div className="mb-4 text-xs font-semibold text-[#64748B]">{getPaymentReceiptRuleLabel()}</div>

                  <button
                    onClick={handleSubmitProof}
                    disabled={!canUploadProof}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#2E1065] p-4 text-[1rem] font-extrabold text-white transition hover:bg-[#4c1d95] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                  >
                    {submittingProof ? <FaCircleNotch className="animate-spin" /> : <FaArrowUpFromBracket />}
                    {submittingProof ? "Submitting Receipt..." : "Submit Receipt for Review"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
