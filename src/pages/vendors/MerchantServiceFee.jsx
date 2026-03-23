import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaBuildingColumns,
  FaCheck,
  FaCircleCheck,
  FaCircleInfo,
  FaCircleNotch,
  FaCircleXmark,
  FaCreditCard,
  FaTriangleExclamation,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";

const PAYSTACK_KEY = "pk_test_f681256d9c1bc10964457c68fb2381e6451ed2b9";
const REMITA_KEY = "QzAwMDAyNzEyNTl8MTEwNjE4Njc3NzR8M2RjY2NlYTg4YzhjNWQzMTc4ZTA1NTZkYmViYzhmOTQzM2I0ZTU2Y2Q5Y2E4OWM1ZGI0MjI1YTUzYTNhZjJhMzk1YjcwZWQ3N2ZhMWQwZWM4M2IwZDMyZDUxZTZhNTBiZjZiYTgxMGI1MGEyZTIwMWQxZDRhZDFhMTU4MjZhNTc=";

export default function MerchantServiceFee() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  
  const [shopData, setShopData] = useState(null);
  const [firstName, setFirstName] = useState("Merchant");
  
  // Gateway Modal State
  const [gatewayModalOpen, setGatewayModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null); // { plan: '6_Months', amount: 6000 }

  // 1. Dynamically Load Scripts
  useEffect(() => {
    const loadScript = (src) => {
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      document.body.appendChild(script);
    };
    loadScript("https://js.paystack.co/v1/inline.js");
    loadScript("https://remitademo.net/payment/v1/remita-pay-inline.bundle.js");
  }, []);

  // 2. Fetch Subscription Data
  const fetchSubscription = async () => {
    if (!user) return;
    if (isOffline) {
      setError("Network offline. Please connect to the internet to view subscription details.");
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

      // --- THE FIX: Fetching the secure backend boolean ---
      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("id, subscription_end_date, subscription_plan, is_subscription_active")
        .eq("id", currentShopId)
        .maybeSingle();

      if (shopErr || !shop) throw new Error("Could not load shop details.");
      
      setShopData(shop);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) fetchSubscription();
  }, [user, authLoading, urlShopId, isOffline]);

  // 3. Backend Verification Handler
  const verifySubscriptionOnBackend = async (txId, plan, amount, gateway) => {
    try {
      setProcessing(true);
      setGatewayModalOpen(false);

      const { data, error } = await supabase.functions.invoke("verify-service-fee", {
        body: {
          transactionId: txId,
          shopId: shopData.id,
          plan: plan,
          amount: amount,
          gateway: gateway,
        }
      });

      if (error) throw new Error(error.message || "Verification failed");
      if (data?.error) throw new Error(data.error);

      alert(`✅ Subscription Successful via ${gateway.toUpperCase()}!`);
      fetchSubscription(); // Reload the UI to reflect new dates

    } catch (err) {
      console.error(err);
      alert("⚠️ Error: " + (err.message || "Verification failed"));
    } finally {
      setProcessing(false);
    }
  };

  // 4. Payment Flows
  const handleGatewaySelection = (gateway) => {
    if (!selectedPlan) return;
    
    if (gateway === "paystack") {
      if (!window.PaystackPop) return alert("Payment system initializing. Please wait.");
      
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_KEY,
        email: user.email,
        amount: selectedPlan.amount * 100, // kobo
        currency: "NGN",
        ref: "CTM-" + Date.now(),
        callback: function (response) {
          verifySubscriptionOnBackend(response.reference, selectedPlan.plan, selectedPlan.amount, "paystack");
        },
        onClose: function () { console.log("Paystack closed"); },
      });
      handler.openIframe();
      setGatewayModalOpen(false);

    } else if (gateway === "remita") {
      if (!window.RmPaymentEngine) return alert("Payment system initializing. Please wait.");
      
      const transactionId = "CTM-" + Date.now();
      const paymentEngine = window.RmPaymentEngine.init({
        key: REMITA_KEY,
        customerId: user.email,
        firstName: firstName,
        lastName: "",
        email: user.email,
        amount: selectedPlan.amount,
        narration: `CT-Merchant ${selectedPlan.plan.replace("_", " ")}`,
        transactionId: transactionId,
        onSuccess: function (response) {
          verifySubscriptionOnBackend(response.transactionId, selectedPlan.plan, selectedPlan.amount, "remita");
        },
        onError: function () { alert("Payment failed."); },
        onClose: function () { console.log("Remita closed"); },
      });
      paymentEngine.showPaymentWidget();
      setGatewayModalOpen(false);
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
            <button onClick={() => navigate("/vendor-panel")} className="mt-5 w-full rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-6 py-3 font-bold text-[#1E293B] transition hover:bg-[#E2E8F0]">Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  // --- THE FIX: Sanitized Derived State Calcs ---
  const currentPlan = shopData.subscription_plan || "Free Trial";
  const isFreeTrial = currentPlan === "Free Trial";
  
  // Rely exclusively on the backend for access logic
  const isActive = shopData.is_subscription_active === true; 
  
  // Safely format the static date string for display
  const endDate = new Date(shopData.subscription_end_date);
  const formattedExpiry = endDate.toLocaleDateString(undefined, { 
    year: 'numeric', month: 'long', day: 'numeric' 
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-5 text-[#1E293B]">
      <div className="mx-auto w-full max-w-[800px]">
        
        {/* HEADER */}
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-[#2E1065] p-4 text-white shadow-sm">
          <button onClick={() => navigate("/vendor-panel")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-[1.1rem] transition hover:bg-white/30">
            <FaArrowLeft />
          </button>
          <div className="text-[1.25rem] font-bold">Service Fee Portal</div>
        </div>

        {/* STATUS CARD */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-5 rounded-[20px] border border-[#E2E8F0] bg-white p-6 shadow-sm sm:flex-nowrap">
          <div>
            <h3 className="mb-1 text-[1.1rem] text-[#64748B]">Current Plan</h3>
            <h2 className="mb-3 text-[1.8rem] font-black text-[#2E1065] leading-none">{currentPlan.replace('_', ' ')}</h2>
            
            <div className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.9rem] font-bold ${
              isActive ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEE2E2] text-[#DC2626]"
            }`}>
              {isActive ? <><FaCircleCheck /> {isFreeTrial ? "ACTIVE TRIAL" : "ACTIVE"}</> : <><FaCircleXmark /> EXPIRED</>}
            </div>
          </div>
          
          <div className="text-left sm:text-right">
            {/* --- THE FIX: Replaced Vulnerable Countdown --- */}
            <div className={`text-[2.5rem] font-black leading-none ${!isActive ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
              {!isActive ? "Locked" : "Active Access"}
            </div>
            <div className="mt-1 text-[0.9rem] font-semibold text-[#64748B]">
              {!isActive ? "Please choose a plan below to unlock your tools." : `Valid Until: ${formattedExpiry}`}
            </div>
          </div>
        </div>

        <h2 className="mb-6 text-center text-[1.5rem] font-black text-[#0F172A]">Subscription Plans</h2>

        {/* PRICING GRID */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          
          {/* 6 MONTHS */}
          <div className={`relative overflow-hidden rounded-[20px] border-2 bg-white p-8 text-center transition-transform hover:-translate-y-1 hover:shadow-lg ${isActive && currentPlan === '6_Months' ? 'border-[#2E1065]' : 'border-[#E2E8F0]'}`}>
            <div className="mb-3 text-[1.2rem] font-bold text-[#64748B]">Standard Tier</div>
            <div className="mb-2 text-[2.5rem] font-black leading-none text-[#0F172A]">₦6,000</div>
            <div className="mb-6 text-[0.9rem] font-bold text-[#16A34A]">Works out to ₦1,000 / month</div>
            
            <ul className="mb-6 flex flex-col gap-3 text-left text-[0.95rem] text-[#64748B]">
              <li><FaCheck className="inline mr-2 text-[#16A34A]" /> Continuous AI Indexing</li>
              <li><FaCheck className="inline mr-2 text-[#16A34A]" /> Unlimited Product Updates</li>
              <li><FaCheck className="inline mr-2 text-[#16A34A]" /> 6 Months Validity</li>
            </ul>

            <button 
              disabled={isActive}
              onClick={() => { setSelectedPlan({ plan: '6_Months', amount: 6000 }); setGatewayModalOpen(true); }}
              className="w-full rounded-xl bg-[#F1F5F9] p-3.5 text-[1rem] font-extrabold text-[#1E293B] transition hover:bg-[#2E1065] hover:text-white disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-[#94A3B8] disabled:hover:bg-[#E2E8F0] disabled:hover:text-[#94A3B8]"
            >
              {isActive && currentPlan === '6_Months' ? <><FaCheck className="inline mr-1" /> Active Plan</> : isActive ? "Deactivated" : "Subscribe 6 Months"}
            </button>
          </div>

          {/* 1 YEAR */}
          <div className={`relative overflow-hidden rounded-[20px] border-2 bg-white p-8 text-center transition-transform hover:-translate-y-1 hover:shadow-lg ${isActive && currentPlan === '1_Year' ? 'border-[#2E1065]' : !isActive ? 'border-[#2E1065]' : 'border-[#E2E8F0]'}`}>
            <div className="absolute right-[-30px] top-[12px] rotate-45 bg-[#E11D48] px-8 py-1 text-[0.75rem] font-black tracking-widest text-white">BEST VALUE</div>
            <div className="mb-3 text-[1.2rem] font-bold text-[#2E1065]">Professional Tier</div>
            <div className="mb-2 text-[2.5rem] font-black leading-none text-[#0F172A]">₦10,000</div>
            <div className="mb-6 text-[0.9rem] font-bold text-[#16A34A]">Works out to ₦833 / month</div>
            
            <ul className="mb-6 flex flex-col gap-3 text-left text-[0.95rem] text-[#64748B]">
              <li><FaCheck className="inline mr-2 text-[#16A34A]" /> Continuous AI Indexing</li>
              <li><FaCheck className="inline mr-2 text-[#16A34A]" /> Unlimited Product Updates</li>
              <li><FaCheck className="inline mr-2 text-[#16A34A]" /> <strong className="text-[#0F172A]">1 Full Year Validity</strong></li>
            </ul>

            <button 
              disabled={isActive}
              onClick={() => { setSelectedPlan({ plan: '1_Year', amount: 10000 }); setGatewayModalOpen(true); }}
              className={`w-full rounded-xl p-3.5 text-[1rem] font-extrabold transition disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-[#94A3B8] ${isActive ? "bg-[#F1F5F9] text-[#1E293B]" : "bg-[#2E1065] text-white hover:bg-[#4c1d95]"}`}
            >
              {isActive && currentPlan === '1_Year' ? <><FaCheck className="inline mr-1" /> Active Plan</> : isActive ? "Deactivated" : "Subscribe 1 Year"}
            </button>
          </div>

        </div>
      </div>

      {/* GATEWAY SELECTION MODAL */}
      {gatewayModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-[400px] animate-[slideUp_0.3s_ease-out] rounded-[24px] bg-white p-8 text-center shadow-2xl">
            <h2 className="mb-2 text-[1.3rem] font-black text-[#0F172A]">Select Payment Method</h2>
            <p className="mb-6 text-[0.95rem] text-[#64748B]">Choose how you want to securely pay for your subscription.</p>

            <button onClick={() => handleGatewaySelection("paystack")} className="mb-3 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-[#E2E8F0] bg-white p-4 text-[1.05rem] font-bold text-[#0F172A] transition hover:-translate-y-0.5 hover:border-[#2E1065] hover:bg-[#F8FAFC]">
              <FaCreditCard className="text-xl text-[#0BA4DB]" /> Pay with Paystack
            </button>
            
            <button onClick={() => handleGatewaySelection("remita")} className="mb-2 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-[#E2E8F0] bg-white p-4 text-[1.05rem] font-bold text-[#0F172A] transition hover:-translate-y-0.5 hover:border-[#2E1065] hover:bg-[#F8FAFC]">
              <FaBuildingColumns className="text-xl text-[#E15B26]" /> Pay with Remita
            </button>

            <button onClick={() => setGatewayModalOpen(false)} className="mt-4 text-[0.95rem] font-semibold text-[#64748B] hover:text-[#0F172A] hover:underline">
              Cancel
            </button>
          </div>
          <style dangerouslySetOrigin={{__html: `@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}}/>
        </div>
      )}

      {/* PROCESSING OVERLAY */}
      {processing && (
        <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-black/80 text-white backdrop-blur-md">
          <FaCircleNotch className="mb-5 animate-spin text-5xl" />
          <h2 className="mb-2 text-xl font-bold">Processing Securely...</h2>
          <p className="font-medium text-slate-300">Please do not close this window.</p>
        </div>
      )}

    </div>
  );
}