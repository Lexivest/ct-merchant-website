import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import {
  FaArrowLeft,
  FaCircleNotch,
  FaDownload,
  FaTriangleExclamation,
  FaWhatsapp
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import ctmLogo from "../../assets/images/logo.jpg";

function wrapTextLines(input, maxCharsPerLine, maxLines) {
  const text = String(input || "").trim().replace(/\s+/g, " ");
  if (!text) return [""];

  const words = text.split(" ");
  const lines = [];
  let current = "";
  let index = 0;

  for (; index < words.length; index += 1) {
    const word = words[index];
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine || !current) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) break;
  }

  const remainingWords = lines.length === maxLines - 1
    ? [current, ...words.slice(index + 1)].filter(Boolean).join(" ")
    : current;

  if (remainingWords) {
    const clipped = remainingWords.length > maxCharsPerLine
      ? `${remainingWords.slice(0, Math.max(0, maxCharsPerLine - 1)).trimEnd()}...`
      : remainingWords;
    lines.push(clipped);
  }

  return lines.slice(0, maxLines);
}

function normalizeWhatsAppNumber(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

function openWhatsAppChat(phone, message) {
  const encoded = encodeURIComponent(message);
  const webWhatsAppUrl = phone
    ? `https://wa.me/${phone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  if (phone) {
    const appWhatsAppUrl = `whatsapp://send?phone=${phone}&text=${encoded}`;
    window.location.href = appWhatsAppUrl;
    setTimeout(() => {
      window.open(webWhatsAppUrl, "_blank", "noopener,noreferrer");
    }, 700);
    return;
  }

  window.open(webWhatsAppUrl, "_blank", "noopener,noreferrer");
}

