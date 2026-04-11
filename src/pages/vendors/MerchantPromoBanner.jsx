import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import { PageLoadingScreen } from "../../components/common/PageStatusScreen";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";
import logoImage from "../../assets/images/logo.jpg";

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

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgTextLines({ lines, x, y, fontSize, lineHeight, weight = 700, fill = "#FFFFFF", anchor = "start" }) {
  return (lines || [])
    .filter(Boolean)
    .map((line, index) => (
      `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-family="Verdana, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
    ))
    .join("");
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image data."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToDataUrl(url) {
  if (!url) return "";

  try {
    const response = await fetch(url, { cache: "force-cache", mode: "cors" });
    if (!response.ok) throw new Error("Image fetch failed.");
    return await blobToDataUrl(await response.blob());
  } catch {
    return "";
  }
}

function formatPromoPrice(product) {
  const price = Number(product?.price || 0);
  const discount = Number(product?.discount_price || 0);
  const finalPrice = discount && discount < price ? discount : price;
  return finalPrice > 0 ? `NGN ${finalPrice.toLocaleString()}` : "";
}

function buildPromoBannerSvg({
  products,
  shopNameLines,
  categoryLines,
  addressLines,
  uniqueId,
  websiteText,
  shopId,
  logoDataUrl,
  qrDataUrl,
  width = 800,
  height = 1080,
}) {
  const safeProducts = Array.from({ length: 4 }, (_, index) => products?.[index] || {});
  const headerHeight = 190;
  const gridPadding = 8;
  const gridGap = 8;
  const tileWidth = (width - gridPadding * 2 - gridGap) / 2;
  const tileHeight = 360;
  const gridY = headerHeight;
  const imageHeight = 252;
  const footerY = gridY + gridPadding * 2 + tileHeight * 2 + gridGap;
  const footerHeight = height - footerY;
  const qrText = `https://www.ctmerchant.com.ng/shop-detail?id=${shopId || ""}`;

  const productMarkup = safeProducts
    .map((product, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = gridPadding + col * (tileWidth + gridGap);
      const y = gridY + gridPadding + row * (tileHeight + gridGap);
      const image = product.svgImageUrl || product.image_url || "";
      const productName = wrapTextLines(product.name || "Featured Product", 30, 1)[0] || "";
      const price = formatPromoPrice(product);
      const hasDiscount = Number(product.discount_price || 0) > 0 && Number(product.discount_price) < Number(product.price || 0);
      const discountPct = hasDiscount
        ? Math.round(((Number(product.price) - Number(product.discount_price)) / Number(product.price)) * 100)
        : 0;
      const isUsed = product.condition === "Fairly Used";

      return `
        <g>
          <rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
          <clipPath id="promoProductClip${index}">
            <rect x="${x + 8}" y="${y + 8}" width="${tileWidth - 16}" height="${imageHeight - 16}" rx="8"/>
          </clipPath>
          <rect x="${x + 8}" y="${y + 8}" width="${tileWidth - 16}" height="${imageHeight - 16}" rx="8" fill="#F8FAFC"/>
          ${
            image
              ? `<image href="${escapeXml(image)}" x="${x + 8}" y="${y + 8}" width="${tileWidth - 16}" height="${imageHeight - 16}" preserveAspectRatio="xMidYMid meet" clip-path="url(#promoProductClip${index})"/>`
              : `<text x="${x + tileWidth / 2}" y="${y + 140}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="44" fill="#CBD5E1">+</text>`
          }
          ${
            hasDiscount
              ? `<rect x="${x + 14}" y="${y + 14}" width="68" height="30" rx="5" fill="#DC2626"/><text x="${x + 48}" y="${y + 35}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="15" font-weight="800" fill="#FFFFFF">-${discountPct}%</text>`
              : ""
          }
          ${
            isUsed
              ? `<rect x="${x + tileWidth - 72}" y="${y + 14}" width="58" height="30" rx="5" fill="#D97706"/><text x="${x + tileWidth - 43}" y="${y + 35}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="15" font-weight="800" fill="#FFFFFF">Used</text>`
              : ""
          }
          <line x1="${x}" y1="${y + imageHeight}" x2="${x + tileWidth}" y2="${y + imageHeight}" stroke="#E2E8F0"/>
          <text x="${x + tileWidth / 2}" y="${y + imageHeight + 42}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="18" font-weight="800" fill="#0F1111">${escapeXml(productName)}</text>
          <text x="${x + tileWidth / 2}" y="${y + imageHeight + 82}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="26" font-weight="900" fill="#EA580C">${escapeXml(price)}</text>
        </g>
      `;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="promoShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#0F172A" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" rx="26" fill="#003B95"/>
  <rect x="0" y="${gridY}" width="${width}" height="${footerY - gridY}" fill="#FFFFFF"/>
  <rect x="0" y="${footerY}" width="${width}" height="${footerHeight}" fill="#1E3A8A"/>

  <g>
    ${
      logoDataUrl
        ? `<image href="${escapeXml(logoDataUrl)}" x="24" y="24" width="34" height="34" preserveAspectRatio="xMidYMid slice"/>`
        : `<rect x="24" y="24" width="34" height="34" rx="4" fill="#FFFFFF" opacity="0.9"/>`
    }
    <text x="70" y="49" font-family="Verdana, Arial, sans-serif" font-size="17" font-weight="800" fill="#FFFFFF" opacity="0.92">${escapeXml(websiteText)}</text>
    ${svgTextLines({ lines: shopNameLines, x: 24, y: 94, fontSize: 25, lineHeight: 30, weight: 900 })}
    <text x="24" y="160" font-family="Verdana, Arial, sans-serif" font-size="20" font-weight="900" fill="#93C5FD">ID: ${escapeXml(uniqueId)}</text>
    ${svgTextLines({ lines: categoryLines, x: 190, y: 160, fontSize: 17, lineHeight: 22, weight: 900, fill: "#FBBF24" })}
    <rect x="704" y="24" width="72" height="72" rx="10" fill="#FFFFFF"/>
    ${
      qrDataUrl
        ? `<image href="${escapeXml(qrDataUrl)}" x="710" y="30" width="60" height="60" preserveAspectRatio="xMidYMid meet"/>`
        : `<text x="740" y="68" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="12" font-weight="900" fill="#003B95">QR</text>`
    }
    <text x="704" y="122" font-family="Verdana, Arial, sans-serif" font-size="10" font-weight="800" fill="#BFDBFE">${escapeXml(qrText.slice(0, 25))}</text>
  </g>

  <g filter="url(#promoShadow)">
    ${productMarkup}
  </g>

  <g>
    <text x="${width / 2}" y="${footerY + 48}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="18" font-weight="800" fill="#FFFFFF">
      ${escapeXml(addressLines.join(" "))}
    </text>
    <text x="${width / 2}" y="${footerY + 92}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="3" fill="#93C5FD">
      ENTER ID IN REPO OR SCAN TO VIEW SHOP
    </text>
  </g>
</svg>`;
}

async function buildStandalonePromoBannerSvg({
  products,
  shopNameLines,
  categoryLines,
  addressLines,
  uniqueId,
  websiteText,
  shopId,
}) {
  const qrUrl = `https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${encodeURIComponent(`https://www.ctmerchant.com.ng/shop-detail?id=${shopId || ""}`)}`;
  const [logoDataUrl, qrDataUrl, embeddedProducts] = await Promise.all([
    imageUrlToDataUrl(logoImage),
    imageUrlToDataUrl(qrUrl),
    Promise.all(
      (products || []).slice(0, 4).map(async (product) => ({
        ...product,
        svgImageUrl: await imageUrlToDataUrl(product.image_url),
      })),
    ),
  ]);

  return buildPromoBannerSvg({
    products: embeddedProducts,
    shopNameLines,
    categoryLines,
    addressLines,
    uniqueId,
    websiteText,
    shopId,
    logoDataUrl,
    qrDataUrl,
  });
}

async function svgToPngBlob(svg, width = 800, height = 1080) {
  const image = new Image();
  image.decoding = "async";

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Could not render generated promo banner."));
    image.src = svgToDataUrl(svg);
  });

  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      // The load event already confirmed the SVG can render.
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare promo banner image.");

  context.fillStyle = "#003B95";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not generate banner image."));
        return;
      }
      resolve(blob);
    }, "image/png", 1);
  });
}

