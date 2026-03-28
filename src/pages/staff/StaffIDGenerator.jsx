import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import {
  FaArrowLeft,
  FaCircleNotch,
  FaDownload,
  FaTriangleExclamation,
  FaWhatsapp,
  FaShareNodes
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import ctmLogo from "../../assets/images/logo.jpg";

export default function StaffIDGenerator() {
  const navigate = useNavigate();
  usePreventPullToRefresh();

  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [downloading, setDownloading] = useState(false);
  const [shopData, setShopData] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [cityName, setCityName] = useState("Local");

  const cardRef = useRef(null);

  useEffect(() => {
    async function fetchMerchantData() {
      if (!urlShopId) {
        setError("No Shop ID provided in the URL.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const numericId = parseInt(urlShopId, 10);
        if (isNaN(numericId)) throw new Error("Invalid Shop ID format.");

        const { data: shop, error: shopErr } = await supabase
          .from("shops")
          .select("*")
          .eq("id", numericId)
          .maybeSingle();

        if (shopErr) throw new Error(`Database Error: ${shopErr.message}`);
        if (!shop) throw new Error(`Could not find records for Shop ID: ${urlShopId}`);

        if (shop.owner_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", shop.owner_id)
            .maybeSingle();
          setProfileData(profile || null);
        }

        if (shop.city_id) {
          const { data: city } = await supabase
            .from("cities")
            .select("name")
            .eq("id", shop.city_id)
            .maybeSingle();
          if (city?.name) setCityName(city.name);
        }

        setShopData(shop);
        
      } catch (err) {
        setError(getFriendlyErrorMessage(err, "Failed to load merchant data."));
      } finally {
        setLoading(false);
      }
    }

    fetchMerchantData();
  }, [urlShopId]);

  const formattedExpiry = useMemo(() => {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    return expiryDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  const merchantAvatar = useMemo(() => {
    if (profileData?.avatar_url) return profileData.avatar_url;
    const seed = encodeURIComponent(shopData?.name || "Merchant");
    return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`;
  }, [profileData?.avatar_url, shopData?.name]);

  const verificationUrl = useMemo(() => {
    if (!shopData?.id) return "https://www.ctmerchant.com.ng";
    return `https://www.ctmerchant.com.ng/shop-detail?id=${shopData.id}`;
  }, [shopData?.id]);

  const businessName = shopData?.name || "Unnamed Business";
  const proprietorName = profileData?.full_name || "Merchant";
  const categoryName = shopData?.category || "General";
  const addressText = shopData?.address || "Verified physical location";
  const uniqueId = shopData?.unique_id || "PENDING";

  const generateCardBlob = async () => {
    if (!cardRef.current) throw new Error("Card element not found.");

    const canvas = await html2canvas(cardRef.current, {
      scale: 4,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to generate image blob."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        1.0
      );
    });
  };

  const handleDownloadOnly = async () => {
    try {
      setDownloading(true);
      const blob = await generateCardBlob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `CTM_BUSINESS_ID_${uniqueId}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to generate ID file.");
    } finally {
      setDownloading(false);
    }
  };

  // --- NEW NATIVE SHARE ENGINE ---
  const handleNativeShare = async () => {
    try {
      setDownloading(true);
      const blob = await generateCardBlob();
      
      // Package blob as a physical file
      const file = new File([blob], `CTM_BUSINESS_ID_${uniqueId}.jpg`, { type: "image/jpeg" });
      const msg = `Hello ${proprietorName}, your official CT-Merchant Business ID for *"${businessName}"* is ready. Unique ID: *${uniqueId}*.`;

      // Check if device supports native file sharing (Mobile Apps, Safari, Edge)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'CTMerchant Business ID',
          text: msg,
          files: [file]
        });
      } else {
        // Fallback for incompatible desktop browsers
        alert("Native sharing is not supported on this browser. The file will be downloaded instead.");
        handleDownloadOnly();
        
        // Open standard text WhatsApp as a fallback
        let phone = shopData?.phone || "";
        if (phone.startsWith("0")) phone = `234${phone.slice(1)}`;
        if (phone) {
          setTimeout(() => {
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
          }, 500);
        }
      }
    } catch (err) {
      // Ignore AbortError (happens if the user clicks "cancel" on the share sheet)
      if (err.name !== 'AbortError') {
        console.error("Error sharing:", err);
        alert("Failed to share ID card directly. Please use the download button.");
      }
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B0F19]">
        <FaCircleNotch className="h-10 w-10 animate-spin text-pink-400" />
        <p className="mt-4 text-sm font-semibold text-slate-300">
          Minting glass asset...
        </p>
      </div>
    );
  }

  if (error) {
    return (
        <div className="flex h-screen flex-col items-center justify-center bg-[#0B0F19] p-5 text-center">
        <FaTriangleExclamation className="mb-4 text-4xl text-pink-400" />
        <p className="font-bold text-white">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 px-6 py-2 text-white shadow-sm hover:bg-white/20 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0B0F19] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900 via-[#0B0F19] to-[#0B0F19] pb-20 font-sans selection:bg-pink-500/30">
      
      {/* Glass Header */}
      <header className="sticky top-0 z-50 flex w-full items-center gap-4 border-b border-white/10 bg-white/5 px-4 py-4 text-white shadow-lg backdrop-blur-lg">
        <button
          onClick={() => navigate("/staff-dashboard")}
          className="rounded-full p-2 transition hover:bg-white/10"
        >
          <FaArrowLeft />
        </button>
        <div>
          <div className="bg-gradient-to-r from-pink-300 via-fuchsia-300 to-indigo-300 bg-clip-text text-sm font-black uppercase tracking-widest text-transparent">
            Issuance Terminal
          </div>
          <div className="text-[11px] font-medium tracking-wider text-white/60">Premium Business Credential</div>
        </div>
      </header>

      <main className="mt-10 flex w-full max-w-[560px] flex-col items-center px-5">
        
        {/* Glass Action Buttons */}
        <div className="mb-10 flex w-full gap-4">
          <button
            onClick={handleDownloadOnly}
            disabled={downloading}
            className="group flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-white/12 via-white/8 to-white/6 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all hover:-translate-y-1 hover:border-pink-400/50 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {downloading ? (
              <FaCircleNotch className="mb-2 animate-spin text-2xl text-fuchsia-300" />
            ) : (
              <FaDownload className="mb-2 text-2xl text-fuchsia-300 transition-transform group-hover:scale-110" />
            )}
            <span className="text-xs font-black uppercase tracking-wider text-white mt-1 text-center">
              Save HD Asset
            </span>
          </button>

          <button
            onClick={handleNativeShare}
            disabled={downloading}
            className="group flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-white/12 via-white/8 to-white/6 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
             {downloading ? (
              <FaCircleNotch className="mb-2 animate-spin text-2xl text-emerald-300" />
            ) : (
              <FaShareNodes className="mb-2 text-2xl text-emerald-300 transition-transform group-hover:scale-110" />
            )}
            <span className="text-xs font-black uppercase tracking-wider text-white mt-1 text-center">
              Share Direct
            </span>
          </button>
        </div>

        {/* --- THE COLOURFUL GLASS ID CARD --- */}
        <div
          ref={cardRef}
          className="relative overflow-hidden shadow-[0_15px_50px_rgba(0,0,0,0.4)]"
          style={{
            width: "430px",
            height: "270px",
            borderRadius: "16px",
            border: "1px solid rgba(255, 255, 255, 0.45)",
            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 248, 255, 0.75) 35%, rgba(241, 245, 255, 0.68) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Vibrant Glowing Orbs */}
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden mix-blend-multiply">
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-pink-400/35 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-indigo-500/30 blur-3xl" />
            <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-400/20 blur-2xl" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[110px] font-black leading-none text-white/40 drop-shadow-md">
              CTM
            </div>
          </div>

          <div className="relative z-10 flex min-h-[56px] items-center justify-center border-b border-white/30 bg-gradient-to-r from-indigo-950/90 via-purple-950/85 to-fuchsia-950/85 px-4 py-2 text-white shadow-sm backdrop-blur-sm">
            <img
              src={ctmLogo}
              alt="CTMerchant Logo"
              className="absolute left-4 h-[34px] w-[34px] rounded-md border border-white/20 bg-white object-cover p-0.5 shadow-inner"
              crossOrigin="anonymous"
            />
            <div className="text-center leading-none">
              <p className="bg-gradient-to-r from-pink-200 via-fuchsia-200 to-indigo-200 bg-clip-text text-[0.85rem] font-black uppercase tracking-[0.15em] text-transparent drop-shadow-sm">
                CTMerchant <span className="text-pink-300">{cityName}</span> Branch
              </p>
              <p className="mt-1 text-[0.55rem] font-extrabold uppercase tracking-[0.25em] text-white/90">
                Business ID Card
              </p>
              <p className="mt-0.5 text-[0.45rem] font-bold tracking-[0.1em] text-white/60 uppercase">
                www.ctmerchant.com.ng
              </p>
            </div>
          </div>

          <div className="relative z-10 flex h-[184px] px-4 py-3">
            <div className="flex-1 pr-3 flex flex-col justify-center">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Business Name</p>
                  <p className="mt-0.5 line-clamp-2 text-[0.85rem] font-extrabold leading-tight text-indigo-950">{businessName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Proprietor</p>
                  <p className="mt-0.5 line-clamp-2 text-[0.75rem] font-bold leading-tight text-indigo-950">{proprietorName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Category</p>
                  <p className="mt-0.5 line-clamp-2 text-[0.75rem] font-bold leading-tight text-pink-700">{categoryName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Valid Until</p>
                  <p className="mt-0.5 text-[0.75rem] font-black leading-tight text-indigo-700">{formattedExpiry}</p>
                </div>
              </div>
              <div className="mt-4 min-w-0 border-t border-indigo-900/10 pt-2.5">
                <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Verified Address</p>
                <p className="mt-0.5 line-clamp-2 text-[0.7rem] font-semibold italic leading-tight text-indigo-950/80">{addressText}</p>
              </div>
            </div>

            <div className="flex w-[105px] flex-col items-center justify-between border-l border-indigo-900/10 pl-3 py-0.5">
              <div className="w-full text-center">
                <p className="text-[0.45rem] font-black uppercase tracking-[0.14em] text-indigo-900/60">ID Number</p>
                <p className="text-[0.75rem] font-black text-pink-600 break-all font-mono tracking-tighter">{uniqueId}</p>
              </div>
              <div className="rounded-xl bg-white/50 backdrop-blur-md p-1 shadow-sm border border-white/60">
                <img src={merchantAvatar} alt={proprietorName} className="h-[60px] w-[60px] rounded-lg object-cover shadow-inner" crossOrigin="anonymous" />
              </div>
              <div className="rounded-xl bg-white/60 backdrop-blur-md p-1 shadow-sm border border-white/60">
                <QRCodeSVG value={verificationUrl} size={60} level="H" includeMargin={false} bgColor="transparent" fgColor="#1e1b4b" />
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 border-t border-white/40 bg-white/40 backdrop-blur-md px-3 py-1.5 shadow-inner">
            <p className="text-center text-[0.45rem] font-bold leading-tight text-indigo-950/70">
              Disclaimer: CTMerchant is not liable for transactions or disputes arising from dealings by the holder of this card.
            </p>
          </div>
        </div>

        <p className="mt-8 text-[0.65rem] font-black uppercase tracking-[0.35em] text-white/40">
          Official Digital Asset
        </p>
      </main>
    </div>
  );
}
