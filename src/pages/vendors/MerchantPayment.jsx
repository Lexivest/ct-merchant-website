import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowUpFromBracket,
  FaBuildingColumns,
  FaCircleCheck,
  FaCircleNotch,
  FaClock,
  FaCopy,
  FaLocationDot,
  FaReceipt,
  FaTicket,
  FaTriangleExclamation,
  FaBuildingCircleCheck,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import useAuthSession from "../../hooks/useAuthSession"
import { clearCachedFetchStore } from "../../hooks/useCachedFetch"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { CTM_BANK_ACCOUNT, PHYSICAL_VERIFICATION_FEE, normalizePromoCode } from "../../lib/paymentConfig"
import {
  assertCanSubmitPaymentProof,
  createPaymentProof,
  fetchVerificationAccessStatus,
  formatNaira,
  getPaymentReceiptRuleLabel,
  getProofStatusCopy,
  uploadPaymentReceipt,
} from "../../lib/offlinePayments"

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
    <div className={`mb-6 rounded-2xl border p-4 text-left ${toneClass}`}>
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

function OfflineBankDetailsPanel({ open, amountLabel, onCopy }) {
  if (!open) return null

  return (
    <div className="mb-5 rounded-[24px] border border-[#FBBF24]/60 bg-[#FFFBEB] p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#FEF3C7] px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#92400E]">
          <FaBuildingColumns /> Offline Payment
        </div>
        <h3 className="mt-3 text-xl font-black text-[#0F172A]">Bank transfer details</h3>
        <p className="mt-1 text-sm font-semibold text-slate-600">Tap any detail to copy. Pay exactly {amountLabel}.</p>
      </div>

      <div className="grid gap-3">
        <BankDetailCopyRow label="Bank Name" value={CTM_BANK_ACCOUNT.bankName} onCopy={onCopy} />
        <BankDetailCopyRow label="Account Name" value={CTM_BANK_ACCOUNT.accountName} onCopy={onCopy} />
        <BankDetailCopyRow label="Account Number" value={CTM_BANK_ACCOUNT.accountNumber} onCopy={onCopy} />
      </div>
    </div>
  )
}