function PromoBannerShimmer() {
  return (
    <PageLoadingScreen
      title="Opening promo banner"
      message="Please wait while we prepare your promo banner tools."
    />
  );
}

function PromoBannerArtwork({
  products,
  shopNameLines,
  categoryLines,
  addressLines,
  uniqueId,
  websiteText,
  shopId,
  exportMode = false,
  className = "",
}) {
  const shellClass = exportMode ? "w-[800px] shrink-0" : "w-full";
  const tileClass = "aspect-square flex flex-col";
  
  const titleClass = exportMode ? "text-[24px]" : "text-[1.15rem] sm:text-[24px]";
  const idClass = exportMode ? "text-[20px]" : "text-[0.95rem] sm:text-[20px]";
  const categoryClass = exportMode ? "text-[16px]" : "text-[0.75rem] sm:text-[16px]";
  const websiteClass = exportMode ? "text-[16px]" : "text-[0.8rem] sm:text-[16px]";
  const logoClass = exportMode ? "h-8 w-8" : "h-6 w-6 sm:h-8 sm:w-8";
  const qrClass = exportMode ? "h-[64px] w-[64px]" : "h-[45px] w-[45px] sm:h-[64px] sm:w-[64px]";
  
  const prodNameClass = exportMode ? "text-[14px]" : "text-[0.75rem] sm:text-[14px]";
  const prodPriceClass = exportMode ? "text-[18px]" : "text-[0.9rem] sm:text-[18px]";
  const badgeClass = exportMode ? "px-2 py-1 text-[12px]" : "px-1.5 py-0.5 text-[9px] sm:px-2 sm:py-1 sm:text-[12px]";
  
  const addressClass = exportMode ? "text-[16px]" : "text-[0.8rem] sm:text-[16px]";
  const footerNoteClass = exportMode ? "text-[13px]" : "text-[0.65rem] sm:text-[13px]";
  const locationIconClass = exportMode ? "text-[18px]" : "text-[14px] sm:text-[18px]";
  const qrBlendClass = exportMode ? "" : "mix-blend-multiply";
  const productBlendClass = exportMode ? "" : "mix-blend-multiply";

  return (
    <div className={`flex flex-col overflow-hidden rounded-[26px] bg-[#003B95] text-white shadow-[0_15px_30px_rgba(0,0,0,0.16)] ${shellClass} ${className}`}>
      
      {/* HEADER: Shop Name, Category, Website & QR */}
      <div className="flex items-start justify-between px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-1 flex-col pr-3 sm:pr-4">
          <div className="mb-2 flex items-center gap-2 sm:mb-2.5 sm:gap-2.5">
            <img
              crossOrigin="anonymous"
              src={logoImage}
              alt="CTMerchant"
              className={`rounded border border-white/20 object-cover shadow-sm ${logoClass}`}
            />
            <span className={`font-bold text-white/90 ${websiteClass}`}>{websiteText}</span>
          </div>
          <div className={`flex flex-wrap items-center gap-1.5 sm:gap-2 font-black leading-[1.15] text-white ${titleClass}`}>
            <span>{shopNameLines.join(" ")}</span>
            <span className={`font-black tracking-wide text-[#93C5FD] ${idClass}`}>| ID: {uniqueId}</span>
          </div>
          <div className={`mt-1.5 w-max font-extrabold text-[#FBBF24] underline decoration-2 underline-offset-4 sm:mt-2 ${categoryClass}`}>
            {categoryLines.join(" ")}
          </div>
        </div>
        
        <div className="flex shrink-0 flex-col items-end justify-start">
          <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-white p-1 sm:p-1.5 shadow-inner">
            <img
              crossOrigin="anonymous"
              src={`https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${encodeURIComponent(`https://www.ctmerchant.com.ng/shop-detail?id=${shopId || ""}`)}`}
              alt="Shop QR Code"
              className={`object-cover opacity-90 ${qrBlendClass} ${qrClass}`}
            />
          </div>
        </div>
      </div>

      {/* PRODUCT GRID: Clean separation of Image & Text */}
      <div className="grid grid-cols-2 gap-[6px] bg-white p-[6px]">
        {products.map((product, index) => {
          const price = product.price || 0;
          const discount = product.discount_price;
          const hasDiscount = discount && discount < price;
          const percent = hasDiscount ? Math.round(((price - discount) / price) * 100) : 0;
          const finalPrice = hasDiscount ? discount : price;

          return (
            <div
              key={`${product.id}-${index}`}
              className={`relative overflow-hidden rounded-[10px] border border-[#E2E8F0] bg-white ${tileClass}`}
            >
              {/* Top: Image Container */}
              <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#F8FAFC] p-1">
                <img
                  crossOrigin="anonymous"
                  src={product.image_url}
                  alt={product.name || `Product ${index + 1}`}
                  className={`absolute inset-0 h-full w-full object-contain p-1 ${productBlendClass}`}
                />
                
                {hasDiscount && (
                  <div className={`absolute left-1.5 top-1.5 rounded bg-[#DC2626] font-extrabold text-white shadow-sm ${badgeClass}`}>
                    -{percent}%
                  </div>
                )}
                
                {product.condition === "Fairly Used" && (
                  <div className={`absolute right-1.5 top-1.5 rounded bg-[#D97706] font-extrabold text-white shadow-sm ${badgeClass}`}>
                    Used
                  </div>
                )}
              </div>
              
              {/* Bottom: Clear Text Container */}
              {(product.name || price > 0) && (
                <div className="flex flex-col justify-center w-full border-t border-[#E2E8F0] bg-white p-2 sm:p-2.5 text-center">
                  {product.name && (
                    <div className={`truncate font-bold text-[#0F1111] ${prodNameClass}`}>
                      {product.name}
                    </div>
                  )}
                  {price > 0 && (
                    <div className={`mt-0.5 sm:mt-1 font-black leading-tight text-[#EA580C] ${prodPriceClass}`}>
                      ₦{Number(finalPrice).toLocaleString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER: Address & Scan Note */}
      <div className="flex flex-col items-center justify-center bg-[#1E3A8A] px-4 py-3 sm:px-6 sm:py-4">
        <div className="mb-1.5 flex w-full items-center justify-center gap-1.5 sm:mb-2 sm:gap-2 text-center">
          <FaLocationDot className={`shrink-0 text-[#FBBF24] ${locationIconClass}`} />
          <div className={`font-semibold leading-[1.3] text-white ${addressClass}`}>
            {addressLines.join(" ")}
          </div>
        </div>
        <div className={`font-black uppercase tracking-widest text-[#93C5FD] ${footerNoteClass}`}>
          Enter ID in repo or scan to view shop
        </div>
      </div>

    </div>
  );
}

export default function MerchantPromoBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  usePreventPullToRefresh();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-promo-banner" &&
    (!urlShopId || String(location.state.prefetchedData.shopData?.id) === String(urlShopId))
      ? location.state.prefetchedData
      : null

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(() => !prefetchedData);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shopData, setShopData] = useState(() => prefetchedData?.shopData || null);
  const [products, setProducts] = useState(() => prefetchedData?.products || []);

  useEffect(() => {
    if (prefetchedData) {
      setShopData(prefetchedData.shopData || null);
      setProducts(prefetchedData.products || []);
      setError(null);
      setLoading(false);
      return;
    }

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
          .limit(4);

        if (prodErr) throw prodErr;

        const fallbackProduct = {
          id: "fallback",
          name: "Featured Product",
          price: null,
          image_url: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800&auto=format&fit=crop"
        };
        
        const available = (prods || []).filter((p) => p.image_url);
        const finalProducts = available.length
          ? Array.from({ length: 4 }, (_, index) => available[index % available.length])
          : Array(4).fill(fallbackProduct);

        setProducts(finalProducts);
      } catch (err) {
        setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."));
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) fetchBannerData();
  }, [user, authLoading, urlShopId, isOffline, prefetchedData]);

  const generateBannerBlob = async () => {
    const svg = await buildStandalonePromoBannerSvg({
      products,
      shopNameLines,
      categoryLines,
      addressLines,
      uniqueId,
      websiteText,
      shopId: shopData?.id,
    });
    return svgToPngBlob(svg);
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
    <div
      className={`flex min-h-screen flex-col items-center bg-[#F4F7FB] text-[#0F1111] ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
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

        <div className="w-full rounded-[26px] border border-slate-200 bg-white p-3 sm:p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div className="w-full mx-auto">
              <PromoBannerArtwork
                products={products}
                shopNameLines={shopNameLines}
                categoryLines={categoryLines}
                addressLines={addressLines}
                uniqueId={uniqueId}
                websiteText={websiteText}
                shopId={shopData?.id}
                exportMode={false}
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
