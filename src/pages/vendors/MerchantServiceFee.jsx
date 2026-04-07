import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaCheck,
  FaCircleCheck,
  FaCircleNotch,
  FaCircleXmark,
  FaCreditCard,
  FaTriangleExclamation,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import { invokeEdgeFunctionAuthed } from "../../lib/edgeFunctions";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";

const PLAN_OPTIONS = Object.freeze({
  "6_Months": Object.freeze({ label: "6 Months", amount: 6000, tier: "Standard Tier", hint: "Works out to N1,000 / month" }),
  "1_Year": Object.freeze({ label: "1 Year", amount: 10000, tier: "Professional Tier", hint: "Works out to N833 / month" }),
});

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
    } catch (_) {}

    try {
      const asText = await context.clone().text();
      if (asText && asText.trim()) return asText.trim();
    } catch (_) {}
  }

  if (rawMessage.trim()) return rawMessage;
  return fallback;
}

function isFutureDate(value) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.now();
}

export default function MerchantServiceFee() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const { notify } = useGlobalFeedback();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");
  const callbackReference = searchParams.get("reference") || searchParams.get("trxref") || "";
  const callbackPayment = searchParams.get("payment") || "";
  const callbackPlan = searchParams.get("plan") || "";

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [processingNote, setProcessingNote] = useState("Please do not close this window.");
  const [shopData, setShopData] = useState(null);
  const [firstName, setFirstName] = useState("Merchant");
  const [handledReturnRef, setHandledReturnRef] = useState("");

  const fetchSubscription = async () => {
    if (!user) return;
    if (isOffline) {
      setError("Network unavailable. Retry.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (profile?.full_name) setFirstName(profile.full_name.split(" ")[0]);

      let currentShopId = urlShopId;
      if (!currentShopId) {
        const { data: shopLookup } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle();
        if (!shopLookup) throw new Error("Shop not found.");
        currentShopId = shopLookup.id;
      }

      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("id, subscription_end_date, subscription_plan, is_verified, kyc_status")
        .eq("id", currentShopId)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (shopErr || !shop) throw new Error("Could not load shop details.");
      setShopData(shop);
      setError(null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) fetchSubscription();
  }, [user, authLoading, urlShopId, isOffline]);

  const verifySubscriptionOnBackend = async (txId, planKey, gateway = "paystack", { auto = false } = {}) => {
    if (!txId || !shopData?.id || processing) return;

    try {
      setProcessing(true);
      setStartingCheckout(false);
      setProcessingNote(auto ? "Confirming your payment..." : "Please do not close this window.");

      const { data, error: invokeError } = await invokeEdgeFunctionAuthed("verify-service-fee", {
        transactionId: txId,
        shopId: shopData.id,
        plan: planKey,
        gateway,
      });

      if (invokeError) {
        const detailedMessage = await extractFunctionErrorMessage(invokeError, "Verification failed");
        throw new Error(detailedMessage);
      }
      if (data?.error) throw new Error(data.error);

      notify({
        type: "success",
        title: "Subscription confirmed",
        message: `Your ${PLAN_OPTIONS[planKey]?.label || "service"} plan is now active.`,
      });
      await fetchSubscription();
      navigate(`/service-fee?shop_id=${shopData.id}`, { replace: true });
    } catch (err) {
      console.error(err);
      notify({ type: "error", title: "Verification failed", message: getFriendlyErrorMessage(err, "Verification failed.") });
    } finally {
      setProcessing(false);
      setProcessingNote("Please do not close this window.");
    }
  };

  useEffect(() => {
    if (!shopData?.id || callbackPayment !== "service_fee" || !callbackReference || !callbackPlan) return;
    if (!(callbackPlan in PLAN_OPTIONS)) return;
    if (handledReturnRef === callbackReference) return;

    setHandledReturnRef(callbackReference);
    verifySubscriptionOnBackend(callbackReference, callbackPlan, "paystack", { auto: true });
  }, [shopData?.id, callbackPayment, callbackReference, callbackPlan, handledReturnRef]);

  const startPaystackCheckout = async (planKey) => {
    if (processing || startingCheckout || !shopData?.id) return;
    if (!(planKey in PLAN_OPTIONS)) return;

    try {
      setStartingCheckout(true);
      setProcessingNote("Redirecting you to secure checkout.");

      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      const redirectUrl = `${baseUrl}?shop_id=${encodeURIComponent(shopData.id)}&payment=service_fee&plan=${encodeURIComponent(planKey)}`;

      const { data, error: invokeError } = await invokeEdgeFunctionAuthed("init-service-fee-paystack", {
        shopId: shopData.id,
        plan: planKey,
        redirectUrl,
      });

      if (invokeError) {
        const detailedMessage = await extractFunctionErrorMessage(invokeError, "Could not start payment.");
        throw new Error(detailedMessage);
      }
      if (!data?.authorizationUrl) {
        throw new Error("Could not start payment.");
      }

      window.location.assign(data.authorizationUrl);
    } catch (err) {
      console.error(err);
      notify({ type: "error", title: "Checkout unavailable", message: getFriendlyErrorMessage(err, "Could not start payment.") });
      setStartingCheckout(false);
      setProcessingNote("Please do not close this window.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F8FAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2E1065]/20 border-t-[#2E1065]"></div>
        <p className="mt-4 font-semibold text-[#64748B]">Loading subscription details...</p>
      </div>
    );
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
            <button onClick={() => window.location.reload()} className="mt-5 w-full rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-6 py-3 font-bold text-[#1E293B] transition hover:bg-[#E2E8F0]">Back</button>
          </div>
        </div>
      </div>
    );
  }

  const currentPlan = shopData?.subscription_plan || "Free Trial";
  const isFreeTrial = currentPlan === "Free Trial";
  const isActive = isFutureDate(shopData?.subscription_end_date);
  const isVerified = shopData?.is_verified || shopData?.kyc_status === "approved";
  const endDate = shopData?.subscription_end_date ? new Date(shopData.subscription_end_date) : null;
  const hasValidEndDate = endDate instanceof Date && !Number.isNaN(endDate.getTime());
  const formattedExpiry = hasValidEndDate
    ? endDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "Unknown";

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-5 text-[#1E293B]">
      <div className="mx-auto w-full max-w-[800px]">
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-[#2E1065] p-4 text-white shadow-sm">
          <button onClick={() => navigate("/vendor-panel")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-[1.1rem] transition hover:bg-white/30">
            <FaArrowLeft />
          </button>
          <div className="text-[1.25rem] font-bold">Service Fee Portal</div>
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
              {!isActive ? "Please choose a plan below to unlock your tools." : `Valid Until: ${formattedExpiry}`}
            </div>
          </div>
        </div>

        {!isVerified ? (
          <div className="mb-8 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-[0.95rem] font-semibold text-[#991B1B]">
            Your shop must pass physical verification before you can activate a service fee plan.
          </div>
        ) : null}

        <h2 className="mb-6 text-center text-[1.5rem] font-black text-[#0F172A]">Subscription Plans</h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {Object.entries(PLAN_OPTIONS).map(([planKey, plan]) => {
            const isCurrentPlan = currentPlan === planKey;
            const isDisabled = !isVerified || isActive || processing || startingCheckout;

            return (
              <div
                key={planKey}
                className={`relative overflow-hidden rounded-[20px] border-2 bg-white p-8 text-center transition-transform hover:-translate-y-1 hover:shadow-lg ${
                  isCurrentPlan && isActive ? "border-[#2E1065]" : "border-[#E2E8F0]"
                }`}
              >
                {planKey === "1_Year" ? (
                  <div className="absolute right-[-30px] top-[12px] rotate-45 bg-[#E11D48] px-8 py-1 text-[0.75rem] font-black tracking-widest text-white">BEST VALUE</div>
                ) : null}
                <div className={`mb-3 text-[1.2rem] font-bold ${planKey === "1_Year" ? "text-[#2E1065]" : "text-[#64748B]"}`}>{plan.tier}</div>
                <div className="mb-2 text-[2.5rem] font-black leading-none text-[#0F172A]">N{plan.amount.toLocaleString()}</div>
                <div className="mb-6 text-[0.9rem] font-bold text-[#16A34A]">{plan.hint}</div>

                <ul className="mb-6 flex flex-col gap-3 text-left text-[0.95rem] text-[#64748B]">
                  <li><FaCheck className="mr-2 inline text-[#16A34A]" /> Continuous AI Indexing</li>
                  <li><FaCheck className="mr-2 inline text-[#16A34A]" /> Unlimited Product Updates</li>
                  <li><FaCheck className="mr-2 inline text-[#16A34A]" /> {plan.label} Validity</li>
                </ul>

                <button
                  disabled={isDisabled}
                  onClick={() => startPaystackCheckout(planKey)}
                  className={`w-full rounded-xl p-3.5 text-[1rem] font-extrabold transition disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-[#94A3B8] ${
                    planKey === "1_Year" && !isDisabled
                      ? "bg-[#2E1065] text-white hover:bg-[#4c1d95]"
                      : "bg-[#F1F5F9] text-[#1E293B] hover:bg-[#2E1065] hover:text-white"
                  }`}
                >
                  {startingCheckout ? "Opening Paystack..." : isCurrentPlan && isActive ? "Active Plan" : `Pay with Paystack`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {(processing || startingCheckout) && (
        <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-black/80 text-white backdrop-blur-md">
          <FaCircleNotch className="mb-5 animate-spin text-5xl" />
          <h2 className="mb-2 text-xl font-bold">{startingCheckout ? "Opening Paystack..." : "Processing Securely..."}</h2>
          <p className="font-medium text-slate-300">{processingNote}</p>
        </div>
      )}
    </div>
  );
}
