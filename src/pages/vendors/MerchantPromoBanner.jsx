import React, { useEffect, useMemo, useRef, useState } from "react";
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

function PromoBannerShimmer() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F4F7FB] text-[#0F1111]">
      <header className="px-4 py-4">
        <div className="mx-auto flex w-full max-w-[860px] items-center gap-4 rounded-[24px] bg-[#111827] px-4 py-4 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[16px] bg-white/10 text-[1rem] opacity-60">
            <FaArrowLeft />
          </div>
          <div className="min-w-0">
            <div className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-[#f472b6]">Merchant</div>
            <div className="text-[1.2rem] font-black opacity-60">Shop Promo Banner</div>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[860px] flex-1 flex-col items-center p-5 pb-12">
        <div className="w-full rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <ShimmerBlock className="mb-2 h-4 w-28 rounded-full" />
          <ShimmerBlock className="mb-3 h-6 w-64 rounded" />
          <ShimmerBlock className="h-4 w-full rounded" />
          <ShimmerBlock className="mt-2 h-4 w-4/5 rounded" />
          <ShimmerBlock className="mt-6 h-[430px] w-full rounded-[26px]" />
        </div>
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
  const exportBannerRef = useRef(null);

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

        const { data: shop, error: shopErr } = await supabase
          .from("shops")
          .select("id, name, unique_id, category, is_verified, address, cities(name)")
          .eq("id", currentShopId)
          .eq("owner_id", user.id)
          .maybeSingle();

        if (shopErr || !shop) throw new Error("Could not load shop details.");
        if (!shop.is_verified) {
          throw new Error("Access Denied: Your shop must be Physically Verified before you can generate a Promotional Banner.");
        }
        setShopData(shop);

        const { data: products, error: prodErr } = await supabase
          .from("products")
          .select("image_url")
          .eq("shop_id", shop.id)
          .eq("is_approved", true)
          .limit(6);

        if (prodErr) throw prodErr;

        const fallbackImg = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800&auto=format&fit=crop";
        let finalImages = [];

        if (!products || products.length === 0) {
          finalImages = Array(6).fill(fallbackImg);
        } else {
          const avail = products.map((p) => p.image_url).filter(Boolean);
          if (avail.length === 0) {
            finalImages = Array(6).fill(fallbackImg);
          } else {
            for (let i = 0; i < 6; i += 1) {
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
    if (!exportBannerRef.current) throw new Error("Banner element not found.");

    const canvas = await html2canvas(exportBannerRef.current, {
      scale: 4,
      useCORS: true,
      backgroundColor: "#003B95",
      logging: false,
    });

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  };

  const handleShare = async () => {
    if (isOffline) return alert("You must be online to share.");
    try {
      setSharing(true);
      const textContent = `Visit my shop "${shopData.name}" on www.ctmerchant.com.ng\n\nSearch my ID: ${shopData.unique_id} or scan the QR code on my banner.\n\n[Type your top products here...]`;

      const blob = await generateBannerBlob();
      const file = new File([blob], `CTMerchant_Banner_${shopData.unique_id}.png`, { type: "image/png" });

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
      link.download = `CTMerchant_Banner_${shopData.unique_id}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to save image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const displayAddress = shopData?.address || "Registered Business Address";
  const shopUrlText = `www.ctmerchant.com.ng/shop-detail?id=${shopData?.id ?? ""}`;
  const shopUrl = `https://${shopUrlText}`;
  const websiteText = "www.ctmerchant.com.ng";
  const exportShopNameLines = useMemo(() => wrapTextLines(shopData?.name || "", 22, 2), [shopData?.name]);
  const exportCategoryLines = useMemo(() => wrapTextLines(shopData?.category || "Shop & Retail", 24, 2), [shopData?.category]);
  const exportAddressLines = useMemo(() => wrapTextLines(displayAddress, 34, 2), [displayAddress]);

  if (authLoading || loading) return <PromoBannerShimmer />;

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F4F7FB]">
        <header className="px-4 py-4">
          <div className="mx-auto flex w-full max-w-[860px] items-center gap-4 rounded-[24px] bg-[#111827] px-4 py-4 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
            <button
              onClick={() => navigate("/vendor-panel")}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-[16px] bg-white/10 transition hover:bg-white/15"
            >
              <FaArrowLeft />
            </button>
            <div className="min-w-0">
              <div className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-[#f472b6]">Merchant</div>
              <div className="text-[1.2rem] font-black">Shop Promo Banner</div>
            </div>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="mb-2 font-bold text-slate-900">Cannot Generate Banner</h3>
            <p className="mx-auto max-w-sm text-sm text-slate-600">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold transition hover:bg-slate-50">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#F4F7FB] text-[#0F1111]">
      <header className="sticky top-0 z-40 w-full px-4 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[860px] items-center gap-4 rounded-[24px] bg-[#111827] px-4 py-4 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
          <button
            onClick={() => navigate("/vendor-panel")}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-[16px] bg-white/10 text-[1rem] transition hover:bg-white/15"
          >
            <FaArrowLeft />
          </button>
          <div className="min-w-0">
            <div className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-[#f472b6]">Merchant</div>
            <div className="text-[1.35rem] font-black">Shop Promo Banner</div>
          </div>
        </div>
      </header>

      <main className="flex w-full max-w-[860px] flex-1 flex-col items-center gap-4 px-4 pb-12">
        <div className="w-full rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-pink-50 text-[1.2rem] text-[#db2777]">
              <FaImage />
            </div>
            <div>
              <div className="text-[1rem] font-black text-slate-900">Auto-generated from your shop</div>
              <div className="text-[0.84rem] font-semibold text-slate-500">Native promo layout synced to web</div>
            </div>
          </div>
          <p className="mt-3 text-[0.92rem] leading-6 text-slate-500">
            The promo engine pulls your verified shop identity and latest approved product images into one printable banner for WhatsApp broadcast and physical flex printing.
          </p>
        </div>

        <div className="fixed -left-[10000px] top-0 z-[-1] pointer-events-none opacity-0">
          <div
            ref={exportBannerRef}
            className="relative h-[450px] w-[800px] overflow-hidden bg-[#003B95] text-white"
          >
            <div className="absolute left-0 top-0 z-10 grid h-[402px] w-[56%] grid-cols-3 grid-rows-2 gap-2 bg-white p-2.5 pr-10">
              {productImages.map((imgUrl, idx) => (
                <div key={`export-${idx}`} className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                  <img crossOrigin="anonymous" src={imgUrl} alt={`Export Product ${idx}`} className="h-full w-full object-contain" />
                </div>
              ))}
            </div>

            <div className="absolute right-0 top-0 z-20 h-[402px] w-[48%] rounded-bl-[170px] border-l-[8px] border-[#FBBF24] bg-[#002f7a]" />

            <div className="absolute right-[15px] top-[20px] z-30 flex h-[362px] w-[370px] flex-col items-center text-center">
              <div className="mb-3 w-full px-1 text-[1rem] font-black uppercase leading-[1.18] text-white">
                {exportShopNameLines.map((line, index) => (
                  <span key={`export-shop-${index}`} className="block min-h-[1.15rem]">
                    {line}
                  </span>
                ))}
              </div>

              <div className="mb-3 inline-flex max-w-[320px] flex-col items-center justify-center gap-0.5 self-center rounded-full border-2 border-white bg-[#EA580C] px-8 py-2 text-center text-[0.94rem] font-semibold leading-[1.08] text-white">
                {exportCategoryLines.map((line, index) => (
                  <span key={`export-category-${index}`} className="block">
                    {line}
                  </span>
                ))}
              </div>

              <div className="mb-3 px-2.5 text-[0.9rem] font-semibold leading-[1.3] text-[#E2E8F0]">
                <FaLocationDot className="mr-1 inline align-text-top text-[#FBBF24]" />
                <div className="inline-block align-top text-left">
                  {exportAddressLines.map((line, index) => (
                    <span key={`export-address-${index}`} className="block min-h-[1rem]">
                      {line}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mb-1 text-[0.92rem] font-bold uppercase tracking-[0.08em] text-[#E2E8F0]">
                Shop Online With Us On
              </div>
              <div className="mb-3 text-[1.38rem] font-black leading-tight text-white">
                CTMerchant <span className="text-[#FBBF24]">{shopData?.cities?.name || "Local"}</span> Repo
              </div>

              <div className="mt-1 flex w-full items-center justify-center gap-3">
                <div className="shrink-0 text-right text-[0.78rem] font-black uppercase leading-tight tracking-[0.05em] text-[#FBBF24]">
                  <span className="whitespace-nowrap">ID: {shopData?.unique_id || "PENDING"}</span>
                </div>

                <div className="flex shrink-0 flex-col items-center rounded-lg border-[3px] border-[#FBBF24] bg-white p-1.5">
                  <div className="mb-1 text-[0.65rem] font-black uppercase text-[#003B95]">Barcode</div>
                  <div className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden">
                    <QRCodeSVG value={shopUrl} size={84} fgColor="#003B95" level="H" includeMargin={true} bgColor="#ffffff" />
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 z-[40] flex h-[48px] w-full items-center justify-center border-t-[4px] border-[#FBBF24] bg-[#001E50] text-[1.1rem] font-semibold text-white">
              Visit <span className="mx-1.5 font-extrabold text-[#FBBF24]">{websiteText}</span> or scan barcode
            </div>
          </div>
        </div>

        <div className="w-full rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div
            className="relative mx-auto h-[450px] w-[800px] origin-top overflow-hidden rounded-[26px] bg-[#003B95] text-white shadow-[0_15px_30px_rgba(0,0,0,0.2)] max-[860px]:-mb-[45px] max-[860px]:scale-[0.9] max-[760px]:-mb-[90px] max-[760px]:scale-[0.8] max-[660px]:-mb-[135px] max-[660px]:scale-[0.7] max-[560px]:-mb-[200px] max-[560px]:scale-[0.55] max-[460px]:-mb-[260px] max-[460px]:scale-[0.42] max-[380px]:-mb-[280px] max-[380px]:scale-[0.38]"
            ref={bannerRef}
          >
            <div className="absolute left-0 top-0 z-10 grid h-[calc(100%-50px)] w-[56%] grid-cols-3 grid-rows-2 gap-2 bg-white p-2.5 pr-10">
              {productImages.map((imgUrl, idx) => (
                <div key={idx} className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-1 shadow-sm">
                  <img crossOrigin="anonymous" src={imgUrl} alt={`Product ${idx}`} className="h-full w-full object-contain mix-blend-darken" />
                </div>
              ))}
            </div>

            <div className="absolute right-0 top-0 z-20 h-[calc(100%-50px)] w-[48%] rounded-bl-[170px] border-l-[8px] border-[#FBBF24] bg-gradient-to-b from-[#003B95] via-[#003B95] to-[#001E50]" />

            <div className="absolute right-[15px] top-[20px] z-30 flex h-[calc(100%-40px)] w-[370px] flex-col items-center text-center">
              <div className="mb-3 max-h-[58px] w-full overflow-hidden px-1 text-[1.16rem] font-black uppercase leading-[1.18] text-white drop-shadow-lg">
                {shopData.name}
              </div>

              <div className="mb-3 inline-flex max-w-[330px] flex-col items-center justify-center gap-0.5 self-center rounded-full border-2 border-white bg-[#EA580C] px-8 py-2 text-center text-[1.02rem] font-semibold leading-[1.08] text-white shadow-[0_6px_12px_rgba(234,88,12,0.4)]">
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
                  <div className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden">
                    <QRCodeSVG value={shopUrl} size={84} fgColor="#003B95" level="H" includeMargin={true} bgColor="#ffffff" />
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 z-[40] flex h-[48px] w-full items-center justify-center border-t-[4px] border-[#FBBF24] bg-[#001E50] text-[1.1rem] font-semibold text-white shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
              Visit <span className="mx-1.5 font-extrabold text-[#FBBF24] tracking-wide">{websiteText}</span> or scan barcode
            </div>
          </div>
        </div>

        <div className="w-full rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="text-[0.92rem] font-black text-slate-900">Native promo flow status</div>
          <p className="mt-2 text-[0.86rem] leading-6 text-slate-500">
            Preview generation is aligned to the Expo version. You can now broadcast or save the promo banner from this page using the same visual structure as the Android app.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <button
            onClick={handleShare}
            disabled={sharing}
            className="flex w-full items-center justify-center gap-3 rounded-[18px] bg-[#db2777] px-5 py-4 text-[1rem] font-extrabold text-white shadow-[0_10px_24px_rgba(219,39,119,0.28)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sharing ? <FaCircleNotch className="animate-spin text-xl" /> : (
              <>
                <FaShareNodes /> Broadcast Banner <FaWhatsapp className="ml-1 text-xl" /> <FaFacebookF className="text-xl" />
              </>
            )}
          </button>

          <div className="rounded-[16px] border border-[#FECACA] bg-[#FFF5F5] px-4 py-3 text-center text-[0.82rem] leading-relaxed text-[#6b7280]">
            <strong>Pro tip:</strong> save this banner in high quality and send it to a local printing press if you want a physical flex banner for your storefront.
          </div>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-slate-300 bg-white p-3.5 font-bold text-[#0F1111] transition hover:border-slate-400 hover:bg-[#F7FAFA] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {downloading ? <><FaCircleNotch className="animate-spin" /> Saving...</> : <><FaDownload /> Save Image in High Quality</>}
          </button>
        </div>
      </main>
    </div>
  );
}
