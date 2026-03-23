import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaBuildingColumns,
  FaCircleNotch,
  FaCreditCard,
  FaIdCardClip,
  FaLocationDot,
  FaVideo,
  FaTicket,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";

const FEE_AMOUNT = 5000;
const PAYSTACK_KEY = "pk_test_f681256d9c1bc10964457c68fb2381e6451ed2b9";
const REMITA_KEY = "QzAwMDAyNzEyNTl8MTEwNjE4Njc3NzR8M2RjY2NlYTg4YzhjNWQzMTc4ZTA1NTZkYmViYzhmOTQzM2I0ZTU2Y2Q5Y2E4OWM1ZGI0MjI1YTUzYTNhZjJhMzk1YjcwZWQ3N2ZhMWQwZWM4M2IwZDMyZDUxZTZhNTBiZjZiYTgxMGI1MGEyZTIwMWQxZDRhZDFhMTU4MjZhNTc=";

export default function MerchantPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");

  const { user, loading: authLoading } = useAuthSession();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusError, setStatusError] = useState(false);
  
  // PROMO STATE
  const [promoCode, setPromoCode] = useState("");
  
  const [shopDetails, setShopDetails] = useState(null);

  // 1. Dynamically Load Payment Scripts
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

  // 2. Fetch Data & Validate Status
  useEffect(() => {
    async function init() {
      if (!user) return;
      
      if (!urlShopId) {
        alert("Shop ID is missing.");
        navigate("/merchant-dashboard");
        return;
      }

      try {
        setLoading(true);

        const { data: shop, error: shopErr } = await supabase.from("shops").select("*").eq("id", urlShopId).single();
        if (shopErr || !shop) throw new Error("Shop not found");

        if (shop.is_verified) {
          alert("Your shop is already fully verified!");
          navigate("/merchant-dashboard");
          return;
        }

        const { data: paymentRecord } = await supabase
          .from("physical_verification_payments")
          .select("id")
          .eq("merchant_id", user.id)
          .eq("status", "success")
          .maybeSingle();

        if (paymentRecord) {
          if (shop.status === "pending_kyc_review") {
            alert("We are currently reviewing your Video KYC! We will notify you once approved.");
            navigate("/merchant-dashboard");
          } else {
            alert("You have already paid the fee! Let's get your Video KYC recorded.");
            navigate("/merchant-video-kyc");
          }
          return;
        }

        const { data: profile, error: profErr } = await supabase.from("profiles").select("*, cities(name)").eq("id", user.id).single();
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
        alert("Error loading payment details: " + err.message);
        navigate("/merchant-dashboard");
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) init();
  }, [user, authLoading, urlShopId, navigate]);


  // 3. Backend Verification Handler
  const verifyPaymentOnBackend = async (txId, gateway) => {
    try {
      setProcessing(true);
      setStatusMsg("");
      setStatusError(false);

      const { data, error } = await supabase.functions.invoke("verify-remita", {
        body: {
          transactionId: txId,
          merchantName: shopDetails.merchantName,
          shopName: shopDetails.shopName,
          cityName: shopDetails.cityName,
          gateway: gateway,
        }
      });

      if (error) throw new Error(error.message || "Verification failed");
      if (data?.error) throw new Error(data.error);

      setStatusError(false);
      
     if (gateway === 'promo') {
        setStatusMsg("🎉 Promo Code Accepted! Fee Waived. Redirecting...");
      } else {
        setStatusMsg("✅ Payment Successful! Redirecting you to record your KYC Video...");
      }
      
      setTimeout(() => {
        // --- 1. THE CACHE BUSTER: Destroy the stale dashboard cache ---
        localStorage.removeItem(`vendor_panel_${user.id}`);
        sessionStorage.removeItem(`vendor_panel_${user.id}`);
        
        // --- 2. THE ROUTER FIX: Pass the shop_id to the KYC video page ---
        navigate(`/merchant-video-kyc?shop_id=${urlShopId}`);
      }, 3500);

    } catch (error) {
      console.error(error);
      setStatusError(true);
      setStatusMsg("⚠️ " + (error.message || "Verification failed"));
      setProcessing(false);
    }
  };

  // 4. Promo Code Flow
  const handleApplyPromo = () => {
    if (promoCode.length !== 6) return;
    verifyPaymentOnBackend(promoCode, "promo");
  };

  // 5. Paystack Flow
  const payWithPaystack = () => {
    if (!shopDetails || !window.PaystackPop) return alert("Payment system is initializing. Please wait a moment.");
    
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_KEY,
      email: shopDetails.email,
      amount: FEE_AMOUNT * 100, // in kobo
      currency: "NGN",
      ref: "CTM-VERIFY-" + Date.now(),
      callback: function (response) {
        setProcessing(true);
        verifyPaymentOnBackend(response.reference, "paystack");
      },
      onClose: function () {
        console.log("Paystack window closed.");
      },
    });
    handler.openIframe();
  };

  // 6. Remita Flow
  const payWithRemita = () => {
    if (!shopDetails || !window.RmPaymentEngine) return alert("Payment system is initializing. Please wait a moment.");
    
    const names = shopDetails.merchantName.split(" ");
    const firstName = names[0];
    const lastName = names.slice(1).join(" ") || "Merchant";
    const transactionId = "CTM-VERIFY-" + Date.now();

    const paymentEngine = window.RmPaymentEngine.init({
      key: REMITA_KEY,
      customerId: shopDetails.email,
      firstName: firstName,
      lastName: lastName,
      email: shopDetails.email,
      amount: FEE_AMOUNT,
      narration: "CT-Merchant Digital ID & KYC",
      transactionId: transactionId,
      onSuccess: function (response) {
        setProcessing(true);
        verifyPaymentOnBackend(response.transactionId, "remita");
      },
      onError: function (response) {
        alert("Payment failed or cancelled.");
      },
      onClose: function () {
        console.log("Remita window closed");
      },
    });

    paymentEngine.showPaymentWidget();
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
        {/* Top Accent Border */}
        <div className="absolute left-0 right-0 top-0 h-1.5 bg-[#D97706]"></div>

        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF3C7] text-3xl text-[#D97706]">
          <FaIdCardClip />
        </div>
        
        <h2 className="mb-2 text-[1.3rem] font-extrabold text-[#2E1065]">Digital ID & Promo Banner Fee</h2>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-[#64748B]">
          A one-time fee to process your Video KYC and permanently unlock your premium Digital ID Card and Custom Promo Banner.
        </p>

        <div className="mb-6 rounded-2xl bg-[#F1F5F9] p-5">
          <div className="mb-1 text-[0.85rem] font-bold uppercase tracking-widest text-[#64748B]">Total Amount</div>
          <div className="text-4xl font-extrabold text-[#0F172A]">₦{FEE_AMOUNT.toLocaleString()}</div>
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

        {/* WARNING NOTE */}
        <div className="mb-6 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-left text-[0.85rem] leading-relaxed text-[#991B1B]">
          <strong><FaVideo className="inline mr-1" /> Next Step: Video KYC</strong> <br />
          After payment, you will be required to record a short 60-second video of yourself inside your physical shop at this exact registered address:
          
          <div className="my-3 flex items-start gap-2 rounded-lg border border-dashed border-[#FCA5A5] bg-white p-3 font-semibold text-[#7F1D1D]">
            <FaLocationDot className="mt-[3px] shrink-0" />
            <span>{shopDetails.shopAddress}</span>
          </div>

          Your video must clearly prove your shop operates here. <strong>If you do not have a physical shop, DO NOT PAY, please contact support.</strong> This fee is strictly non-refundable.
        </div>

        {/* GATEWAYS & PROMO */}
        {!processing && !statusMsg && (
          <div className="mb-4 border-t border-dashed border-[#E2E8F0] pt-5">
            
            {/* PROMO CODE SECTION */}
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
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="flex-1 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-2 font-mono text-[1.05rem] font-bold tracking-widest text-[#0F172A] outline-none transition focus:border-[#D97706] focus:bg-white focus:ring-2 focus:ring-[#FEF3C7]"
                />
                <button
                  onClick={handleApplyPromo}
                  disabled={promoCode.length !== 6 || processing}
                  className="rounded-lg bg-[#0F172A] px-5 py-2 font-bold text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="mb-3 text-[0.85rem] font-bold uppercase tracking-widest text-[#64748B]">Or Pay Securely</div>
            
            <button 
              onClick={payWithPaystack} 
              className="mb-3 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-[#E2E8F0] bg-white p-4 text-[1.05rem] font-bold text-[#0F172A] transition-all hover:-translate-y-0.5 hover:border-[#2E1065] hover:bg-[#F8FAFC]"
            >
              <FaCreditCard className="text-xl text-[#0BA4DB]" /> Pay with Paystack
            </button>
            
            <button 
              onClick={payWithRemita} 
              className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-[#E2E8F0] bg-white p-4 text-[1.05rem] font-bold text-[#0F172A] transition-all hover:-translate-y-0.5 hover:border-[#2E1065] hover:bg-[#F8FAFC]"
            >
              <FaBuildingColumns className="text-xl text-[#E15B26]" /> Pay with Remita
            </button>
          </div>
        )}

        {/* STATUS MESSAGE */}
        {statusMsg && (
          <div className={`mt-4 rounded-xl p-4 text-[0.95rem] font-bold ${statusError ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]' : 'bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'}`}>
            {statusMsg}
          </div>
        )}

        {/* CANCEL BUTTON */}
        {!processing && (
          <button 
            onClick={() => navigate("/vendor-panel")} 
            className="mt-4 text-[0.95rem] font-semibold text-[#64748B] hover:text-[#0F172A] hover:underline"
          >
            Cancel and Return
          </button>
        )}
      </div>

      {/* PROCESSING OVERLAY */}
      {processing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 text-white backdrop-blur-sm">
          <FaCircleNotch className="mb-5 animate-spin text-4xl" />
          <h2 className="mb-2 text-xl font-bold">Processing Securely...</h2>
          <p className="font-medium text-slate-200">Please do not close this window.</p>
        </div>
      )}

    </div>
  );
}