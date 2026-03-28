import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import {
  FaArrowLeft,
  FaCircleNotch,
  FaDownload,
  FaFacebookF,
  FaImage,
  FaLocationDot,
  FaShareNodes,
  FaTriangleExclamation,
  FaWhatsapp,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { ShimmerBlock } from "../../components/common/Shimmers";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";

// --- SHIMMER COMPONENT ---
function PromoBannerShimmer() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="text-xl opacity-50"><FaArrowLeft /></div>
          <div className="text-[1.15rem] font-bold opacity-50">Shop Promo Banner</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[840px] flex-1 flex-col items-center p-5 pb-12">
        <div className="mb-6 w-full max-w-[800px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 shadow-sm border-l-4 border-l-[#db2777]">
          <ShimmerBlock className="mb-2 h-5 w-48 rounded" />
          <ShimmerBlock className="h-4 w-full rounded" />
        </div>
        <ShimmerBlock className="aspect-video w-full max-w-[800px] rounded-xl" />
      </main>
    </div>
  );
}

export default function MerchantPromoBanner() {
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
  const [productImages, setProductImages] = useState([]);

  const bannerRef = useRef(null);

  useEffect(() => {
    async function fetchBannerData() {
      if (!user) return;
      if (isOffline) {
        setError("Network offline. Please connect to the internet to generate your promo banner.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", user.id).maybeSingle();
        if (profile?.is_suspended) throw new Error("Account restricted.");

        let currentShopId = urlShopId;
        if (!currentShopId) {
          const { data: shopLookup } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle();
          if (!shopLookup) throw new Error("Shop not found.");
          currentShopId = shopLookup.id;
        }

        // 1. Fetch Shop Details
        const { data: shop, error: shopErr } = await supabase
          .from("shops")
          .select("id, name, unique_id, category, is_verified, address, cities(name)")
          .eq("id", currentShopId)
          .maybeSingle();

        if (shopErr || !shop) throw new Error("Could not load shop details.");
        if (!shop.is_verified) {
          throw new Error("Access Denied: Your shop must be Physically Verified before you can generate a Promotional Banner.");
        }
        setShopData(shop);

        // 2. Fetch Latest 6 Approved Products
        const { data: products, error: prodErr } = await supabase
          .from("products")
          .select("image_url")
          .eq("shop_id", shop.id)
          .eq("is_approved", true)
          .limit(6);

        if (prodErr) throw prodErr;

        // Ensure we always have exactly 6 images for the grid
        const fallbackImg = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800&auto=format&fit=crop";
        let finalImages = [];
        
        if (!products || products.length === 0) {
          finalImages = Array(6).fill(fallbackImg);
        } else {
          const avail = products.map(p => p.image_url).filter(url => url);
          if (avail.length === 0) {
            finalImages = Array(6).fill(fallbackImg);
          } else {
            // Repeat available images to fill the 6 slots
            for (let i = 0; i < 6; i++) {
              finalImages.push(avail[i % avail.length]);
            }
          }
        }
        setProductImages(finalImages);

      } catch (err) {
        setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."));
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) fetchBannerData();
  }, [user, authLoading, urlShopId, isOffline]);


  const generateBannerBlob = async () => {
    if (!bannerRef.current) throw new Error("Banner element not found.");
    
    const canvas = await html2canvas(bannerRef.current, {
      scale: 3, // High-res export
      useCORS: true,
      backgroundColor: "#003B95",
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
    });
  };

  const handleShare = async () => {
    if (isOffline) return alert("You must be online to share.");
    try {
      setSharing(true);
      const textContent = `Visit my shop "${shopData.name}" on www.ctmerchant.com.ng\n\nSearch my ID: ${shopData.unique_id} or scan the QR code on my banner.\n\n[Type your top products here...]`;
      
      const blob = await generateBannerBlob();
      const file = new File([blob], `CTMerchant_Banner_${shopData.unique_id}.jpg`, { type: "image/jpeg" });

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
      const blob = await generateBannerBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `CTMerchant_Banner_${shopData.unique_id}.jpg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to save image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (authLoading || loading) return <PromoBannerShimmer />;

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="bg-[#131921] px-4 py-3 text-white"><button onClick={() => navigate("/vendor-panel")}><FaArrowLeft /></button></header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="mb-2 font-bold text-slate-900">Cannot Generate Banner</h3>
            <p className="text-sm text-slate-600 max-w-sm mx-auto">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold transition hover:bg-slate-50">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const displayAddress = shopData.address || "Registered Business Address";
  const shopUrlText = `www.ctmerchant.com.ng/shop-detail?id=${shopData.id}`;
  const shopUrl = `https://${shopUrlText}`;

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-40 flex w-full items-center gap-4 bg-[#131921] px-4 py-3 text-white shadow-sm">
        <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]"><FaArrowLeft /></button>
        <div className="text-[1.15rem] font-bold">Shop Promo Banner</div>
      </header>

      <main className="flex w-full max-w-[840px] flex-1 flex-col items-center p-5 pb-12">
        
        <div className="mb-6 w-full max-w-[800px] border-l-4 border-[#db2777] bg-[#F8FAFC] p-4 shadow-sm border-y border-r border-y-[#E2E8F0] border-r-[#E2E8F0] rounded-r-lg">
          <h4 className="mb-2 flex items-center gap-2 text-[0.95rem] font-extrabold text-[#0F1111]">
            <FaImage className="text-[#db2777]" /> Download & Print
          </h4>
          <p className="text-[0.85rem] leading-relaxed text-[#475569]">
            We automatically pulled your latest products to create this high-resolution banner. It is perfect for printing as a flex banner for your physical shop or broadcasting on WhatsApp.
          </p>
        </div>

        {/* --- THE REDESIGNED PROMO BANNER --- */}
        <div 
          className="relative h-[450px] w-[800px] origin-top overflow-hidden bg-[#003B95] text-white shadow-[0_15px_30px_rgba(0,0,0,0.2)] max-[850px]:-mb-[45px] max-[850px]:scale-[0.9] max-[750px]:-mb-[90px] max-[750px]:scale-[0.8] max-[650px]:-mb-[135px] max-[650px]:scale-[0.7] max-[550px]:-mb-[200px] max-[550px]:scale-[0.55] max-[450px]:-mb-[260px] max-[450px]:scale-[0.42] max-[360px]:-mb-[280px] max-[360px]:scale-[0.38]"
          ref={bannerRef}
        >
          {/* DYNAMIC 6-GRID PRODUCT COLLAGE (Shrunk to fit perfectly alongside gradient) */}
          <div className="absolute left-0 top-0 z-10 grid h-[calc(100%-50px)] w-[56%] grid-cols-3 grid-rows-2 gap-2 bg-white p-2.5 pr-10">
            {productImages.map((imgUrl, idx) => (
              <div key={idx} className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-1 shadow-sm">
                <img crossOrigin="anonymous" src={imgUrl} alt={`Product ${idx}`} className="h-full w-full object-contain mix-blend-darken" />
              </div>
            ))}
          </div>
          
          {/* RIGHT PANEL WITH SOFTER LOWER CURVE */}
          <div 
            className="absolute right-0 top-0 z-20 h-[calc(100%-50px)] w-[48%] rounded-bl-[170px] border-l-[8px] border-[#FBBF24] bg-gradient-to-b from-[#003B95] via-[#003B95] to-[#001E50]"
          ></div>
          
          {/* THE ADVERTISING CONTENT */}
          <div className="absolute right-[15px] top-[20px] z-30 flex h-[calc(100%-40px)] w-[370px] flex-col items-center text-center">
            <div className="mb-3 w-full line-clamp-2 text-[1.2rem] font-black uppercase leading-[1.05] text-white drop-shadow-lg">
              {shopData.name}
            </div>

            <div className="mb-3 rounded-full border-2 border-white bg-[#EA580C] px-5 py-1.5 text-[1.15rem] font-semibold leading-tight text-white shadow-[0_6px_12px_rgba(234,88,12,0.4)]">
              {shopData.category ? shopData.category : "Shop & Retail"}
            </div>

            <div className="mb-3 px-2.5 text-[1.05rem] font-semibold leading-[1.35] text-[#CBD5E1] drop-shadow-sm">
              <FaLocationDot className="mr-1 inline align-text-top text-[#FBBF24]" /> {displayAddress}
            </div>

            <div className="mb-1 text-[1rem] font-bold uppercase tracking-[1px] text-[#E2E8F0]">
              Shop Online With Us On
            </div>
            <div className="mb-3 text-[1.55rem] font-black leading-tight text-white drop-shadow-md">
              CTMerchant <span className="text-[#FBBF24]">{shopData.cities?.name || "Local"}</span> Repo
            </div>

            <div className="mt-1 flex w-full items-center justify-center gap-3">
              <div className="shrink-0 text-right text-[0.8rem] font-black uppercase leading-tight tracking-[0.6px] text-[#FBBF24] drop-shadow-lg">
                <span className="whitespace-nowrap">ID: {shopData.unique_id || "PENDING"}</span>
              </div>

              <div className="flex shrink-0 flex-col items-center rounded-lg border-[3px] border-[#FBBF24] bg-white p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.5)]">
                <div className="mb-1 text-[0.65rem] font-black uppercase text-[#003B95]">Barcode</div>
                <div className="flex h-[76px] w-[76px] items-center justify-center overflow-hidden">
                  <QRCodeSVG value={shopUrl} size={70} fgColor="#003B95" level="M" />
                </div>
              </div>
            </div>

          </div>

          {/* BOTTOM ADVERTISING STRIP */}
          <div className="absolute bottom-0 left-0 z-[40] flex h-[48px] w-full items-center justify-center border-t-[4px] border-[#FBBF24] bg-[#001E50] text-[1.1rem] font-semibold text-white shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
            Visit <span className="mx-1.5 font-extrabold text-[#FBBF24] tracking-wide">{shopUrlText.replace("/shop-detail", "")}</span> or scan barcode
          </div>

        </div>

        {/* --- ACTIONS --- */}
        <div className="mt-10 flex w-full max-w-[400px] flex-col gap-3">
          <button 
            onClick={handleShare} 
            disabled={sharing}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[#db2777] p-4 text-[1.05rem] font-extrabold text-white shadow-[0_4px_10px_rgba(219,39,119,0.3)] transition hover:-translate-y-0.5 hover:bg-[#be185d] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {sharing ? <FaCircleNotch className="animate-spin text-xl" /> : (
              <>
                <FaShareNodes /> Broadcast Banner to <FaWhatsapp className="text-xl ml-1" /> <FaFacebookF className="text-xl" />
              </>
            )}
          </button>

          <div className="mb-3 mt-[-6px] rounded-md border-l-4 border-[#DC2626] bg-[#FEE2E2] p-2 text-center text-[0.8rem] leading-relaxed text-[#565959]">
            <strong>💡 PRO TIP:</strong> This generates a high-quality image. Save it to your phone and send it to a local printing press to create a physical flex banner!
          </div>

          <button 
            onClick={handleDownload} 
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#D5D9D9] bg-white p-3.5 font-bold text-[#0F1111] transition hover:border-[#B0B5B5] hover:bg-[#F7FAFA] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {downloading ? <><FaCircleNotch className="animate-spin" /> Saving...</> : <><FaDownload /> Save Image in High Quality</>}
          </button>
        </div>

      </main>
    </div>
  );
}
