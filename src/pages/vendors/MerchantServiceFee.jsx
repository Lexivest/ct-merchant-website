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
  FaCopy,
  FaReceipt,
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import useAuthSession from "../../hooks/useAuthSession"
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh"
import { clearCachedFetchStore } from "../../hooks/useCachedFetch"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { CTM_BANK_ACCOUNT, SERVICE_FEE_PLANS } from "../../lib/paymentConfig"
import {
  assertCanSubmitPaymentProof,
  createPaymentProof,
  fetchLatestPaymentProof,
  formatNaira,
  getPaymentReceiptRuleLabel,
  getProofStatusCopy,
  isFutureDate,
  uploadPaymentReceipt,
} from "../../lib/offlinePayments"

function formatFileSize(bytes) {
  const size = Number(bytes || 0)
  if (!Number.isFinite(size) || size <= 0) return "Unknown size"
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
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

const PREMIUM_FEATURES = Object.freeze([
  "Unlimited promo banner generation",
  "CT Studio powered product uploads",
  "Shop news",
  "Shop banner",
  "CT-AI",
  "Fairly used product uploads",
  "Special offers",
])

function BankDetailCopyRow({ label, value, onCopy }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(label, value)}
      className="group w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#D97706] hover:bg-[#FFFBEB] sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
          <div className={`mt-1 break-words font-black text-[#0F172A] ${label === "Account Number" ? "font-mono text-xl tracking-wide sm:text-2xl" : "text-base"}`}>
            {value}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[0.72rem] font-black text-slate-600 transition group-hover:bg-[#FEF3C7] group-hover:text-[#92400E]">
          <FaCopy /> Tap to copy
        </span>
      </div>
    </button>
  )
}

