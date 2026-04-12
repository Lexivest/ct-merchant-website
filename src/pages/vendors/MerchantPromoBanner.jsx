import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaCircleNotch,
  FaDownload,
  FaShareNodes,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { PageLoadingScreen } from "../../components/common/PageStatusScreen";
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";

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

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load banner image."));
    image.src = src;
  });
}

function formatPromoPrice(product) {
  const price = Number(product?.price || 0);
  const discount = Number(product?.discount_price || 0);
  const finalPrice = discount && discount < price ? discount : price;
  return finalPrice > 0 ? `NGN ${finalPrice.toLocaleString()}` : "";
}

function getNameInitials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "CT";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function setCanvasFont(context, weight, size) {
  context.font = `${weight} ${size}px Verdana, Arial, sans-serif`;
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fillRoundedRect(context, x, y, width, height, radius, fillStyle) {
  roundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = fillStyle;
  context.fill();
}

function strokeRoundedRect(context, x, y, width, height, radius, strokeStyle, lineWidth = 1) {
  roundedRectPath(context, x, y, width, height, radius);
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.stroke();
}

function truncateMeasuredText(context, value, maxWidth) {
  const text = String(value || "").trim();
  if (!text || context.measureText(text).width <= maxWidth) return text;

  let clipped = text;
  while (clipped.length > 1 && context.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1).trimEnd();
  }
  return `${clipped}...`;
}

function wrapMeasuredText(context, value, maxWidth, maxLines) {
  const words = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (!words.length) return [];

  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }

    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) lines.length = maxLines;

  const original = words.join(" ");
  const drawn = lines.join(" ");
  if (lines.length && drawn.length < original.length) {
    lines[lines.length - 1] = truncateMeasuredText(context, lines[lines.length - 1], maxWidth);
  }

  return lines;
}

function drawWrappedText(context, value, x, y, maxWidth, lineHeight, maxLines, options = {}) {
  const {
    weight = 700,
    size = 18,
    fillStyle = "#FFFFFF",
    align = "left",
  } = options;

  setCanvasFont(context, weight, size);
  context.fillStyle = fillStyle;
  context.textAlign = align;
  context.textBaseline = "alphabetic";

  const lines = wrapMeasuredText(context, value, maxWidth, maxLines);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
  return lines;
}

function drawContainedImage(context, image, x, y, width, height, background = "#F8FAFC") {
  fillRoundedRect(context, x, y, width, height, 8, background);
  if (!image) return;

  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  context.save();
  roundedRectPath(context, x, y, width, height, 8);
  context.clip();
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  context.restore();
}

