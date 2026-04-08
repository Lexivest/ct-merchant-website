import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import html2canvas from "html2canvas";
import {
  FaArrowLeft,
  FaCircleCheck,
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
          <ShimmerBlock className="mt-6 h-[520px] w-full rounded-[26px]" />
        </div>
      </main>
    </div>
  );
}

function PromoBannerArtwork({
  products,
  shopNameLines,
  categoryLines,
  addressLines,
  uniqueId,
  websiteText,
  className = "",
}) {
  const shellClass = "w-full max-w-[800px]";
  const tileClass = "aspect-square";
  const titleClass = "text-[clamp(0.95rem,2.3vw,1.12rem)]";
  const categoryClass = "text-[clamp(0.78rem,1.7vw,0.92rem)]";
  const addressClass = "text-[clamp(0.78rem,1.8vw,0.92rem)]";
  const footerClass = "text-[clamp(0.82rem,1.8vw,0.96rem)]";

  return (
    <div className={`flex flex-col overflow-hidden rounded-[26px] bg-[#003B95] text-white shadow-[0_15px_30px_rgba(0,0,0,0.16)] ${shellClass} ${className}`}>
      {/* HEADER: Shop Name & Verified Badge */}
      <div className="flex items-center justify-between px-5 py-4 sm:px-6">
        <div className="flex flex-col max-w-[65%]">
          <div className={`font-black leading-[1.1] text-white ${titleClass}`}>
            {shopNameLines.join(" ")}
          </div>
          <div className="mt-1.5 inline-flex w-max items-center rounded-full bg-[#EA580C] px-3 py-1 font-extrabold text-white text-[0.7rem]">
            {categoryLines.join(" ")}
          </div>
        </div>
        <div className="flex flex-col items-end max-w-[35%]">
          <div className="flex items-center gap-1 text-[0.75rem] sm:text-[0.8rem] font-black text-[#34D399]">
            <FaCircleCheck className="shrink-0" /> <span className="text-right">VERIFIED MERCHANT</span>
          </div>
          <div className="mt-1 text-[0.75rem] font-bold text-[#93C5FD]">
            ID: {uniqueId}
          </div>
        </div>
      </div>

      {/* PRODUCT GRID: With Overlays & Prices */}
      <div className="grid grid-cols-3 gap-[6px] bg-white p-[6px]">
        {products.map((product, index) => {
          const price = product.price || 0;
          const discount = product.discount_price;
          const hasDiscount = discount && discount < price;
          const percent = hasDiscount ? Math.round(((price - discount) / price) * 100) : 0;
          const finalPrice = hasDiscount ? discount : price;

          return (
            <div
              key={`${product.id}-${index}`}
              className={`relative overflow-hidden rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] ${tileClass}`}
            >
              <img
                crossOrigin="anonymous"
                src={product.image_url}
                alt={product.name || `Product ${index + 1}`}
                className="h-full w-full object-contain p-1"
              />
              
              {(product.name || price > 0) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-6 text-center text-white">
                  {product.name && (
                    <div className="truncate text-[0.7rem] sm:text-[0.75rem] font-bold opacity-90">
                      {product.name}
                    </div>
                  )}
                  {price > 0 && (
                    <div className="text-[0.8rem] sm:text-[0.9rem] font-black leading-tight text-[#FBBF24]">
                      ₦{Number(finalPrice).toLocaleString()}
                    </div>
                  )}
                </div>
              )}
              
              {hasDiscount && (
                <div className="absolute left-1 top-1 rounded bg-[#DC2626] px-1.5 py-0.5 text-[0.6rem] sm:text-[0.65rem] font-extrabold text-white">
                  -{percent}%
                </div>
              )}
              
              {product.condition === "Fairly Used" && (
                <div className="absolute right-1 top-1 rounded bg-[#D97706] px-1.5 py-0.5 text-[0.6rem] sm:text-[0.65rem] font-extrabold text-white">
                  Used
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER: Address & Barcode */}
      <div className="flex items-center justify-between px-5 py-4 sm:px-6">
        <div className="flex max-w-[65%] items-start gap-2">
          <FaLocationDot className="mt-[2px] shrink-0 text-[0.9rem] sm:text-[1rem] text-[#FBBF24]" />
          <div className={`font-semibold leading-[1.3] text-[#E2E8F0] ${addressClass}`}>
            {addressLines.join(" ")}
          </div>
        </div>
        <div className="flex max-w-[30%] flex-col items-center justify-center rounded-lg bg-white p-1.5 shadow-inner">
          <img
            crossOrigin="anonymous"
            src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(shopNameLines.join(' ').replace(/[^a-zA-Z0-9 -]/g, '').trim().slice(0, 20) || uniqueId)}&scale=2&height=12&includetext`}
            alt="Barcode"
            className="h-[32px] sm:h-[36px] w-auto object-cover opacity-90 mix-blend-multiply"
          />
        </div>
      </div>

      {/* BOTTOM STRIP */}
      <div className={`flex w-full items-center justify-center bg-[#1E3A8A] py-2.5 font-black tracking-widest text-white ${footerClass}`}>
        {websiteText}
      </div>
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
  const [products, setProducts] = useState([]);

  const bannerRef = useRef(null);

  const waitForExportAssets = async (node) => {
    if (!node) return;

    if (typeof document !== "undefined" && document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Ignore font readiness errors and continue with capture.
      }
    }

    const images = Array.from(node.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            const finish = () => resolve();

            if (img.complete && img.naturalWidth > 0) {
              if (typeof img.decode === "function") {
                img.decode().then(finish).catch(finish);
              } else {
                finish();
              }
              return;
            }

            img.addEventListener("load", finish, { once: true });
            img.addEventListener("error", finish, { once: true });
          }),
      ),
    );

    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  };

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

        const { data: prods, error: prodErr } = await supabase
          .from("products")
          .select("id, name, price, discount_price, condition, image_url")
          .eq("shop_id", shop.id)
          .eq("is_approved", true)
          .limit(6);

        if (prodErr) throw prodErr;

        const fallbackProduct = {
          id: "fallback",
          name: "Featured Product",
          price: null,
          image_url: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800&auto=format&fit=crop"
        };
        
        const available = (prods || []).filter((p) => p.image_url);
        const finalProducts = available.length
          ? Array.from({ length: 6 }, (_, index) => available[index % available.length])
          : Array(6).fill(fallbackProduct);

        setProducts(finalProducts);
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

    await waitForExportAssets(bannerRef.current);

    // Dynamically scale based on current screen width to ensure high-quality output
    const currentWidth = bannerRef.current.offsetWidth;
    const scale = currentWidth < 500 ? 4 : 3;

    const canvas = await html2canvas(bannerRef.current, {
      scale,
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
      const textContent = `Visit my shop "${shopData.name}" on www.ctmerchant.com.ng\n\nSearch my ID: ${shopData.unique_id}.\n\n[Type your top products here...]`;

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
  const websiteText = "www.ctmerchant.com.ng";
  const shopNameLines = useMemo(() => wrapTextLines(shopData?.name || "", 24, 2), [shopData?.name]);
  const categoryLines = useMemo(() => wrapTextLines(shopData?.category || "Shop & Retail", 26, 2), [shopData?.category]);
  const addressLines = useMemo(() => wrapTextLines(displayAddress, 36, 3), [displayAddress]);
  const cityName = shopData?.cities?.name || "Local";
  const uniqueId = shopData?.unique_id || "PENDING";

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
            The promo engine pulls your verified shop details and latest approved product images into one printable promo layout.
          </p>
        </div>

        <div className="w-full rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div className="mx-auto w-full max-w-[800px]" ref={bannerRef}>
              <PromoBannerArtwork
                products={products}
                shopNameLines={shopNameLines}
                categoryLines={categoryLines}
                addressLines={addressLines}
                cityName={cityName}
                uniqueId={uniqueId}
                websiteText={websiteText}
              />
          </div>
        </div>

        <div className="w-full rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <div className="text-[0.92rem] font-black text-slate-900">Native promo flow status</div>
          <p className="mt-2 text-[0.86rem] leading-6 text-slate-500">
            The preview now follows the Expo layout directly: product collage first, then the shop promo card below it.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
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
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-slate-300 bg-white p-3.5 font-bold text-[#0F1111] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-slate-400 hover:bg-[#F7FAFA] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {downloading ? <><FaCircleNotch className="animate-spin" /> Saving...</> : <><FaDownload /> Save Image in High Quality</>}
          </button>
        </div>
      </main>
    </div>
  );
}