export default function MerchantPayment() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const urlShopId = searchParams.get("shop_id")
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-payment"
      ? location.state.prefetchedData
      : null
  const { notify } = useGlobalFeedback()
  const { user, loading: authLoading, isOffline } = useAuthSession()

  const [loading, setLoading] = useState(() => !prefetchedData)
  const [processingPromo, setProcessingPromo] = useState(false)
  const [submittingProof, setSubmittingProof] = useState(false)
  const [statusMsg, setStatusMsg] = useState("")
  const [statusError, setStatusError] = useState(false)
  const [promoCode, setPromoCode] = useState("")
  const [receiptFile, setReceiptFile] = useState(null)
  const [depositorName, setDepositorName] = useState("")
  const [transferReference, setTransferReference] = useState("")
  const [shopDetails, setShopDetails] = useState(() => prefetchedData?.shopDetails || null)
  const [paymentProof, setPaymentProof] = useState(null)
  const [bankDetailsOpen, setBankDetailsOpen] = useState(false)

  const parsedShopId = useMemo(() => {
    const value = Number(urlShopId)
    return Number.isFinite(value) && value > 0 ? value : null
  }, [urlShopId])

  const canApplyPromo = normalizePromoCode(promoCode).length === 6 && !processingPromo && !submittingProof
  const canUploadProof = receiptFile && !submittingProof && !processingPromo && paymentProof?.status !== "pending"

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

  const openVideoKyc = useCallback((shopId) => {
    if (!shopId) return
    navigate(`/merchant-video-kyc?shop_id=${shopId}`, {
      replace: true,
      state: {
        fromVendorTransition: true,
        skipTransitionNotice: true,
      },
    })
  }, [navigate])

  const refreshVendorPanelState = useCallback(() => {
    if (!user?.id) return

    clearCachedFetchStore((key) => key === `vendor_panel_${user.id}`)
  }, [user?.id])

  const loadPaymentDetails = useCallback(async ({ showLoader = true } = {}) => {
    if (!user || !parsedShopId) return

    if (isOffline) {
      setStatusError(true)
      setStatusMsg("Network unavailable. Please reconnect before submitting payment proof.")
      setLoading(false)
      return
    }

    try {
      if (showLoader) setLoading(true)

      const [shopRes, profileRes] = await Promise.all([
        supabase
          .from("shops")
          .select("*, cities(name)")
          .eq("id", parsedShopId)
          .eq("owner_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("*, cities(name)")
          .eq("id", user.id)
          .single(),
      ])

      const shop = shopRes.data
      if (shopRes.error || !shop) throw new Error("Shop not found or access denied")
      if (profileRes.error || !profileRes.data) throw new Error("Profile not found")
      const entityName = shop.is_service ? "service" : "shop"

      const verificationAccess = await fetchVerificationAccessStatus({
        userId: user.id,
        shopId: parsedShopId,
        shopCreatedAt: shop.created_at,
      })

      if (shop.is_verified) {
        notify({
          kind: "toast",
          type: "info",
          title: "Already approved",
          message: `Your ${entityName} has already completed this verification step.`,
        })
        navigate("/vendor-panel", { replace: true })
        return
      }

      if (shop.status !== "approved") {
        notify({
          kind: "toast",
          type: "info",
          title: "Application pending",
          message:
            `Your ${entityName} application must be approved before you can continue to physical verification payment.`,
        })
        navigate("/vendor-panel", { replace: true })
        return
      }

      if (verificationAccess.paymentConfirmed) {
        refreshVendorPanelState()
        if (shop.status === "pending_kyc_review" || shop.kyc_status === "submitted") {
          notify({
            kind: "toast",
            type: "info",
            title: "KYC in review",
            message: "We are currently reviewing your video KYC. We will notify you once approved.",
          })
          navigate("/vendor-panel", { replace: true })
        } else {
          openVideoKyc(shop.id)
        }
        return
      }

      setPaymentProof(verificationAccess.latestProof)
      setShopDetails({
        merchantName: profileRes.data.full_name || "Merchant",
        shopName: shop.name,
        cityName: profileRes.data.cities?.name || shop.cities?.name || "Unknown City",
        shopAddress: shop.address || "Address not provided",
        email: user.email,
      })
      setStatusError(false)
      setStatusMsg("")
    } catch (err) {
      console.error(err)
      notify({
        type: "error",
        title: "Payment page unavailable",
        message: getFriendlyErrorMessage(err, "Could not load payment details. Please try again."),
      })
      navigate("/vendor-panel", { replace: true })
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [isOffline, navigate, notify, openVideoKyc, parsedShopId, refreshVendorPanelState, user])

  useEffect(() => {
    if (!parsedShopId && !authLoading) {
      notify({ type: "error", title: "Shop unavailable", message: "Shop ID is missing." })
      navigate("/vendor-panel")
      return
    }

    if (prefetchedData) {
      setShopDetails(prefetchedData.shopDetails || null)
      setLoading(false)
      if (user?.id && parsedShopId && !authLoading) {
        void loadPaymentDetails({ showLoader: false })
      }
      return
    }

    if (!authLoading) void loadPaymentDetails()
  }, [authLoading, loadPaymentDetails, navigate, notify, parsedShopId, prefetchedData, user?.id])

  useEffect(() => {
    if (!user?.id || !parsedShopId) return undefined

    const channel = supabase
      .channel(`offline-physical-payment-${user.id}-${parsedShopId}`)
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
            nextProof?.shop_id === parsedShopId &&
            nextProof?.payment_kind === "physical_verification"
          ) {
            setPaymentProof(nextProof)
            if (nextProof.status === "approved") {
              refreshVendorPanelState()
              notify({
                kind: "toast",
                type: "success",
                title: "Payment approved",
                message: "Payment approved. Opening video KYC.",
              })
              openVideoKyc(parsedShopId)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [notify, openVideoKyc, parsedShopId, refreshVendorPanelState, user?.id])

  const verifyPromoOnBackend = useCallback(async (txId) => {
    if (!txId || processingPromo || !parsedShopId) return

    try {
      setProcessingPromo(true)
      setStatusError(false)
      setStatusMsg("")

      const { data, error } = await supabase.rpc("redeem_verification_promo_code_self", {
        p_code: txId,
        p_shop_id: parsedShopId,
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      setStatusMsg(data?.message || "Promo code accepted. Redirecting to video KYC...")
      window.setTimeout(() => {
        try {
          refreshVendorPanelState()
        } catch {
          // Local cache cleanup is best effort before redirecting to KYC.
        }
        openVideoKyc(parsedShopId)
      }, 900)
    } catch (error) {
      console.error(error)
      setStatusError(true)
      setStatusMsg(getFriendlyErrorMessage(error, "Promo verification failed."))
      setProcessingPromo(false)
    }
  }, [openVideoKyc, parsedShopId, processingPromo, refreshVendorPanelState])

  const handleApplyPromo = () => {
    if (!canApplyPromo) return
    const normalizedCode = normalizePromoCode(promoCode)
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) return
    void verifyPromoOnBackend(normalizedCode)
  }

  const handleSubmitProof = async () => {
    if (!canUploadProof || !user?.id || !parsedShopId || !shopDetails) return

    try {
      setSubmittingProof(true)
      setStatusError(false)
      setStatusMsg("Checking latest payment status...")

      const proofGate = await assertCanSubmitPaymentProof({
        userId: user.id,
        shopId: parsedShopId,
        paymentKind: "physical_verification",
      })

      setPaymentProof(proofGate.latestProof || null)
      setStatusMsg("Uploading your receipt...")

      const uploadedReceipt = await uploadPaymentReceipt({
        file: receiptFile,
        userId: user.id,
        shopId: parsedShopId,
        paymentKind: "physical_verification",
      })

      const proof = await createPaymentProof({
        user,
        shopId: parsedShopId,
        paymentKind: "physical_verification",
        amount: PHYSICAL_VERIFICATION_FEE,
        merchantName: shopDetails.merchantName,
        shopName: shopDetails.shopName,
        depositorName,
        transferReference,
        receiptPath: uploadedReceipt.path,
        receiptUrl: uploadedReceipt.url,
      })

      setPaymentProof(proof)
      refreshVendorPanelState()
      setReceiptFile(null)
      setDepositorName("")
      setTransferReference("")
      setStatusMsg("Receipt submitted for staff review.")
      notify({
        type: "success",
        title: "Receipt submitted",
        message: "Your proof of payment has been sent to CTMerchant staff for review.",
      })
    } catch (error) {
      console.error(error)
      setStatusError(true)
      setStatusMsg(getFriendlyErrorMessage(error, "Could not submit receipt. Please try again."))
    } finally {
      setSubmittingProof(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F8FAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2E1065]/20 border-t-[#2E1065]"></div>
        <p className="mt-4 font-semibold text-[#64748B]">Loading payment details...</p>
      </div>
    )
  }

  if (!shopDetails) return null

  return (
    <div
      className={`flex min-h-screen w-full items-start justify-center overflow-x-hidden bg-[#F8FAFC] px-3 py-4 sm:items-center sm:p-5 ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <div className="relative w-full max-w-[760px] min-w-0 overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] sm:rounded-[28px] sm:p-8">
        <div className="absolute left-0 right-0 top-0 h-1.5 bg-[#D97706]"></div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="min-w-0">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF3C7] text-3xl text-[#D97706]">
              <FaBuildingCircleCheck />
            </div>
            <h2 className="mb-2 text-[1.45rem] font-extrabold text-[#2E1065]">Verification Fee</h2>

            <div className="mb-5 rounded-2xl bg-[#F1F5F9] p-5">
              <div className="mb-1 text-[0.78rem] font-bold uppercase tracking-widest text-[#64748B]">Amount to Pay</div>
              <div className="text-3xl font-extrabold text-[#0F172A] sm:text-4xl">{formatNaira(PHYSICAL_VERIFICATION_FEE)}</div>
            </div>

            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 text-left shadow-sm">
              <div className="mb-3 text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#DB2777]">Business Profile</div>
              <div className="mb-3 rounded-xl bg-[#F8FAFC] p-3">
                <div className="text-xs font-bold uppercase text-[#64748B]">Shop Name</div>
                <div className="mt-1 break-words font-black text-[#0F172A]">{shopDetails.shopName}</div>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-3 font-semibold text-[#334155]">
                <FaLocationDot className="mt-[3px] shrink-0" />
                <span className="min-w-0 break-words">{shopDetails.shopAddress}</span>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <StatusCard proof={paymentProof} />

            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBankDetailsOpen((isOpen) => !isOpen)}
                disabled={submittingProof || processingPromo}
                aria-expanded={bankDetailsOpen}
                className="rounded-2xl bg-[#0F172A] p-4 text-left text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 text-lg">
                  <FaBuildingColumns />
                </div>
                <div className="text-lg font-black">Pay offline</div>
                <div className="mt-1 text-xs font-bold text-slate-300">{bankDetailsOpen ? "Hide bank details" : "View bank details"}</div>
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

            <OfflineBankDetailsPanel
              open={bankDetailsOpen}
              amountLabel={formatNaira(PHYSICAL_VERIFICATION_FEE)}
              onCopy={handleCopyBankDetail}
            />

            {paymentProof?.status !== "pending" ? (
              <div className="mb-5 rounded-2xl border border-[#E2E8F0] bg-white p-4 text-left shadow-sm">
                <label className="mb-2 block text-[0.85rem] font-bold text-[#64748B]">Depositor name, optional</label>
                <input
                  type="text"
                  value={depositorName}
                  onChange={(event) => setDepositorName(event.target.value)}
                  disabled={submittingProof || processingPromo}
                  className="mb-3 w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 font-semibold text-[#0F172A] outline-none focus:border-[#2E1065] focus:bg-white"
                />

                <label className="mb-2 block text-[0.85rem] font-bold text-[#64748B]">Transfer reference, optional</label>
                <input
                  type="text"
                  value={transferReference}
                  onChange={(event) => setTransferReference(event.target.value)}
                  disabled={submittingProof || processingPromo}
                  className="mb-3 w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 font-semibold text-[#0F172A] outline-none focus:border-[#2E1065] focus:bg-white"
                />

                <label className="mb-2 flex items-center gap-2 text-[0.85rem] font-bold text-[#64748B]">
                  <FaReceipt className="text-[#D97706]" /> Upload payment receipt
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
                  disabled={submittingProof || processingPromo}
                  className="mb-2 block w-full min-w-0 max-w-full rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-4 text-sm font-semibold text-[#475569] sm:px-4"
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

            {!processingPromo && !statusMsg && (
              <div className="border-t border-dashed border-[#E2E8F0] pt-5">
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-left shadow-sm">
                  <label className="mb-2 flex items-center gap-2 text-[0.85rem] font-bold text-[#64748B]">
                    <FaTicket className="text-[#D97706]" /> Have a Promo Code?
                  </label>
                  <div className="flex min-w-0 gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="6-DIGIT CODE"
                      value={promoCode}
                      onChange={(event) => setPromoCode(normalizePromoCode(event.target.value))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canApplyPromo) {
                          handleApplyPromo()
                        }
                      }}
                      disabled={processingPromo || submittingProof}
                      className="min-w-0 flex-1 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-2 font-mono text-[1.05rem] font-bold tracking-widest text-[#0F172A] outline-none transition focus:border-[#D97706] focus:bg-white focus:ring-2 focus:ring-[#FEF3C7] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button
                      onClick={handleApplyPromo}
                      disabled={!canApplyPromo}
                      className="shrink-0 rounded-lg bg-[#0F172A] px-3 py-2 font-bold text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                    >
                      Activate
                    </button>
                  </div>
                </div>
              </div>
            )}

            {statusMsg ? (
              <div className={`mt-4 rounded-xl border p-4 text-[0.95rem] font-bold ${statusError ? "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]" : "border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]"}`}>
                {statusMsg}
              </div>
            ) : null}

            {!processingPromo && !submittingProof ? (
              <button
                onClick={() => navigate("/vendor-panel")}
                className="mt-5 text-[0.95rem] font-semibold text-[#64748B] hover:text-[#0F172A] hover:underline"
              >
                Cancel and Return
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