async function generatePromoBannerCanvasBlob({
  products,
  shopName,
  category,
  address,
  uniqueId,
  websiteText,
  shopId,
  shopLogoUrl,
  cityName,
}) {
  const width = 800;
  const height = 1080;
  const headerHeight = 240;
  const gridPadding = 8;
  const gridGap = 8;
  const tileWidth = (width - gridPadding * 2 - gridGap) / 2;
  const gridY = headerHeight;
  const footerHeight = 88;
  const footerY = height - footerHeight;
  const tileHeight = (footerY - gridY - gridPadding * 2 - gridGap) / 2;
  const imageHeight = 252;
  const safeProducts = Array.from({ length: 4 }, (_, index) => products?.[index] || {});
  const qrUrl = `https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${encodeURIComponent(`https://www.ctmerchant.com.ng/shop-detail?id=${shopId || ""}`)}`;
  const [shopLogoDataUrl, qrDataUrl, productDataUrls] = await Promise.all([
    imageUrlToDataUrl(shopLogoUrl),
    imageUrlToDataUrl(qrUrl),
    Promise.all(safeProducts.map((product) => imageUrlToDataUrl(product.image_url))),
  ]);
  const [shopLogo, qr, productImages] = await Promise.all([
    loadImageElement(shopLogoDataUrl).catch(() => null),
    loadImageElement(qrDataUrl).catch(() => null),
    Promise.all(productDataUrls.map((dataUrl) => loadImageElement(dataUrl).catch(() => null))),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare promo banner image.");

  context.fillStyle = "#003B95";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, gridY, width, footerY - gridY);
  context.fillStyle = "#1E3A8A";
  context.fillRect(0, footerY, width, footerHeight);

  const logoSize = 152;
  const logoX = 24;
  const headerMediaY = 20;
  const qrX = width - logoX - logoSize;

  if (shopLogo) {
    drawContainedImage(context, shopLogo, logoX, headerMediaY, logoSize, logoSize, "#FFFFFF");
  } else {
    fillRoundedRect(context, logoX, headerMediaY, logoSize, logoSize, 16, "#FFFFFF");
    setCanvasFont(context, 900, 42);
    context.fillStyle = "#003B95";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(getNameInitials(shopName), logoX + logoSize / 2, headerMediaY + logoSize / 2);
  }

  const headerTextMaxWidth = width - logoSize * 2 - logoX * 4;
  const centerX = width / 2;
  const shopNameLines = drawWrappedText(context, shopName, centerX, 54, headerTextMaxWidth, 32, 2, {
    weight: 900,
    size: 32,
    fillStyle: "#FFFFFF",
    align: "center",
  });
  const categoryY = 54 + shopNameLines.length * 32 + 10;
  const categoryText = truncateMeasuredText(context, category, headerTextMaxWidth);

  setCanvasFont(context, 900, 23);
  context.fillStyle = "#FBBF24";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(categoryText, centerX, categoryY);
  const categoryMetrics = context.measureText(categoryText);
  const categoryUnderlineWidth = Math.min(categoryMetrics.width, headerTextMaxWidth);
  context.strokeStyle = "#FBBF24";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(centerX - categoryUnderlineWidth / 2, categoryY + 8);
  context.lineTo(centerX + categoryUnderlineWidth / 2, categoryY + 8);
  context.stroke();

  setCanvasFont(context, 800, 21);
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.fillText(websiteText, centerX, categoryY + 34);

  setCanvasFont(context, 900, 23);
  context.fillStyle = "#93C5FD";
  context.fillText(uniqueId, centerX, categoryY + 62);

  setCanvasFont(context, 800, 20);
  const addressLines = wrapMeasuredText(context, address, headerTextMaxWidth - 28, 2);
  const addressStartY = categoryY + 91;
  const addressLineHeight = 25;
  if (addressLines.length) {
    context.fillStyle = "#FBBF24";
    context.beginPath();
    context.arc(centerX - headerTextMaxWidth / 2 + 8, addressStartY - 9, 7, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(centerX - headerTextMaxWidth / 2 + 8, addressStartY + 7);
    context.lineTo(centerX - headerTextMaxWidth / 2 + 1, addressStartY - 2);
    context.lineTo(centerX - headerTextMaxWidth / 2 + 15, addressStartY - 2);
    context.closePath();
    context.fill();

    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillStyle = "#FBBF24";
    addressLines.forEach((line, index) => {
      context.fillText(line, centerX - headerTextMaxWidth / 2 + 28, addressStartY + index * addressLineHeight);
    });
  }

  fillRoundedRect(context, qrX, headerMediaY, logoSize, logoSize, 16, "#FFFFFF");
  if (qr) {
    drawContainedImage(context, qr, qrX + 10, headerMediaY + 10, logoSize - 20, logoSize - 20, "#FFFFFF");
  } else {
    setCanvasFont(context, 900, 18);
    context.fillStyle = "#003B95";
    context.textAlign = "center";
    context.fillText("QR", qrX + logoSize / 2, headerMediaY + logoSize / 2);
  }

  safeProducts.forEach((product, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = gridPadding + col * (tileWidth + gridGap);
    const y = gridY + gridPadding + row * (tileHeight + gridGap);
    const image = productImages[index];
    const hasDiscount = Number(product.discount_price || 0) > 0 && Number(product.discount_price) < Number(product.price || 0);
    const discountPct = hasDiscount
      ? Math.round(((Number(product.price) - Number(product.discount_price)) / Number(product.price)) * 100)
      : 0;

    fillRoundedRect(context, x, y, tileWidth, tileHeight, 10, "#FFFFFF");
    strokeRoundedRect(context, x, y, tileWidth, tileHeight, 10, "#E2E8F0");
    drawContainedImage(context, image, x + 8, y + 8, tileWidth - 16, imageHeight - 16);

    if (hasDiscount) {
      fillRoundedRect(context, x + 14, y + 14, 68, 30, 5, "#DC2626");
      setCanvasFont(context, 800, 15);
      context.fillStyle = "#FFFFFF";
      context.textAlign = "center";
      context.fillText(`-${discountPct}%`, x + 48, y + 35);
    }

    if (product.condition === "Fairly Used") {
      fillRoundedRect(context, x + tileWidth - 72, y + 14, 58, 30, 5, "#D97706");
      setCanvasFont(context, 800, 15);
      context.fillStyle = "#FFFFFF";
      context.textAlign = "center";
      context.fillText("Used", x + tileWidth - 43, y + 35);
    }

    context.strokeStyle = "#E2E8F0";
    context.beginPath();
    context.moveTo(x, y + imageHeight);
    context.lineTo(x + tileWidth, y + imageHeight);
    context.stroke();

    setCanvasFont(context, 800, 20);
    context.fillStyle = "#0F1111";
    context.textAlign = "center";
    context.fillText(truncateMeasuredText(context, product.name || "Featured Product", tileWidth - 24), x + tileWidth / 2, y + imageHeight + 40);

    const price = formatPromoPrice(product);
    if (price) {
      setCanvasFont(context, 900, 26);
      context.fillStyle = "#EA580C";
      context.fillText(price, x + tileWidth / 2, y + imageHeight + 78);
    }
  });

  setCanvasFont(context, 900, 22);
  context.fillStyle = "#FFFFFF";
  context.textAlign = "center";
  context.fillText(`${cityName || "Local"} City Commerce`, width / 2, footerY + 34);
  setCanvasFont(context, 800, 14);
  context.fillStyle = "#93C5FD";
  context.textAlign = "center";
  context.fillText("CTMerchant is not liable for transactions or disputes with this shop.", width / 2, footerY + 62);

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
              src=""
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
  const { notify } = useGlobalFeedback();

  const [loading, setLoading] = useState(() => !prefetchedData);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shopData, setShopData] = useState(() => prefetchedData?.shopData || null);
  const [products, setProducts] = useState(() => prefetchedData?.products || []);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

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
          .select("id, name, unique_id, category, is_verified, address, image_url, cities(name)")
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
    return generatePromoBannerCanvasBlob({
      products,
      shopName: shopData?.name || "",
      category: shopData?.category || "Shop & Retail",
      address: displayAddress,
      uniqueId,
      websiteText,
      shopId: shopData?.id,
      shopLogoUrl: shopData?.image_url,
      cityName: displayCityName,
    });
  };

  const handleShare = async () => {
    if (isOffline) {
      notify({
        type: "error",
        title: "No internet connection",
        message: "Please reconnect before sharing your banner.",
      });
      return;
    }
    try {
      setSharing(true);

      const blob = await generateBannerBlob();
      const file = new File([blob], `CTMerchant_Banner_${shopData.unique_id}.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
        });
      } else {
        notify({
          type: "info",
          title: "Sharing not supported",
          message: "Please save the banner, then share it manually.",
        });
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
      notify({
        type: "error",
        title: "Save failed",
        message: "We could not save the banner. Please try again.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const displayAddress = shopData?.address || "Registered Business Address";
  const displayCityName = shopData?.cities?.name || "Local";
  const websiteText = "www.ctmerchant.com.ng";
  const uniqueId = shopData?.unique_id || "PENDING";

  useEffect(() => {
    if (!shopData || !products.length) {
      setPreviewUrl("");
      return undefined;
    }

    let cancelled = false;
    let objectUrl = "";

    async function renderPreview() {
      try {
        setPreviewLoading(true);
        const blob = await generatePromoBannerCanvasBlob({
          products,
          shopName: shopData?.name || "",
          category: shopData?.category || "Shop & Retail",
          address: displayAddress,
          uniqueId,
          websiteText,
          shopId: shopData?.id,
          shopLogoUrl: shopData?.image_url,
          cityName: displayCityName,
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
      } catch (previewError) {
        console.warn("Could not render promo banner preview:", previewError);
        if (!cancelled) setPreviewUrl("");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    void renderPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shopData, products, displayAddress, displayCityName, uniqueId, websiteText]);

  if (authLoading || loading) return <PromoBannerShimmer />;

  if (error) {
    return (
      <GlobalErrorScreen
        error={error}
        message={error}
        onRetry={() => window.location.reload()}
        onBack={() => navigate("/vendor-panel")}
      />
    );
  }

  return (
    <div
      className={`flex min-h-screen flex-col items-center bg-[#F4F7FB] text-[#0F1111] ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <header className="sticky top-0 z-40 w-full px-4 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[860px] items-center rounded-[24px] bg-[#111827] px-4 py-4 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
          <button
            onClick={() => navigate("/vendor-panel")}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-[16px] bg-white/10 text-[1rem] transition hover:bg-white/15"
          >
            <FaArrowLeft />
          </button>
        </div>
      </header>

      <main className="flex w-full max-w-[860px] flex-1 flex-col items-center gap-4 px-4 pb-12">
        <div className="w-full rounded-[26px] border border-slate-200 bg-white p-3 sm:p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <div className="w-full mx-auto">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`${shopData?.name || "Shop"} promo banner preview`}
                className="block w-full rounded-[26px] bg-[#003B95]"
              />
            ) : (
              <div className="flex aspect-[20/27] w-full flex-col items-center justify-center rounded-[26px] bg-[#003B95] text-center text-white">
                <FaCircleNotch className={`mb-3 text-3xl ${previewLoading ? "animate-spin" : ""}`} />
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <button
            onClick={handleShare}
            disabled={sharing}
            className="flex w-full items-center justify-center gap-3 rounded-[18px] bg-[#db2777] px-5 py-4 text-[1rem] font-extrabold text-white shadow-[0_10px_24px_rgba(219,39,119,0.28)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sharing ? <FaCircleNotch className="animate-spin text-xl" /> : (
              <>
                <FaShareNodes /> Share Banner
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-slate-300 bg-white p-3.5 font-bold text-[#0F1111] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-slate-400 hover:bg-[#F7FAFA] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {downloading ? <><FaCircleNotch className="animate-spin" /> Saving...</> : <><FaDownload /> Save Image</>}
          </button>
        </div>
      </main>
    </div>
  );
}