export default function StaffIDGenerator() {
  const navigate = useNavigate();
  usePreventPullToRefresh();

  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeAction, setActiveAction] = useState(null);
  const [shopData, setShopData] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [cityName, setCityName] = useState("Local");

  const cardRef = useRef(null);
  const exportCardRef = useRef(null);

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
  const whatsappNumber = useMemo(() => normalizeWhatsAppNumber(shopData?.phone), [shopData?.phone]);
  const exportBusinessLines = useMemo(() => wrapTextLines(businessName, 18, 2), [businessName]);
  const exportProprietorLines = useMemo(() => wrapTextLines(proprietorName, 18, 2), [proprietorName]);
  const exportCategoryLines = useMemo(() => wrapTextLines(categoryName, 19, 2), [categoryName]);
  const exportAddressLines = useMemo(() => wrapTextLines(addressText, 42, 3), [addressText]);

  const generateCardBlob = async () => {
    if (!exportCardRef.current) throw new Error("Card element not found.");

    const canvas = await html2canvas(exportCardRef.current, {
      scale: 5,
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
        "image/png"
      );
    });
  };

  const handleDownloadOnly = async () => {
    try {
      setActiveAction("download");
      const blob = await generateCardBlob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `CTM_BUSINESS_ID_${uniqueId}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to generate ID file.");
    } finally {
      setActiveAction(null);
    }
  };

  const handleWhatsAppShare = async () => {
    const msg = `Hello ${proprietorName}, your official CTMerchant Business ID for "${businessName}" is ready. ID: ${uniqueId}.`;

    try {
      setActiveAction("whatsapp");
      const blob = await generateCardBlob();
      const file = new File([blob], `CTM_BUSINESS_ID_${uniqueId}.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "CTMerchant Business ID",
          text: msg,
          files: [file],
        });
      } else {
        openWhatsAppChat(whatsappNumber, msg);
        alert("This browser cannot attach the ID image directly, so we opened the merchant's WhatsApp chat with the message filled in. Use Save HD Asset if you need to send the image itself.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Error sharing:", err);
        openWhatsAppChat(whatsappNumber, msg);
        alert("Direct image sharing was not available on this device, so we opened the merchant's WhatsApp chat instead.");
      }
    } finally {
      setActiveAction(null);
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

      <main className="mt-10 flex w-full max-w-[560px] flex-col items-center px-5 max-[460px]:px-3 max-[380px]:px-2">
        
        {/* Glass Action Buttons */}
        <div className="mb-10 flex w-full gap-4">
          <button
            onClick={handleDownloadOnly}
            disabled={activeAction !== null}
            className="group flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-white/12 via-white/8 to-white/6 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all hover:-translate-y-1 hover:border-pink-400/50 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {activeAction === "download" ? (
              <FaCircleNotch className="mb-2 animate-spin text-2xl text-fuchsia-300" />
            ) : (
              <FaDownload className="mb-2 text-2xl text-fuchsia-300 transition-transform group-hover:scale-110" />
            )}
            <span className="text-xs font-black uppercase tracking-wider text-white mt-1 text-center">
              Save HD Asset
            </span>
          </button>

          <button
            onClick={handleWhatsAppShare}
            disabled={activeAction !== null}
            className="group flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-white/12 via-white/8 to-white/6 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
             {activeAction === "whatsapp" ? (
              <FaCircleNotch className="mb-2 animate-spin text-2xl text-emerald-300" />
            ) : (
              <FaWhatsapp className="mb-2 text-2xl text-emerald-300 transition-transform group-hover:scale-110" />
            )}
            <span className="text-xs font-black uppercase tracking-wider text-white mt-1 text-center">
              Share To WhatsApp
            </span>
          </button>
        </div>

        <div className="fixed -left-[10000px] top-0 z-[-1] pointer-events-none opacity-0">
          <div
            ref={exportCardRef}
            className="relative overflow-hidden bg-white text-[#0f172a]"
            style={{
              width: "430px",
              height: "270px",
              borderRadius: "16px",
              border: "1px solid #cbd5e1",
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#fdf2f8_0%,#eef2ff_48%,#ffffff_100%)]" />
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#f9a8d4]/35" />
            <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-[#818cf8]/25" />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[92px] font-black leading-none text-slate-200/70">
              CTM
            </div>

            <div className="relative z-10 flex min-h-[56px] items-center justify-center border-b border-[#cbd5e1] bg-[linear-gradient(90deg,#1e1b4b_0%,#4c1d95_55%,#be185d_100%)] px-4 py-2 text-white">
              <img
                src={ctmLogo}
                alt="CTMerchant Logo"
                className="absolute left-4 h-[34px] w-[34px] rounded-md border border-white/25 bg-white object-cover p-0.5"
                crossOrigin="anonymous"
              />
              <div className="text-center leading-none">
                <p className="text-[0.85rem] font-black uppercase tracking-[0.15em] text-white">
                  CTMerchant <span className="text-[#fbcfe8]">{cityName}</span> Branch
                </p>
                <p className="mt-1 text-[0.55rem] font-extrabold uppercase tracking-[0.25em] text-white">
                  Business ID Card
                </p>
                <p className="mt-0.5 text-[0.45rem] font-bold uppercase tracking-[0.1em] text-slate-200">
                  www.ctmerchant.com.ng
                </p>
              </div>
            </div>

            <div className="relative z-10 flex h-[184px] px-4 py-3">
              <div className="flex flex-1 flex-col justify-start pr-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-slate-500">Business Name</p>
                    <div className="mt-1 text-[0.74rem] font-extrabold leading-[1.24] text-slate-900">
                      {exportBusinessLines.map((line, index) => (
                        <span key={`business-${index}`} className="block min-h-[0.92rem]">
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-slate-500">Proprietor</p>
                    <div className="mt-1 text-[0.68rem] font-bold leading-[1.24] text-slate-900">
                      {exportProprietorLines.map((line, index) => (
                        <span key={`proprietor-${index}`} className="block min-h-[0.84rem]">
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-slate-500">Category</p>
                    <div className="mt-1 text-[0.68rem] font-bold leading-[1.24] text-[#be185d]">
                      {exportCategoryLines.map((line, index) => (
                        <span key={`category-${index}`} className="block min-h-[0.84rem]">
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-slate-500">Valid Until</p>
                    <p className="mt-0.5 text-[0.75rem] font-black leading-tight text-[#4338ca]">{formattedExpiry}</p>
                  </div>
                </div>
                <div className="mt-3 min-w-0 border-t border-slate-200 pt-2.5">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-slate-500">Verified Address</p>
                  <div className="mt-1 text-[0.62rem] font-semibold italic leading-[1.26] text-slate-700">
                    {exportAddressLines.map((line, index) => (
                      <span key={`address-${index}`} className="block min-h-[0.78rem]">
                        {line}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex w-[105px] flex-col items-center justify-between border-l border-slate-200 pl-3 py-0.5">
                <div className="w-full rounded-lg bg-white/90 px-1 py-1 text-center shadow-sm">
                  <p className="text-[0.45rem] font-black uppercase tracking-[0.14em] text-slate-500">ID Number</p>
                  <p className="mt-1 break-all font-mono text-[0.66rem] font-black leading-[1.1] tracking-[-0.02em] text-[#be185d]">
                    {uniqueId}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <img src={merchantAvatar} alt={proprietorName} className="h-[60px] w-[60px] rounded-lg object-cover" crossOrigin="anonymous" />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <QRCodeSVG value={verificationUrl} size={60} level="H" includeMargin={true} bgColor="#ffffff" fgColor="#1e1b4b" />
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 px-3 py-1.5">
              <p className="text-center text-[0.45rem] font-bold leading-tight text-slate-600">
                Disclaimer: CTMerchant is not liable for transactions or disputes arising from dealings by the holder of this card.
              </p>
            </div>
          </div>
        </div>

        {/* --- THE COLOURFUL GLASS ID CARD --- */}
        <div className="flex h-[270px] w-full items-start justify-center overflow-visible max-[460px]:h-[258px] max-[420px]:h-[242px] max-[380px]:h-[224px]">
          <div
            ref={cardRef}
            className="relative origin-top overflow-hidden shadow-[0_15px_50px_rgba(0,0,0,0.4)] max-[460px]:scale-[0.96] max-[420px]:scale-[0.9] max-[380px]:scale-[0.83]"
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
                  <p className="mt-0.5 max-h-[2.2rem] overflow-hidden text-[0.85rem] font-extrabold leading-[1.12] text-indigo-950">{businessName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Proprietor</p>
                  <p className="mt-0.5 max-h-[2rem] overflow-hidden text-[0.75rem] font-bold leading-[1.15] text-indigo-950">{proprietorName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Category</p>
                  <p className="mt-0.5 max-h-[2rem] overflow-hidden text-[0.75rem] font-bold leading-[1.15] text-pink-700">{categoryName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Valid Until</p>
                  <p className="mt-0.5 text-[0.75rem] font-black leading-tight text-indigo-700">{formattedExpiry}</p>
                </div>
              </div>
              <div className="mt-4 min-w-0 border-t border-indigo-900/10 pt-2.5">
                <p className="text-[0.48rem] font-black uppercase tracking-[0.22em] text-indigo-900/60 drop-shadow-sm">Verified Address</p>
                <p className="mt-0.5 max-h-[2rem] overflow-hidden text-[0.7rem] font-semibold italic leading-[1.15] text-indigo-950/80">{addressText}</p>
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
                <QRCodeSVG value={verificationUrl} size={60} level="H" includeMargin={true} bgColor="transparent" fgColor="#1e1b4b" />
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 border-t border-white/40 bg-white/40 backdrop-blur-md px-3 py-1.5 shadow-inner">
            <p className="text-center text-[0.45rem] font-bold leading-tight text-indigo-950/70">
              Disclaimer: CTMerchant is not liable for transactions or disputes arising from dealings by the holder of this card.
            </p>
          </div>
          </div>
        </div>

        <p className="mt-8 text-[0.65rem] font-black uppercase tracking-[0.35em] text-white/40">
          Official Digital Asset
        </p>
      </main>
    </div>
  );
}
