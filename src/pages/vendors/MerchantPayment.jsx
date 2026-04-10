import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowUpFromBracket,
  FaBuildingColumns,
  FaCircleCheck,
  FaCircleNotch,
  FaClock,
  FaIdCardClip,
  FaLocationDot,
  FaReceipt,
  FaTicket,
  FaTriangleExclamation,
  FaVideo,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { invokeEdgeFunctionAuthed } from "../../lib/edgeFunctions"
import useAuthSession from "../../hooks/useAuthSession"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { CTM_BANK_ACCOUNT, PHYSICAL_VERIFICATION_FEE, normalizePromoCode } from "../../lib/paymentConfig"
import {
  createPaymentProof,
  fetchLatestPaymentProof,
  formatNaira,
  getPaymentReceiptRuleLabel,
  getProofStatusCopy,
  uploadPaymentReceipt,
} from "../../lib/offlinePayments"

async function extractFunctionErrorMessage(error, fallback = "Verification failed") {
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

  if (rawMessage.trim()) return rawMessage
  return fallback
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

  const parsedShopId = useMemo(() => {
    const value = Number(urlShopId)
    return Number.isFinite(value) && value > 0 ? value : null
  }, [urlShopId])

  const canApplyPromo = normalizePromoCode(promoCode).length === 6 && !processingPromo && !submittingProof
  const canUploadProof = receiptFile && !submittingProof && !processingPromo && paymentProof?.status !== "pending"

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

      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("*")
        .eq("id", parsedShopId)
        .eq("owner_id", user.id)
        .maybeSingle()
      if (shopErr || !shop) throw new Error("Shop not found or access denied")

      if (shop.is_verified || shop.kyc_status === "approved") {
        notify({
          type: "info",
          title: "Already approved",
          message: "Your shop has already completed this verification step.",
        })
        navigate("/vendor-panel")
        return
      }

      const { data: paymentRecord } = await supabase
        .from("physical_verification_payments")
        .select("id")
        .eq("merchant_id", user.id)
        .eq("status", "success")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (paymentRecord) {
        if (shop.status === "pending_kyc_review" || shop.kyc_status === "submitted") {
          notify({
            type: "info",
            title: "KYC in review",
            message: "We are currently reviewing your video KYC. We will notify you once approved.",
          })
          navigate("/vendor-panel")
        } else {
          notify({
            type: "success",
            title: "Payment already confirmed",
            message: "Your payment is confirmed. Let's record your video KYC.",
          })
          navigate(`/merchant-video-kyc?shop_id=${shop.id}`)
        }
        return
      }

      const [{ data: profile, error: profErr }, latestProof] = await Promise.all([
        supabase
          .from("profiles")
          .select("*, cities(name)")
          .eq("id", user.id)
          .single(),
        fetchLatestPaymentProof({
          userId: user.id,
          shopId: parsedShopId,
          paymentKind: "physical_verification",
        }),
      ])
      if (profErr || !profile) throw new Error("Profile not found")

      setPaymentProof(latestProof)
      setShopDetails({
        merchantName: profile.full_name || "Merchant",
        shopName: shop.name,
        cityName: profile.cities?.name || "Unknown City",
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
      navigate("/vendor-panel")
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [isOffline, navigate, notify, parsedShopId, user])

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
              notify({
                type: "success",
                title: "Payment approved",
                message: "Your payment is confirmed. Continue to video KYC.",
              })
              navigate(`/merchant-video-kyc?shop_id=${parsedShopId}`)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [navigate, notify, parsedShopId, user?.id])

  const verifyPromoOnBackend = useCallback(async (txId) => {
    if (!txId || processingPromo || !parsedShopId) return

    try {
      setProcessingPromo(true)
      setStatusError(false)
      setStatusMsg("")

      const { data, error } = await invokeEdgeFunctionAuthed("verify-physical-paystack", {
        transactionId: txId,
        shopId: parsedShopId,
        gateway: "promo",
      })

      if (error) {
        const detailedMessage = await extractFunctionErrorMessage(error, "Promo verification failed")
        throw new Error(detailedMessage)
      }
      if (data?.error) throw new Error(data.error)

      setStatusMsg("Promo code accepted. Redirecting to video KYC...")
      window.setTimeout(() => {
        localStorage.removeItem(`vendor_panel_${user.id}`)
        sessionStorage.removeItem(`vendor_panel_${user.id}`)
        navigate(`/merchant-video-kyc?shop_id=${parsedShopId}`)
      }, 900)
    } catch (error) {
      console.error(error)
      setStatusError(true)
      setStatusMsg(getFriendlyErrorMessage(error, "Promo verification failed."))
      setProcessingPromo(false)
    }
  }, [navigate, parsedShopId, processingPromo, user])

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
      setReceiptFile(null)
      setDepositorName("")
      setTransferReference("")
      setStatusMsg("Receipt submitted. Confirmation can take up to 48 hours.")
      notify({
        type: "success",
        title: "Receipt submitted",
        message: "Your proof of payment has been sent to CTMerchant staff for confirmation.",
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
      className={`flex min-h-screen items-center justify-center bg-[#F8FAFC] p-5 ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <div className="relative w-full max-w-[760px] overflow-hidden rounded-[28px] border border-[#E2E8F0] bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.08)] sm:p-8">
        <div className="absolute left-0 right-0 top-0 h-1.5 bg-[#D97706]"></div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF3C7] text-3xl text-[#D97706]">
              <FaIdCardClip />
            </div>
            <h2 className="mb-2 text-[1.45rem] font-extrabold text-[#2E1065]">Digital ID & Promo Banner Fee</h2>
            <p className="mb-5 text-[0.95rem] leading-relaxed text-[#64748B]">
              Pay the one-time verification fee into CTMerchant account, upload your receipt, then our staff confirms it within 48 hours.
            </p>

            <div className="mb-5 rounded-2xl bg-[#F1F5F9] p-5">
              <div className="mb-1 text-[0.78rem] font-bold uppercase tracking-widest text-[#64748B]">Amount to Pay</div>
              <div className="text-4xl font-extrabold text-[#0F172A]">{formatNaira(PHYSICAL_VERIFICATION_FEE)}</div>
            </div>

            <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-left text-[0.85rem] leading-relaxed text-[#991B1B]">
              <strong><FaVideo className="mr-1 inline" /> Next Step: Video KYC</strong>
              <br />
              After staff confirms payment, you will record a short 60-second video inside your physical shop at:
              <div className="my-3 flex items-start gap-2 rounded-lg border border-dashed border-[#FCA5A5] bg-white p-3 font-semibold text-[#7F1D1D]">
                <FaLocationDot className="mt-[3px] shrink-0" />
                <span>{shopDetails.shopAddress}</span>
              </div>
              This fee is strictly non-refundable. If you do not have a physical shop, please contact support before paying.
            </div>
          </div>

          <div>
            <StatusCard proof={paymentProof} />

            <div className="mb-5 rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-5 text-left">
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

            {!processingPromo && !statusMsg && (
              <div className="border-t border-dashed border-[#E2E8F0] pt-5">
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-left shadow-sm">
                  <label className="mb-2 flex items-center gap-2 text-[0.85rem] font-bold text-[#64748B]">
                    <FaTicket className="text-[#D97706]" /> Have a Promo Code?
                  </label>
                  <div className="flex gap-2">
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
                      className="rounded-lg bg-[#0F172A] px-4 py-2 font-bold text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50"
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
