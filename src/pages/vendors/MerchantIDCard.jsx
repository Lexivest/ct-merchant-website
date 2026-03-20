import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import {
  FaArrowLeft,
  FaBullhorn,
  FaCircleInfo,
  FaCircleNotch,
  FaDownload,
  FaFacebookF,
  FaShareNodes,
  FaTriangleExclamation,
  FaWhatsapp,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";

export default function MerchantIDCard() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  const [shopData, setShopData] = useState(null);
  const [profileData, setProfileData] = useState(null);

  const cardRef = useRef(null);

  useEffect(() => {
    async function fetchCardData() {
      if (!user) return;
      if (isOffline) {
        setError("Network offline. Please connect to the internet to generate your ID card.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url, is_suspended").eq("id", user.id).maybeSingle();
        if (profile?.is_suspended) throw new Error("Account restricted.");
        setProfileData(profile);

        let currentShopId = urlShopId;
        if (!currentShopId) {
          const { data: shopLookup } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle();
          if (!shopLookup) throw new Error("Shop not found.");
          currentShopId = shopLookup.id;
        }

        const { data: shop, error: shopErr } = await supabase
          .from("shops")
          .select("id, name, unique_id, is_verified, cities(name)")
          .eq("id", currentShopId)
          .maybeSingle();

        if (shopErr || !shop) throw new Error("Could not load shop details.");
        
        if (!shop.is_verified) {
          throw new Error("Access Denied: Your shop must be Physically Verified by a CTMerchant agent before you can generate a Digital ID Card.");
        }

        setShopData(shop);

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) fetchCardData();
  }, [user, authLoading, urlShopId, isOffline]);


  const generateCardBlob = async () => {
    if (!cardRef.current) throw new Error("Card element not found.");
    
    const canvas = await html2canvas(cardRef.current, {
      scale: 3, // High-res export
      useCORS: true,
      backgroundColor: "#131921",
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
    });
  };

  const handleShare = async () => {
    if (isOffline) return alert("You must be online to share.");
    try {
      setSharing(true);
      const textContent = `Visit my shop "${shopData.name}" on www.ctmerchant.com.ng\n\nSearch my ID: ${shopData.unique_id} or scan the QR code on my card.\n\n[Type your top products here...]`;
      
      const blob = await generateCardBlob();
      const file = new File([blob], `CTMerchant_${shopData.unique_id}.jpg`, { type: "image/jpeg" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: shopData.name,
          text: textContent,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: shopData.name,
          text: textContent,
        });
      } else {
        navigator.clipboard.writeText(textContent);
        alert("Shop details copied to clipboard! (Your device does not support native image sharing).");
      }
    } catch (err) {
      console.warn("Share action cancelled or failed:", err);
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await generateCardBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `CTMerchant_ID_${shopData.unique_id}.jpg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to save image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };


  if (authLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F3F4F6]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#db2777]/30 border-t-[#db2777]"></div>
        <p className="mt-4 font-semibold text-[#565959]">Generating your card...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="bg-[#131921] px-4 py-3 text-white"><button onClick={() => navigate("/vendor-panel")}><FaArrowLeft /></button></header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="mb-2 font-bold text-slate-900">Cannot Generate Card</h3>
            <p className="text-sm text-slate-600 max-w-sm mx-auto">{error}</p>
            <button onClick={() => navigate("/vendor-panel")} className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold transition hover:bg-slate-50">Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  const avatarUrl = profileData?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profileData?.full_name || shopData.name)}`;
  const proprietorName = profileData?.full_name || "Authorized Merchant";
  const currentYear = new Date().getFullYear();
  const shopUrlText = `www.ctmerchant.com.ng/shop-detail?id=${shopData.id}`;
  const shopUrl = `https://${shopUrlText}`;

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-40 flex w-full items-center gap-4 bg-[#131921] px-4 py-3 text-white shadow-sm">
        <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]"><FaArrowLeft /></button>
        <div className="text-[1.15rem] font-bold">Digital ID Card</div>
      </header>

      <main className="flex w-full max-w-[600px] flex-1 flex-col items-center p-5 pb-12">
        
        <div className="mb-8 w-full border-l-4 border-[#db2777] bg-[#F8FAFC] p-4 shadow-sm border-y border-r border-y-[#E2E8F0] border-r-[#E2E8F0] rounded-r-lg">
          <h4 className="mb-2 flex items-center gap-2 text-[0.95rem] font-extrabold text-[#0F1111]">
            <FaBullhorn className="text-[#db2777]" /> Share Your Digital Identity
          </h4>
          <p className="text-[0.85rem] leading-relaxed text-[#475569]">
            Share your ID directly to WhatsApp and Facebook! This card carries your official shop link and a scannable QR code, allowing the public to open your store instantly.
          </p>
        </div>

        {/* --- THE DIGITAL ID CARD --- */}
        <div className="relative mb-8 overflow-hidden rounded-xl border border-white/15 bg-gradient-to-br from-[#0F172A] to-[#1E1B4B] p-5 text-white shadow-[0_15px_30px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)] transform sm:scale-100 scale-95" 
             style={{ width: "380px", height: "240px", transformOrigin: "top center" }} 
             ref={cardRef}>
          
          {/* Watermark */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 opacity-5">
            <img src="https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/CT-Merchant.jpg" alt="WM" className="h-full w-full object-contain" crossOrigin="anonymous" />
          </div>

          <div className="relative z-10 flex h-full flex-col justify-between">
            
            {/* Header */}
            <div className="flex items-start justify-between">
              {/* Centralized Header Text */}
              <div className="flex flex-col items-center text-center gap-0.5 ml-8">
                <div className="max-w-[200px] text-[0.9rem] font-black uppercase leading-tight tracking-wide text-[#db2777]">
                  CTMerchant {shopData.cities?.name || "Local"} Repo
                </div>
                <div className="text-[0.55rem] font-bold tracking-wide text-[#FBBF24]">www.ctmerchant.com.ng</div>
              </div>

              {/* Smaller Profile Pic */}
              <img src={avatarUrl} alt="Profile" className="h-14 w-14 flex-shrink-0 rounded-lg border-2 border-white/80 bg-[#E2E8F0] object-cover shadow-md" crossOrigin="anonymous" />
            </div>

            {/* Business Details */}
            <div className="flex flex-col gap-2.5 mt-2">
              <div className="flex flex-col">
                <span className="mb-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-[#94A3B8]">Business Name</span>
                <span className="max-w-[270px] truncate text-[1rem] font-extrabold text-white">{shopData.name}</span>
              </div>
              <div className="flex flex-col">
                <span className="mb-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-[#94A3B8]">Proprietor</span>
                <span className="max-w-[270px] truncate text-[0.85rem] font-bold text-white">{proprietorName}</span>
              </div>

              <div className="mt-0.5 flex gap-8">
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-[#94A3B8]">ID No.</span>
                  <span className="font-mono text-[1.05rem] tracking-wide text-[#FBBF24]">{shopData.unique_id || 'PENDING'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-[#94A3B8]">Expiry</span>
                  <span className="text-[0.85rem] font-bold text-white">{currentYear + 1}</span>
                </div>
              </div>
            </div>

            {/* Footer Text & QR CODE */}
            <div className="relative h-16 w-full flex items-end">
              {/* FIXED: Footer text color matches ID number (#FBBF24) */}
              <div className="flex-1 text-center pr-16 text-[0.5rem] font-extrabold text-[#FBBF24]">
                Visit <span className="text-white font-medium">{shopUrlText}</span> or scan QR
              </div>
              
              <div className="absolute bottom-0 right-0 flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-md bg-white p-1 shadow-lg">
                <QRCodeSVG value={shopUrl} size={52} level="M" />
              </div>
            </div>
          </div>
        </div>

        {/* --- ACTIONS --- */}
        <div className="flex w-full max-w-[380px] flex-col gap-3">
          <button 
            onClick={handleShare} 
            disabled={sharing}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[#db2777] p-4 text-[1.05rem] font-extrabold text-white shadow-[0_4px_10px_rgba(219,39,119,0.3)] transition hover:-translate-y-0.5 hover:bg-[#be185d] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {sharing ? <FaCircleNotch className="animate-spin text-xl" /> : (
              <>
                <FaShareNodes /> Share ID to <FaWhatsapp className="text-xl ml-1" /> <FaFacebookF className="text-xl" />
              </>
            )}
          </button>

          <div className="mb-3 mt-[-6px] rounded-md border-l-4 border-[#DC2626] bg-[#FEE2E2] p-2 text-center text-[0.8rem] leading-relaxed text-[#565959]">
            <strong>💡 PRO TIP:</strong> When the WhatsApp screen opens, type a quick list of what you sell so your customers know exactly what they can buy from you!
          </div>

          <button 
            onClick={handleDownload} 
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#D5D9D9] bg-white p-3.5 font-bold text-[#0F1111] transition hover:border-[#B0B5B5] hover:bg-[#F7FAFA] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {downloading ? <><FaCircleNotch className="animate-spin" /> Saving...</> : <><FaDownload /> Save Image to Gallery</>}
          </button>
        </div>

      </main>
    </div>
  );
}