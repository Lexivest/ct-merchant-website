import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaCircleNotch,
  FaCreditCard,
  FaIdCardClip,
  FaLocationDot,
  FaVideo,
  FaTicket,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import { invokeEdgeFunctionAuthed } from "../../lib/edgeFunctions";
import useAuthSession from "../../hooks/useAuthSession";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";
import { normalizePromoCode } from "../../lib/paymentConfig";

const FEE_AMOUNT = 5000;

async function extractFunctionErrorMessage(error, fallback = "Verification failed") {
  if (!error) return fallback;
  const rawMessage = typeof error.message === "string" ? error.message : "";

  const context = error.context;
  if (context && typeof context.clone === "function") {
    try {
      const asJson = await context.clone().json();
      if (asJson && typeof asJson.error === "string" && asJson.error.trim()) {
        return asJson.error;
      }
    } catch {
      // Ignore non-JSON edge function error bodies.
    }

    try {
      const asText = await context.clone().text();
      if (asText && asText.trim()) return asText.trim();
    } catch {
      // Ignore non-text edge function error bodies.
    }
  }

  if (rawMessage.trim()) return rawMessage;
  return fallback;
}

export default function MerchantPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");
  const callbackReference = searchParams.get("reference") || searchParams.get("trxref") || "";
  const callbackPayment = searchParams.get("payment") || "";
  const { notify } = useGlobalFeedback();
  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusError, setStatusError] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [shopDetails, setShopDetails] = useState(null);
  const [handledReturnRef, setHandledReturnRef] = useState("");

  const canApplyPromo = normalizePromoCode(promoCode).length === 6 && !processing && !startingCheckout;

  useEffect(() => {
    async function init() {
      if (!user) return;

      if (isOffline) {
        setStatusError(true);
        setStatusMsg("Network unavailable. Retry.");
        setLoading(false);
        return;
      }

      const parsedShopId = Number(urlShopId);
      if (!urlShopId || !Number.isFinite(parsedShopId) || parsedShopId <= 0) {
        notify({ type: "error", title: "Shop unavailable", message: "Shop ID is missing." });
        navigate("/vendor-panel");
        return;
      }

      try {
        setLoading(true);

        const { data: shop, error: shopErr } = await supabase
          .from("shops")
          .select("*")
          .eq("id", urlShopId)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (shopErr || !shop) throw new Error("Shop not found or access denied");

        if (shop.is_verified || shop.kyc_status === "approved") {
          notify({
            type: "info",
            title: "Already approved",
            message: "Your shop has already completed this verification step.",
          });
          navigate("/vendor-panel");
          return;
        }

        const { data: paymentRecord } = await supabase
          .from("physical_verification_payments")
          .select("id")
          .eq("merchant_id", user.id)
          .eq("status", "success")
          .maybeSingle();

        if (paymentRecord && !callbackReference) {
          if (shop.status === "pending_kyc_review" || shop.kyc_status === "submitted") {
            notify({
              type: "info",
              title: "KYC in review",
              message: "We are currently reviewing your video KYC. We will notify you once approved.",
            });
            navigate("/vendor-panel");
          } else {
            notify({
              type: "success",
              title: "Payment already confirmed",
              message: "Your payment is already confirmed. Let's record your video KYC.",
            });
            navigate(`/merchant-video-kyc?shop_id=${shop.id}`);
          }
          return;
        }

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("*, cities(name)")
          .eq("id", user.id)
          .single();
        if (profErr || !profile) throw new Error("Profile not found");

        setShopDetails({
          merchantName: profile.full_name || "Merchant",
          shopName: shop.name,
          cityName: profile.cities?.name || "Unknown City",
          shopAddress: shop.address || "Address not provided",
          email: user.email,
        });
      } catch (err) {
        console.error(err);
        notify({
          type: "error",
          title: "Checkout unavailable",
          message: getFriendlyErrorMessage(err, "Could not load payment details. Please try again."),
        });
        navigate("/vendor-panel");
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) init();
  }, [user, authLoading, isOffline, urlShopId, callbackReference, navigate, notify]);

  const verifyPaymentOnBackend = useCallback(async (txId, gateway, { auto = false } = {}) => {
    if (!txId || processing) return;

    try {
      setProcessing(true);
      setStatusError(false);
      setStatusMsg(auto ? "Confirming your payment..." : "");

      const { data, error } = await invokeEdgeFunctionAuthed("verify-physical-paystack", {
        transactionId: txId,
        shopId: Number(urlShopId),
        gateway,
      });

      if (error) {
        const detailedMessage = await extractFunctionErrorMessage(error, "Verification failed");
        throw new Error(detailedMessage);
      }
      if (data?.error) throw new Error(data.error);

      setStatusMsg(
        gateway === "promo"
          ? "Promo code accepted. Redirecting..."
          : "Payment successful. Redirecting you to record your KYC video..."
      );

      setTimeout(() => {
        localStorage.removeItem(`vendor_panel_${user.id}`);
        sessionStorage.removeItem(`vendor_panel_${user.id}`);
        navigate(`/merchant-video-kyc?shop_id=${urlShopId}`);
      }, 2500);
    } catch (error) {
      console.error(error);
      setStatusError(true);
      setStatusMsg(getFriendlyErrorMessage(error, "Verification failed."));
      setProcessing(false);
    }
  }, [navigate, processing, urlShopId, user]);

  useEffect(() => {
    if (!user || !urlShopId || callbackPayment !== "physical" || !callbackReference) return;
    if (handledReturnRef === callbackReference) return;

    setHandledReturnRef(callbackReference);
    verifyPaymentOnBackend(callbackReference, "paystack", { auto: true });
  }, [callbackPayment, callbackReference, handledReturnRef, urlShopId, user, verifyPaymentOnBackend]);

  const handleApplyPromo = () => {
    if (processing || startingCheckout) return;
    const normalizedCode = normalizePromoCode(promoCode);
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) return;
    verifyPaymentOnBackend(normalizedCode, "promo");
  };

  const payWithPaystack = async () => {
    if (processing || startingCheckout || !shopDetails) return;

    try {
      setStartingCheckout(true);
      setStatusError(false);
      setStatusMsg("");

      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      const redirectUrl = `${baseUrl}?shop_id=${encodeURIComponent(urlShopId)}&payment=physical`;

      const { data, error } = await invokeEdgeFunctionAuthed("init-physical-verification-paystack", {
        shopId: Number(urlShopId),
        redirectUrl,
      });

      if (error) {
        const detailedMessage = await extractFunctionErrorMessage(error, "Could not start payment.");
        throw new Error(detailedMessage);
      }
      if (!data?.authorizationUrl) {
        throw new Error("Could not start payment.");
      }

      window.location.assign(data.authorizationUrl);
    } catch (payError) {
      console.error(payError);
      setStatusError(true);
      setStatusMsg(getFriendlyErrorMessage(payError, "Could not start payment."));
      setStartingCheckout(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F8FAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2E1065]/20 border-t-[#2E1065]"></div>
        <p className="mt-4 font-semibold text-[#64748B]">Loading secure checkout...</p>
      </div>
    );
  }

  if (!shopDetails) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-5">
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white p-8 text-center shadow-[0_10px_40px_rgba(0,0,0,0.08)]">
        <div className="absolute left-0 right-0 top-0 h-1.5 bg-[#D97706]"></div>

        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF3C7] text-3xl text-[#D97706]">
          <FaIdCardClip />
        </div>

        <h2 className="mb-2 text-[1.3rem] font-extrabold text-[#2E1065]">Digital ID & Promo Banner Fee</h2>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-[#64748B]">
          A one-time fee to process your Video KYC and permanently unlock your premium Digital ID Card and custom promo banner.
        </p>

        <div className="mb-6 rounded-2xl bg-[#F1F5F9] p-5">
          <div className="mb-1 text-[0.85rem] font-bold uppercase tracking-widest text-[#64748B]">Total Amount</div>
          <div className="text-4xl font-extrabold text-[#0F172A]">N{FEE_AMOUNT.toLocaleString()}</div>
        </div>

        <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-4 text-left">
          <div className="mb-3 flex justify-between text-[0.9rem]">
            <span className="font-semibold text-[#64748B]">Merchant</span>
            <span className="font-bold text-[#0F172A]">{shopDetails.merchantName}</span>
          </div>
          <div className="mb-3 flex justify-between text-[0.9rem]">
            <span className="font-semibold text-[#64748B]">Shop Name</span>
            <span className="font-bold text-[#0F172A]">{shopDetails.shopName}</span>
          </div>
          <div className="flex justify-between text-[0.9rem]">
            <span className="font-semibold text-[#64748B]">City</span>
            <span className="font-bold text-[#0F172A]">{shopDetails.cityName}</span>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-left text-[0.85rem] leading-relaxed text-[#991B1B]">
          <strong><FaVideo className="mr-1 inline" /> Next Step: Video KYC</strong>
          <br />
          After payment, you will be required to record a short 60-second video of yourself inside your physical shop at this exact registered address:
          <div className="my-3 flex items-start gap-2 rounded-lg border border-dashed border-[#FCA5A5] bg-white p-3 font-semibold text-[#7F1D1D]">
            <FaLocationDot className="mt-[3px] shrink-0" />
            <span>{shopDetails.shopAddress}</span>
          </div>
          Your video must clearly prove your shop operates here. <strong>If you do not have a physical shop, do not pay, please contact support.</strong> This fee is strictly non-refundable.
        </div>

        {!processing && !statusMsg && (
          <div className="mb-4 border-t border-dashed border-[#E2E8F0] pt-5">
            <div className="mb-5 rounded-xl border border-[#E2E8F0] bg-white p-4 text-left shadow-sm">
              <label className="mb-2 flex items-center gap-2 text-[0.85rem] font-bold text-[#64748B]">
                <FaTicket className="text-[#D97706]" /> Have a Promo Code?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-DIGIT CODE"
                  value={promoCode}
                  onChange={(e) => setPromoCode(normalizePromoCode(e.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canApplyPromo) {
                      handleApplyPromo();
                    }
                  }}
                  disabled={processing || startingCheckout}
                  className="flex-1 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-2 font-mono text-[1.05rem] font-bold tracking-widest text-[#0F172A] outline-none transition focus:border-[#D97706] focus:bg-white focus:ring-2 focus:ring-[#FEF3C7] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  onClick={handleApplyPromo}
                  disabled={!canApplyPromo}
                  className="rounded-lg bg-[#0F172A] px-5 py-2 font-bold text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Activate Code
                </button>
              </div>
            </div>

            <div className="mb-3 text-[0.85rem] font-bold uppercase tracking-widest text-[#64748B]">Or Pay Securely</div>

            <button
              onClick={payWithPaystack}
              disabled={processing || startingCheckout}
              className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-[#E2E8F0] bg-white p-4 text-[1.05rem] font-bold text-[#0F172A] transition-all hover:-translate-y-0.5 hover:border-[#2E1065] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:border-[#E2E8F0] disabled:hover:bg-white"
            >
              <FaCreditCard className="text-xl text-[#0BA4DB]" />
              {startingCheckout ? "Opening Paystack..." : "Pay with Paystack"}
            </button>
          </div>
        )}

        {statusMsg && (
          <div className={`mt-4 rounded-xl border p-4 text-[0.95rem] font-bold ${statusError ? "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]" : "border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]"}`}>
            {statusMsg}
          </div>
        )}

        {!processing && !startingCheckout && (
          <button
            onClick={() => navigate("/vendor-panel")}
            className="mt-4 text-[0.95rem] font-semibold text-[#64748B] hover:text-[#0F172A] hover:underline"
          >
            Cancel and Return
          </button>
        )}
      </div>

      {(processing || startingCheckout) && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 text-white backdrop-blur-sm">
          <FaCircleNotch className="mb-5 animate-spin text-4xl" />
          <h2 className="mb-2 text-xl font-bold">{startingCheckout ? "Opening Paystack..." : "Processing Securely..."}</h2>
          <p className="font-medium text-slate-200">
            {startingCheckout ? "Redirecting you to secure checkout." : "Please do not close this window."}
          </p>
        </div>
      )}
    </div>
  );
}
