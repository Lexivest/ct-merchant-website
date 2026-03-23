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
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
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
        setError(err.message || "Failed to load merchant data.");
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

  const handleDownload = async () => {
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

  const handleWhatsAppNotify = () => {
    let phone = shopData?.phone || "";

    if (!phone) {
      alert("No merchant phone number found.");
      return;
    }

    if (phone.startsWith("0")) {
      phone = `234${phone.slice(1)}`;
    }

    const msg = `Hello ${proprietorName}, your official CT-Merchant Business ID for *"${businessName}"* is ready. Unique ID: *${uniqueId}*.`;

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B0F19]">
        <FaCircleNotch className="h-10 w-10 animate-spin text-pink-500" />
        <p className="mt-4 text-sm font-semibold text-slate-300">
          Minting glass asset...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B0F19] p-5 text-center">
        <FaTriangleExclamation className="mb-4 text-4xl text-rose-500" />
        <p className="font-bold text-white">{error}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 px-6 py-2 text-white shadow-sm hover:bg-white/20 transition"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0B0F19] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900 via-[#0B0F19] to-[#0B0F19] pb-20 font-sans selection:bg-pink-500/30">
      
      {/* Glass Header */}
      <header className="flex w-full items-center gap-4 bg-white/5 backdrop-blur-lg border-b border-white/10 px-4 py-4 text-white shadow-lg sticky top-0 z-50">
        <button
          onClick={() => navigate("/staff-dashboard")}
          className="rounded-full p-2 transition hover:bg-white/10"
        >
          <FaArrowLeft />
        </button>
        <div>
          <div className="text-sm font-black uppercase tracking-widest bg-gradient-to-r from-pink-400 to-indigo-300 bg-clip-text text-transparent">
            Issuance Terminal
          </div>
          <div className="text-[11px] font-medium text-white/60 tracking-wider">Premium Business Credential</div>
        </div>
      </header>

      <main className="mt-10 flex w-full max-w-[560px] flex-col items-center px-5">
        
        {/* Glass Action Buttons */}
        <div className="mb-10 flex w-full gap-4">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="group flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all hover:bg-white/20 hover:border-pink-500/50 hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {downloading ? (
              <FaCircleNotch className="mb-2 animate-spin text-2xl text-pink-400" />
            ) : (
              <FaDownload className="mb-2 text-2xl text-pink-400 group-hover:scale-110 transition-transform" />
            )}
            <span className="text-xs font-black uppercase tracking-wider text-white">
              Save HD Asset
            </span>
          </button>

          <button
            onClick={handleWhatsAppNotify}
            className="group flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all hover:bg-white/20 hover:border-emerald-500/50 hover:-translate-y-1"
          >
            <FaWhatsapp className="mb-2 text-2xl text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-black uppercase tracking-wider text-white">
              Dispatch to User
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
            border: "1px solid rgba(255, 255, 255, 0.4)",
            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.6) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Vibrant Glowing Orbs (Behind the glass data) */}
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden mix-blend-multiply">
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-pink-400/30 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-indigo-500/30 blur-3xl" />
            <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-400/20 blur-2xl" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[110px] font-black leading-none text-white/40 drop-shadow-md">
              CTM
            </div>
          </div>

          {/* Card Header (Deep Glass, Centered Text, Logo Left) */}
          <div className="relative z-10 flex min-h-[56px] items-center justify-center bg-indigo-950/80 backdrop-blur-sm px-4 py-2 text-white border-b border-white/30 shadow-sm">
            <img
              src={ctmLogo}
              alt="CTMerchant Logo"
              className="absolute left-4 h-[34px] w-[34px] rounded-md border border-white/20 bg-white object-cover p-0.5 shadow-inner"
              crossOrigin="anonymous"
            />
            <div className="text-center leading-none">
              <p className="text-[0.85rem] font-black uppercase tracking-[0.15em] drop-shadow-sm">
                CTMerchant <span className="text-pink-400">{cityName}</span> Branch
              </p>
              <p className="mt-1 text-[0.55rem] font-extrabold uppercase tracking-[0.25em] text-white/90">
                Business ID Card
              </p>
              <p className="mt-0.5 text-[0.45rem] font-bold tracking-[0.1em] text-white/60 uppercase">
                www.ctmerchant.com.ng
              </p>
            </div>
          </div>

          {/* Card Body */}
          <div className="relative z-10 flex h-[184px] px-4 py-3">
            {/* Left Data Column (Bigger Fonts) */}
            <div className="flex-1 pr-3 flex flex-col justify-center">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">
                    Business Name
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[0.85rem] font-extrabold leading-tight text-indigo-950">
                    {businessName}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">
                    Proprietor
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[0.75rem] font-bold leading-tight text-indigo-950">
                    {proprietorName}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">
                    Category
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[0.75rem] font-bold leading-tight text-pink-700">
                    {categoryName}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">
                    Valid Until
                  </p>
                  <p className="mt-0.5 text-[0.75rem] font-black leading-tight text-indigo-700">
                    {formattedExpiry}
                  </p>
                </div>
              </div>

              <div className="mt-4 min-w-0 border-t border-indigo-900/10 pt-2.5">
                <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">
                  Verified Address
                </p>
                <p className="mt-0.5 line-clamp-2 text-[0.7rem] font-semibold italic leading-tight text-indigo-950/80">
                  {addressText}
                </p>
              </div>
            </div>

            {/* Right Media Column */}
            <div className="flex w-[105px] flex-col items-center justify-between border-l border-indigo-900/10 pl-3 py-0.5">
              <div className="w-full text-center">
                <p className="text-[0.45rem] font-black uppercase tracking-[0.14em] text-indigo-900/60">
                  ID Number
                </p>
                <p className="text-[0.75rem] font-black text-pink-600 break-all font-mono tracking-tighter">
                  {uniqueId}
                </p>
              </div>

              <div className="rounded-xl bg-white/50 backdrop-blur-md p-1 shadow-sm border border-white/60">
                <img
                  src={merchantAvatar}
                  alt={proprietorName}
                  className="h-[60px] w-[60px] rounded-lg object-cover shadow-inner"
                  crossOrigin="anonymous"
                />
              </div>

              <div className="rounded-xl bg-white/60 backdrop-blur-md p-1 shadow-sm border border-white/60">
                <QRCodeSVG
                  value={verificationUrl}
                  size={60}
                  level="H"
                  includeMargin={false}
                  bgColor="transparent"
                  fgColor="#1e1b4b"
                />
              </div>
            </div>
          </div>

          {/* Footer (Frosted Glass) */}
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