function OfflineBankDetailsModal({ open, amountLabel, planLabel, onClose, onCopy }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/55 px-3 py-4 backdrop-blur-sm sm:py-6">
      <div className="w-full max-w-[520px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[28px] border border-white/70 bg-[#F8FAFC] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.35)] sm:max-h-[calc(100dvh-3rem)] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4 sm:mb-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FEF3C7] px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#92400E]">
              <FaBuildingColumns /> Offline Payment
            </div>
            <h3 className="mt-3 text-2xl font-black text-[#0F172A]">Bank transfer details</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {planLabel} payment: {amountLabel}. Tap any detail to copy.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white p-3 text-slate-500 shadow-sm transition hover:bg-slate-900 hover:text-white"
            aria-label="Close bank details"
          >
            <FaXmark />
          </button>
        </div>

        <div className="grid gap-3">
          <BankDetailCopyRow label="Bank Name" value={CTM_BANK_ACCOUNT.bankName} onCopy={onCopy} />
          <BankDetailCopyRow label="Account Name" value={CTM_BANK_ACCOUNT.accountName} onCopy={onCopy} />
          <BankDetailCopyRow label="Account Number" value={CTM_BANK_ACCOUNT.accountNumber} onCopy={onCopy} />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-[#2E1065] px-5 py-3.5 text-sm font-black text-white transition hover:bg-[#4C1D95]"
        >
          I have copied the details
        </button>
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
  const cameFromVendorTransition = location.state?.fromVendorTransition === true

  const { user, loading: authLoading, isOffline } = useAuthSession()

  const [loading, setLoading] = useState(() => !prefetchedData && !cameFromVendorTransition)
  const [error, setError] = useState(null)
  const [submittingProof, setSubmittingProof] = useState(false)
  const [shopData, setShopData] = useState(() => prefetchedData?.shopData || null)
  const [selectedPlan, setSelectedPlan] = useState("")
  const [paymentProof, setPaymentProof] = useState(null)
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("")
  const [receiptInputKey, setReceiptInputKey] = useState(0)
  const [depositorName, setDepositorName] = useState("")
  const [transferReference, setTransferReference] = useState("")
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))
  const [bankDetailsOpen, setBankDetailsOpen] = useState(false)

  const selectedPlanData = SERVICE_FEE_PLANS[selectedPlan]
  const currentPlan = shopData?.subscription_plan || "No Active Plan"
  const currentPlanLabel = SERVICE_FEE_PLANS[currentPlan]?.label || currentPlan.replace("_", " ")
  const isFreeTrial = currentPlan === "Free Trial"
  const isActive = isFutureDate(shopData?.subscription_end_date)
  const isVerified = Boolean(shopData?.is_verified)
  const canUploadProof = Boolean(
    receiptFile &&
      selectedPlanData &&
      isVerified &&
      !isActive &&
      !submittingProof &&
      paymentProof?.status !== "pending"
  )

  const refreshVendorPanelState = useCallback(() => {
    if (!user?.id) return
    clearCachedFetchStore((key) => key === `vendor_panel_${user.id}`)
  }, [user?.id])

  const handleCopyBankDetail = useCallback(async (label, value) => {
    const text = String(value || "")

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = text
        textarea.setAttribute("readonly", "")
        textarea.style.position = "fixed"
        textarea.style.opacity = "0"
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        textarea.remove()
      }

      notify({
        kind: "toast",
        type: "success",
        title: "Copied",
        message: `${label} copied.`,
      })
    } catch {
      notify({
        kind: "toast",
        type: "error",
        title: "Copy failed",
        message: "Please copy the payment detail manually.",
      })
    }
  }, [notify])

  useEffect(() => {
    if (!receiptFile || !receiptFile.type?.startsWith("image/")) {
      setReceiptPreviewUrl("")
      return undefined
    }

    const objectUrl = URL.createObjectURL(receiptFile)
    setReceiptPreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [receiptFile])

  const fetchSubscription = useCallback(async ({ showLoader = true } = {}) => {
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
      if (showLoader) setLoading(false)
      return
    }

    try {
      if (showLoader) setLoading(true)

      let currentShopId = urlShopId
      if (!currentShopId) {
        const { data: shopLookup } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle()
        if (!shopLookup) throw new Error("Shop not found.")
        currentShopId = shopLookup.id
      }

      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("id, name, created_at, subscription_end_date, subscription_plan, is_verified, kyc_status")
        .eq("id", currentShopId)
        .eq("owner_id", user.id)
        .maybeSingle()

      if (shopErr || !shop) throw new Error("Could not load shop details.")
      setShopData(shop)
      const latestServiceProof = await fetchLatestPaymentProof({
        userId: user.id,
        shopId: shop.id,
        paymentKind: "service_fee",
        shopCreatedAt: shop.created_at,
      })

      if (latestServiceProof) {
        setPaymentProof(latestServiceProof)
        if (latestServiceProof.plan) {
          setSelectedPlan((current) => current || latestServiceProof.plan)
        }
      } else {
        setPaymentProof(null)
      }
      setError(null)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."))
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [isOffline, prefetchedData, prefetchedReady, urlShopId, user])

  useEffect(() => {
    if (!authLoading) {
      void fetchSubscription({ showLoader: !cameFromVendorTransition })
    }
  }, [authLoading, cameFromVendorTransition, fetchSubscription])

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
    if (!selectedPlan) {
      setPaymentProof(null)
      return
    }

    if (!user?.id || !shopData?.id) return

    setPaymentProof(null)

    Promise.all([
      fetchLatestPaymentProof({
        userId: user.id,
        shopId: shopData.id,
        paymentKind: "service_fee",
        shopCreatedAt: shopData.created_at,
      }),
      fetchLatestPaymentProof({
        userId: user.id,
        shopId: shopData.id,
        paymentKind: "service_fee",
        plan: selectedPlan,
        shopCreatedAt: shopData.created_at,
      }),
    ])
      .then(([latestAnyServiceProof, latestSelectedPlanProof]) => {
        if (latestAnyServiceProof?.status === "pending") {
          setPaymentProof(latestAnyServiceProof)
          return
        }

        setPaymentProof(latestSelectedPlanProof)
      })
      .catch((proofError) => console.warn("Could not load service payment proof", proofError))
  }, [selectedPlan, shopData?.created_at, shopData?.id, user?.id])

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
            nextProof?.payment_kind === "service_fee"
          ) {
            setPaymentProof(nextProof)
            if (nextProof.plan) {
              setSelectedPlan((current) => current || nextProof.plan)
            }
            refreshVendorPanelState()
            if (nextProof.status === "approved") {
              notify({
                type: "success",
                title: "Subscription payment approved",
                message: "Your subscription has been activated.",
              })
              void fetchSubscription({ showLoader: false })
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchSubscription, notify, refreshVendorPanelState, shopData?.id, user?.id])

  const handleSubmitProof = async () => {
    if (!canUploadProof || !user?.id || !shopData?.id || !selectedPlanData) return

    try {
      setSubmittingProof(true)

      const proofGate = await assertCanSubmitPaymentProof({
        userId: user.id,
        shopId: shopData.id,
        paymentKind: "service_fee",
        plan: selectedPlan,
      })

      setShopData((current) => (current ? { ...current, ...proofGate.shop } : proofGate.shop))
      setPaymentProof(proofGate.latestProof || null)

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
      refreshVendorPanelState()
      setReceiptFile(null)
      setReceiptInputKey((key) => key + 1)
      setDepositorName("")
      setTransferReference("")
      notify({
        type: "success",
        title: "Receipt submitted",
        message: "Your subscription proof has been sent to CTMerchant staff for review.",
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

  const handleReceiptFileChange = (event) => {
    setReceiptFile(event.target.files?.[0] || null)
  }

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
      <GlobalErrorScreen
        error={error}
        message={error}
        onRetry={() => window.location.reload()}
        onBack={() => navigate("/vendor-panel")}
      />
    )
  }

  return (
    <div
      className={`min-h-screen overflow-x-hidden bg-[#F8FAFC] p-5 text-[#1E293B] ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <OfflineBankDetailsModal
        open={bankDetailsOpen}
        amountLabel={selectedPlanData ? formatNaira(selectedPlanData.amount) : "the selected amount"}
        planLabel={selectedPlanData?.label || "Selected plan"}
        onClose={() => setBankDetailsOpen(false)}
        onCopy={handleCopyBankDetail}
      />

      <div className="mx-auto w-full max-w-[980px] min-w-0">
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-[#2E1065] p-4 text-white shadow-sm">
          <button onClick={() => navigate("/vendor-panel")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-[1.1rem] transition hover:bg-white/30">
            <FaArrowLeft />
          </button>
          <div>
            <div className="text-[1.25rem] font-bold">Service Fee Portal</div>
            <div className="mt-0.5 text-sm font-semibold text-white/70">Premium marketplace subscription</div>
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-sm sm:flex-nowrap sm:p-6">
          <div>
            <h3 className="mb-1 text-[0.95rem] font-semibold text-[#64748B] sm:text-[1rem]">Current Plan</h3>
            <h2 className="mb-3 text-[1.45rem] font-black leading-[1.05] text-[#2E1065] sm:text-[1.65rem]">{currentPlanLabel}</h2>
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-bold sm:px-4 sm:py-2 sm:text-[0.85rem] ${isActive ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEE2E2] text-[#DC2626]"}`}>
              {isActive ? <><FaCircleCheck /> {isFreeTrial ? "ACTIVE TRIAL" : "ACTIVE"}</> : <><FaCircleXmark /> EXPIRED</>}
            </div>
          </div>

          <div className="max-w-[280px] text-left sm:max-w-[250px] sm:text-right">
            <div className={`text-[1.8rem] font-black leading-none sm:text-[2.1rem] ${!isActive ? "text-[#DC2626]" : "text-[#16A34A]"}`}>
              {!isActive ? "Locked" : "Active"}
            </div>
            <div className="mt-1 text-[0.8rem] font-semibold leading-[1.35] text-[#64748B] sm:text-[0.88rem]">
              {!isActive ? "Choose a premium plan to continue." : `Valid Until: ${formattedExpiry}`}
            </div>
          </div>
        </div>

        {!isVerified ? (
          <div className="mb-8 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-[0.95rem] font-semibold text-[#991B1B]">
            Your shop must pass physical verification before you can activate a service fee plan.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <div className="min-w-0">
            <h2 className="mb-5 text-center text-[1.5rem] font-black text-[#0F172A]">Subscription Plans</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    className={`relative overflow-hidden rounded-[20px] border-2 bg-white p-6 text-left transition-transform hover:-translate-y-1 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 ${
                      isSelected ? "border-[#2E1065] shadow-lg" : isCurrentPlan && isActive ? "border-[#16A34A]" : "border-[#E2E8F0]"
                    }`}
                  >
                    <div className="mb-2 text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#DB2777]">{plan.tier}</div>
                    <div className="text-2xl font-black text-[#0F172A]">{plan.label}</div>
                    <div className="mt-1 text-sm font-bold uppercase tracking-wide text-[#64748B]">{plan.duration}</div>
                    <div className="mt-5 text-[2.35rem] font-black leading-none text-[#2E1065]">{formatNaira(plan.amount)}</div>
                    <div className="mt-2 text-[0.9rem] font-bold text-[#16A34A]">{plan.hint}</div>

                    <div className={`w-full rounded-xl p-3.5 text-[1rem] font-extrabold ${
                      isSelected ? "bg-[#2E1065] text-white" : "bg-[#F1F5F9] text-[#1E293B]"
                    }`}>
                      {isCurrentPlan && isActive ? "Active Plan" : isSelected ? "Selected" : "Select Plan"}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 rounded-[22px] border border-[#E2E8F0] bg-white p-5 shadow-sm">
              <div className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-[#DB2777]">All premium plans include</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {PREMIUM_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-sm font-bold text-[#334155]">
                    <FaCheck className="mt-0.5 shrink-0 text-[#16A34A]" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <div className="rounded-[22px] border border-[#E2E8F0] bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-black uppercase tracking-widest text-[#DB2777]">Selected Plan</div>
                {selectedPlanData ? (
                  <div className="mt-1">
                    <div className="text-2xl font-black text-[#0F172A]">{selectedPlanData.label}</div>
                    <div className="mt-1 text-sm font-bold uppercase tracking-wide text-[#64748B]">{selectedPlanData.duration}</div>
                    <div className="mt-2 text-2xl font-black text-[#DB2777]">{formatNaira(selectedPlanData.amount)}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-2xl font-black text-[#0F172A]">Choose a premium plan</div>
                )}
                <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">
                  {selectedPlanData
                    ? "Use a payment option below, then upload your receipt for staff review."
                    : "Select Premium-6 or Premium-12 before uploading a payment receipt."}
                </p>
              </div>

              <StatusCard proof={paymentProof} />

              {!isActive && isVerified ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedPlanData) {
                        notify({
                          kind: "toast",
                          type: "info",
                          title: "Select a plan",
                          message: "Choose Premium-6 or Premium-12 first.",
                        })
                        return
                      }
                      setBankDetailsOpen(true)
                    }}
                    disabled={submittingProof}
                    className="rounded-2xl bg-[#0F172A] p-4 text-left text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 text-lg">
                      <FaBuildingColumns />
                    </div>
                    <div className="text-lg font-black">Pay offline</div>
                    <div className="mt-1 text-xs font-bold text-slate-300">View bank details</div>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4 text-left text-[#64748B]"
                  >
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg text-[#CBD5E1]">
                      <FaBuildingColumns />
                    </div>
                    <div className="text-lg font-black">Pay online</div>
                    <div className="mt-1 text-xs font-bold">Online payment not available</div>
                  </button>
                </div>
              ) : null}

              {!selectedPlanData && !isActive && isVerified ? (
                <div className="mt-5 rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-5 text-center">
                  <FaReceipt className="mx-auto mb-3 text-2xl text-[#94A3B8]" />
                  <div className="font-black text-[#0F172A]">No premium plan selected</div>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#64748B]">
                    Choose a subscription plan first, then the receipt upload window will open here.
                  </p>
                </div>
              ) : null}

              {selectedPlanData && !isActive && isVerified && paymentProof?.status !== "pending" ? (
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
                    key={receiptInputKey}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleReceiptFileChange}
                    disabled={submittingProof}
                    className="mb-2 block w-full max-w-full overflow-hidden rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-4 text-sm font-semibold text-[#475569]"
                  />
                  <div className="mb-4 text-xs font-semibold text-[#64748B]">{getPaymentReceiptRuleLabel()}</div>

                  {receiptFile ? (
                    <div className="mb-4 overflow-hidden rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF]">
                      {receiptPreviewUrl ? (
                        <img
                          src={receiptPreviewUrl}
                          alt="Selected payment receipt preview"
                          className="max-h-[320px] w-full bg-white object-contain"
                        />
                      ) : null}
                      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#1D4ED8]">
                          <FaReceipt />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="break-all font-black text-[#0F172A]">{receiptFile.name}</div>
                          <div className="text-xs font-bold text-[#64748B]">
                            {receiptFile.type || "Receipt file"} - {formatFileSize(receiptFile.size)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReceiptFile(null)
                            setReceiptInputKey((key) => key + 1)
                          }}
                          disabled={submittingProof}
                          className="self-start rounded-xl border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-black text-[#475569] transition hover:bg-[#F8FAFC] disabled:opacity-60 sm:self-auto"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : null}

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
