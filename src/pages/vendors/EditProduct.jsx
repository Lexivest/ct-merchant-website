import React, { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";
import {
  FaArrowLeft,
  FaCamera,
  FaChevronDown,
  FaCircleNotch,
  FaExpand,
  FaImage,
  FaListUl,
  FaLock,
  FaMicrochip,
  FaPaperPlane,
  FaRegEye,
  FaTrashCan,
  FaTriangleExclamation,
  FaWandMagicSparkles,
  FaXmark,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import CameraCaptureModal from "../../components/common/CameraCaptureModal";
import { PageLoadingScreen } from "../../components/common/PageStatusScreen";
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";
import { UPLOAD_RULES, formatBytes, getAcceptValue, getRuleLabel } from "../../lib/uploadRules";
import { IMAGE_PROFILES } from "../../lib/imageProfiles";
import { drawBrandedCanvasText } from "../../lib/brandCanvas";
import { clampWords, countWords } from "../../lib/textLimits";
import {
  loadProductCategoryRows,
  resolveProductCategoryGroup,
  toServiceCategoryOptions,
  toProductCategoryOptions,
} from "../../lib/productCategories";
import { isServiceCategory } from "../../lib/serviceCategories";
import { prepareVendorRouteTransition } from "../../lib/vendorRouteTransitions";

// Only importing the Editor utilities; the compression utilities are built-in below to prevent OOM crashes and enforce 100KB limits.
import {
  optimizeImageForEditor,
  padImageToAspectDataUrl,
} from "../../lib/imagePipeline";


// =========================================================================
// INLINED MEMORY-SAFE IMAGE PIPELINE (Bypasses external file OOM crashes)
// =========================================================================
const safeCanvasToBlob = (canvas, options) => {
  const { maxBytes, mimeType = "image/jpeg", qualityStart = 0.9, qualityStep = 0.1, qualityFloor = 0.1 } = options;
  return new Promise((resolve, reject) => {
    let currentQuality = qualityStart;
    const attemptCompression = () => {
      canvas.toBlob((blob) => {
        if (!blob) {
          // The silent killer: If blob is null, the browser ran out of RAM
          return reject(new Error("Browser memory exhausted. The image is too large for this device to process."));
        }
        if (blob.size <= maxBytes || currentQuality <= qualityFloor) {
          if (blob.size > maxBytes) {
             return reject(new Error(`Compression failed. Image exceeds ${formatBytes(maxBytes)} even at lowest quality.`));
          }
          resolve(blob);
        } else {
          currentQuality -= qualityStep;
          attemptCompression(); 
        }
      }, mimeType, currentQuality);
    };
    attemptCompression();
  });
};

const safeProcessImage = async (file, options) => {
  const { targetWidth, targetHeight, maxBytes, qualityStart, qualityFloor, qualityStep } = options;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl); // Free memory instantly
      try {
        // 1. Capping dimensions to 1920px prevents the Canvas from crashing the browser's RAM
        const MAX_SAFE_DIMENSION = 1920; 
        let drawWidth = img.width;
        let drawHeight = img.height;

        if (drawWidth > MAX_SAFE_DIMENSION || drawHeight > MAX_SAFE_DIMENSION) {
          const ratio = Math.min(MAX_SAFE_DIMENSION / drawWidth, MAX_SAFE_DIMENSION / drawHeight);
          drawWidth = Math.round(drawWidth * ratio);
          drawHeight = Math.round(drawHeight * ratio);
        }

        const safeCanvas = document.createElement("canvas");
        safeCanvas.width = drawWidth;
        safeCanvas.height = drawHeight;
        const safeCtx = safeCanvas.getContext("2d");
        if (!safeCtx) throw new Error("Could not initialize safe 2D context.");
        safeCtx.drawImage(img, 0, 0, drawWidth, drawHeight);

        // 2. NATURAL SCALING FIX: Scale image to fit *within* the target width/height without cropping it
        let finalWidth = drawWidth;
        let finalHeight = drawHeight;

        if (drawWidth > targetWidth || drawHeight > targetHeight) {
          const scale = Math.min(targetWidth / drawWidth, targetHeight / drawHeight);
          finalWidth = Math.round(drawWidth * scale);
          finalHeight = Math.round(drawHeight * scale);
        }

        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = finalWidth;
        finalCanvas.height = finalHeight;
        const finalCtx = finalCanvas.getContext("2d");

        // Fill background with white in case of transparent PNGs
        finalCtx.fillStyle = "#FFFFFF";
        finalCtx.fillRect(0, 0, finalWidth, finalHeight);

        // Draw the image cleanly preserving all edges
        finalCtx.drawImage(safeCanvas, 0, 0, drawWidth, drawHeight, 0, 0, finalWidth, finalHeight);

        const blob = await safeCanvasToBlob(finalCanvas, { maxBytes, mimeType: "image/jpeg", qualityStart, qualityStep, qualityFloor });
        resolve({ blob, previewUrl: URL.createObjectURL(blob) });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode the image file. It might be corrupted."));
    };

    img.src = objectUrl;
  });
};
// =========================================================================

const PRODUCT_RULE = UPLOAD_RULES.products;
const PRODUCT_PROFILE = IMAGE_PROFILES.product;
const PRODUCT_BUCKET = PRODUCT_RULE.bucket;
const PRODUCT_MAX_BYTES = PRODUCT_RULE.maxBytes;
const PRODUCT_INPUT_MAX_BYTES = PRODUCT_PROFILE.maxInputBytes;
const PRODUCT_ACCEPT = getAcceptValue(PRODUCT_RULE, "image/*");
const PRODUCT_RULE_LABEL = getRuleLabel(PRODUCT_RULE);
const MAX_SPECIAL_OFFERS = 2;
const PRODUCT_IMAGE_SLOTS = [1, 2, 3];
const PRODUCT_TEXT_LIMITS = {
  name: 20,
  key_features: 200,
  desc: 400,
  box_content: 300,
  warranty: 20,
};
const PRODUCT_TEXT_LIMIT_UNITS = { name: "words" };
const PRODUCT_TEXT_LABELS = {
  name: "Product Name / Title",
  key_features: "Key Features",
  desc: "Full Description",
  box_content: "What's in the Box",
  warranty: "Warranty",
};
const PRODUCT_ATTRIBUTE_TEXT_LIMIT = 60;

const DEFAULT_FORM = {
  name: "", price: "", stock: "1", condition: "New", category: "", desc: "", key_features: "", box_content: "", warranty: "", isDiscount: false, discountPercent: "",
};

function buildProductEditorState(product) {
  if (!product) {
    return {
      form: { ...DEFAULT_FORM },
      dynamicAttrs: {},
      existingUrls: { 1: null, 2: null, 3: null },
      previews: { 1: "", 2: "", 3: "" },
    };
  }

  const attrs = { ...(product.attributes || {}) };
  delete attrs["Key Features"];
  delete attrs["What's in the Box"];
  delete attrs["Warranty"];

  const isSpecial = product.discount_price && product.discount_price < product.price;
  const discountPerc = isSpecial ? Math.round(((product.price - product.discount_price) / product.price) * 100) : "";
  const urls = { 1: product.image_url || null, 2: product.image_url_2 || null, 3: product.image_url_3 || null };

  return {
    form: {
      name: product.name || "", price: product.price || "", stock: product.stock_count || 0, condition: product.condition || "New",
      category: product.category || "", desc: product.description || "", key_features: product.attributes?.["Key Features"] || "",
      box_content: product.attributes?.["What's in the Box"] || "", warranty: product.attributes?.["Warranty"] || "",
      isDiscount: isSpecial, discountPercent: discountPerc,
    },
    dynamicAttrs: attrs,
    existingUrls: urls,
    previews: { 1: urls[1] || "", 2: urls[2] || "", 3: urls[3] || "" },
  };
}

function EditProductShimmer() {
  return <PageLoadingScreen title="Opening edit product" message="Please wait while we prepare the product editor." />;
}

function CustomSelect({ value, onChange, options, placeholder, className, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div onClick={() => !disabled && setIsOpen(!isOpen)} className={`flex items-center justify-between bg-white transition-all ${className} ${disabled ? 'cursor-not-allowed opacity-70 bg-slate-50' : 'cursor-pointer'} ${isOpen ? "border-[#db2777] ring-2 ring-[#db2777]/20" : ""}`}>
        <span className={value ? "text-[#0F1111]" : "text-[#888C8C]"}>{value || placeholder}</span>
        <FaChevronDown className={`text-xs text-[#888C8C] transition-transform duration-200 ${isOpen ? "rotate-180 text-[#db2777]" : ""}`} />
      </div>
      {isOpen && !disabled && (
        <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#D5D9D9] bg-white py-1 shadow-xl animate-[slideDown_0.2s_ease]">
          {options.map((opt) => (
            <li key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); }} className={`cursor-pointer px-4 py-3 text-[0.95rem] transition-colors hover:bg-pink-50 ${value === opt.value ? "bg-pink-50 font-extrabold text-[#db2777]" : "font-medium text-[#0F1111]"}`}>
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function clampProductTextField(id, value) {
  const limit = PRODUCT_TEXT_LIMITS[id];
  if (!limit || typeof value !== "string") return value;
  if (PRODUCT_TEXT_LIMIT_UNITS[id] === "words") return clampWords(value, limit);
  return value.slice(0, limit);
}

function getProductTextLimitError(form, dynamicAttrs) {
  const limitedField = Object.entries(PRODUCT_TEXT_LIMITS).find(([field, limit]) => {
    if (PRODUCT_TEXT_LIMIT_UNITS[field] === "words") {
      return countWords(form[field]) > limit;
    }
    return String(form[field] || "").length > limit;
  });
  if (limitedField) {
    const unit = PRODUCT_TEXT_LIMIT_UNITS[limitedField[0]] || "characters";
    return `${PRODUCT_TEXT_LABELS[limitedField[0]]} must be ${limitedField[1]} ${unit} or less.`;
  }
  const oversizedAttr = Object.entries(dynamicAttrs || {}).find(([, value]) => typeof value === "string" && value.length > PRODUCT_ATTRIBUTE_TEXT_LIMIT);
  if (oversizedAttr) return `${oversizedAttr[0]} must be ${PRODUCT_ATTRIBUTE_TEXT_LIMIT} characters or less.`;
  return "";
}

function CharacterCounter({ value, limit, unit = "characters" }) {
  const length = unit === "words" ? countWords(value) : String(value || "").length;
  const isNearLimit = length >= Math.floor(limit * 0.9);
  const label = unit === "words" ? " words" : "";
  return <span className={`text-[0.72rem] font-bold ${isNearLimit ? "text-pink-600" : "text-slate-400"}`}>{length}/{limit}{label}</span>;
}

export default function EditProduct() {
  const navigate = useNavigate();
  const location = useLocation();
  usePreventPullToRefresh();
  const { notify, confirm } = useGlobalFeedback();
  const [searchParams] = useSearchParams();
  const productId = searchParams.get("id");
  const prefetchedData = location.state?.prefetchedData?.kind === "merchant-edit-product" && (!productId || String(location.state.prefetchedData.productId) === String(productId)) ? location.state.prefetchedData : null;
  const initialEditorState = useMemo(() => buildProductEditorState(prefetchedData?.productData), [prefetchedData]);

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(() => !prefetchedData);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [productData, setProductData] = useState(() => prefetchedData?.productData || null);
  const [activeOffersCount, setActiveOffersCount] = useState(() => prefetchedData?.activeOffersCount || 0);
  const [categoryRows, setCategoryRows] = useState(() => prefetchedData?.categoryRows || []);
  const [shopData, setShopData] = useState(() => prefetchedData?.shopData || null);

  const [form, setForm] = useState(() => initialEditorState.form);
  const [dynamicAttrs, setDynamicAttrs] = useState(() => initialEditorState.dynamicAttrs);

  const [existingUrls, setExistingUrls] = useState(() => initialEditorState.existingUrls);
  const [blobs, setBlobs] = useState({ 1: null, 2: null, 3: null });
  const [previews, setPreviews] = useState(() => initialEditorState.previews);
  const [deletedSlots, setDeletedSlots] = useState({ 1: false, 2: false, 3: false });
  const [processingSlots, setProcessingSlots] = useState({ 1: false, 2: false, 3: false });

  const [studioOpen, setStudioOpen] = useState(false);
  const [cameraSlot, setCameraSlot] = useState(null);
  const cameraSlotRef = useRef(null);
  const [activeSlot, setActiveSlot] = useState(null);
  const [tempImage, setTempImage] = useState("");
  const [preparingStudio, setPreparingStudio] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isFitting, setIsFitting] = useState(false);
  const mutationInFlightRef = useRef(false);
  const cropperRef = useRef(null);
  const fileInputRefs = { 1: useRef(null), 2: useRef(null), 3: useRef(null) };

  useEffect(() => { cameraSlotRef.current = cameraSlot; }, [cameraSlot]);

  useEffect(() => {
    function applyProductState(product, loadedCategoryRows, offerCount, shop = null) {
      const nextEditorState = buildProductEditorState(product);
      setProductData(product || null);
      setCategoryRows(loadedCategoryRows || []);
      setActiveOffersCount(offerCount || 0);
      setShopData(shop || null);
      setForm(nextEditorState.form);
      setDynamicAttrs(nextEditorState.dynamicAttrs);
      setExistingUrls(nextEditorState.existingUrls);
      setPreviews(nextEditorState.previews);
      setDeletedSlots({ 1: false, 2: false, 3: false });
      setBlobs({ 1: null, 2: null, 3: null });
    }

    if (prefetchedData) {
      applyProductState(prefetchedData.productData, prefetchedData.categoryRows, prefetchedData.activeOffersCount, prefetchedData.shopData || null);
      setError(null);
      setLoading(false);
      return;
    }

    async function fetchProduct() {
      if (!user) return;
      if (!productId) return navigate("/vendor-panel", { replace: true });
      if (isOffline) {
        setError("Network offline. Please connect to the internet to edit products.");
        return setLoading(false);
      }

      try {
        setLoading(true);
        const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", user.id).maybeSingle();
        if (profile?.is_suspended) throw new Error("Account restricted.");

        const [{ data: prod, error: prodErr }, loadedCategoryRows] = await Promise.all([
          supabase.from("products").select("*").eq("id", productId).maybeSingle(),
          loadProductCategoryRows(supabase),
        ]);

        if (prodErr || !prod) throw new Error("Product not found.");

        const { data: shop } = await supabase.from("shops").select("id, is_open, is_service").eq("id", prod.shop_id).eq("owner_id", user.id).maybeSingle();
        if (!shop) throw new Error("Access denied to this product's shop.");
        if (shop.is_open === false) throw new Error("Shop is suspended.");

        const { count } = await supabase.from('products').select('id', { count: 'exact', head: true })
          .eq('shop_id', prod.shop_id).not('discount_price', 'is', null).neq('id', productId);

        applyProductState(prod, loadedCategoryRows, count || 0, shop);
      } catch (err) {
        setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."));
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading) fetchProduct();
  }, [user, authLoading, productId, isOffline, navigate, prefetchedData]);

  useEffect(() => {
    if (!shopData || !form.category) return;
    if (shopData.is_service && !isServiceCategory(form.category)) {
      setForm((prev) => ({ ...prev, category: "" }));
      return;
    }
    if (!shopData.is_service && isServiceCategory(form.category)) {
      setForm((prev) => ({ ...prev, category: "" }));
    }
  }, [form.category, shopData]);

  const handleInputChange = (e) => {
    const { id, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [id]: type === "checkbox" ? checked : clampProductTextField(id, value) }));
  };

  const handleAttrChange = (key, value) => setDynamicAttrs((prev) => ({ ...prev, [key]: typeof value === "string" ? value.slice(0, PRODUCT_ATTRIBUTE_TEXT_LIMIT) : value }));
  const handleCategoryChange = (val) => {
    const nextIsService = isServiceCategory(val);
    if (nextIsService) {
      [2, 3].forEach((slot) => {
        if (previews[slot] && previews[slot].startsWith("blob:")) URL.revokeObjectURL(previews[slot]);
      });
      setDeletedSlots((prev) => ({ ...prev, 2: true, 3: true }));
      setBlobs((prev) => ({ ...prev, 2: null, 3: null }));
      setPreviews((prev) => ({ ...prev, 2: "", 3: "" }));
    }
    setForm((prev) => ({
      ...prev,
      category: val,
      ...(nextIsService
        ? { stock: "1", condition: "New", isDiscount: false, discountPercent: "" }
        : {}),
    }));
    setDynamicAttrs({});
  };
  const handleConditionChange = (val) => {
    setForm((prev) => {
      const next = { ...prev, condition: val };
      if (val === "Fairly Used") { next.isDiscount = false; next.discountPercent = ""; }
      return next;
    });
  };

  // --- MEMORY SAFE BACKGROUND PROCESSING ---
  const processImageInSlot = async (file, slot) => {
    if (!file || !slot) return;
    if (!file.type.startsWith("image/")) return notify({ type: "error", title: "Invalid image", message: "Please upload a valid image file." });
    if (file.size > PRODUCT_INPUT_MAX_BYTES) return notify({ type: "error", title: "Image too large", message: `Maximum input size is ${formatBytes(PRODUCT_INPUT_MAX_BYTES)}.` });

    setProcessingSlots((prev) => ({ ...prev, [slot]: true }));
    try {
      const result = await safeProcessImage(file, {
        targetWidth: PRODUCT_PROFILE.targetWidth,
        targetHeight: PRODUCT_PROFILE.targetHeight,
        maxBytes: PRODUCT_MAX_BYTES,
        qualityStart: 0.9,
        qualityStep: 0.1,
        qualityFloor: 0.1, // THE FIX: Allow aggressive compression to hit target
      });

      if (previews[slot] && previews[slot].startsWith("blob:")) URL.revokeObjectURL(previews[slot]);

      setBlobs((prev) => ({ ...prev, [slot]: result.blob }));
      setDeletedSlots((prev) => ({ ...prev, [slot]: false }));
      setPreviews((prev) => ({ ...prev, [slot]: result.previewUrl }));
    } catch (err) {
      notify({ type: "error", title: "Processing failed", message: err.message || "Unknown error during processing." });
    } finally {
      setProcessingSlots((prev) => ({ ...prev, [slot]: false }));
    }
  };

  const handleFileSelect = async (e, slot) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processImageInSlot(file, slot);
  };

  const handleCameraCapture = async ({ blob }) => {
    const targetSlot = cameraSlotRef.current;
    if (!blob || !targetSlot) return;
    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
    setCameraSlot(null);
    await processImageInSlot(file, targetSlot);
  };

  const openStudioForSlot = async (slot) => {
    const currentPreview = previews[slot];
    if (!currentPreview) return;

    setPreparingStudio(true);
    try {
      let sourceBlob = blobs[slot];
      if (!sourceBlob && existingUrls[slot]) {
        const response = await fetch(existingUrls[slot]);
        sourceBlob = await response.blob();
      }

      if (!sourceBlob) throw new Error("Could not find image data.");

      const preparedImage = await optimizeImageForEditor(sourceBlob, { maxDimension: 1800, mimeType: "image/jpeg", quality: 0.9 });
      if (tempImage && tempImage.startsWith("blob:")) URL.revokeObjectURL(tempImage);

      setActiveSlot(slot);
      setTempImage(preparedImage.src);
      setBrightness(100);
      setContrast(100);
      setStudioOpen(true);
    } catch (err) {
      notify({ type: "error", title: "Editor failed", message: err.message || "Could not open the image editor." });
    } finally {
      setPreparingStudio(false);
    }
  };

  const closeStudio = () => {
    if (tempImage && tempImage.startsWith("blob:")) URL.revokeObjectURL(tempImage);
    setStudioOpen(false);
    setTempImage("");
    setActiveSlot(null);
  };

  const applyWhiteBorders = async () => {
    if (!tempImage) return;
    setIsFitting(true);
    try {
      const fitted = await padImageToAspectDataUrl(tempImage, PRODUCT_PROFILE.aspectRatio);
      if (tempImage.startsWith("blob:")) URL.revokeObjectURL(tempImage);
      setTempImage(fitted);
      if (cropperRef.current?.cropper) cropperRef.current.cropper.replace(fitted);
    } catch (error) {
      notify({ type: "error", title: "Auto-fit failed", message: error.message || "Could not auto-fit the image." });
    } finally {
      setIsFitting(false);
    }
  };

  const applyCrop = async () => {
    if (!cropperRef.current?.cropper) return;
    const cropper = cropperRef.current.cropper;

    const croppedCanvas = cropper.getCroppedCanvas({
      width: PRODUCT_PROFILE.targetWidth, height: PRODUCT_PROFILE.targetHeight, fillColor: "#FFFFFF",
      imageSmoothingEnabled: true, imageSmoothingQuality: "high",
    });

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = PRODUCT_PROFILE.targetWidth; finalCanvas.height = PRODUCT_PROFILE.targetHeight;
    const ctx = finalCanvas.getContext("2d");
    if (!ctx) return notify({ type: "error", title: "Editor unavailable", message: "Could not initialize the canvas." });

    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.drawImage(croppedCanvas, 0, 0);
    ctx.filter = "none";
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    drawBrandedCanvasText(ctx, "CTMerchant", PRODUCT_PROFILE.targetWidth - 20, PRODUCT_PROFILE.targetHeight - 20, { baseColor: "rgba(255, 255, 255, 0.45)" });

    try {
      const blob = await safeCanvasToBlob(finalCanvas, {
        maxBytes: PRODUCT_MAX_BYTES,
        mimeType: PRODUCT_PROFILE.outputMimeType,
        qualityStart: 0.9,
        qualityStep: 0.1,
        qualityFloor: 0.1,
      });

      if (!blob) throw new Error("Compression failed. The browser may have run out of memory.");
      if (previews[activeSlot] && previews[activeSlot].startsWith("blob:")) URL.revokeObjectURL(previews[activeSlot]);

      setBlobs((prev) => ({ ...prev, [activeSlot]: blob }));
      setDeletedSlots((prev) => ({ ...prev, [activeSlot]: false }));
      setPreviews((prev) => ({ ...prev, [activeSlot]: URL.createObjectURL(blob) }));
      closeStudio();
    } catch (err) {
      notify({ type: "error", title: "Crop failed", message: err.message || "Could not save cropped image." });
    }
  };

  const removeImage = (e, slot) => {
    e.stopPropagation();
    if (previews[slot] && previews[slot].startsWith("blob:")) URL.revokeObjectURL(previews[slot]);
    setDeletedSlots((prev) => ({ ...prev, [slot]: true }));
    setBlobs((prev) => ({ ...prev, [slot]: null }));
    setPreviews((prev) => ({ ...prev, [slot]: "" }));
  };

  async function removeProductImagePaths(paths, context = "Product image cleanup failed") {
    const uniquePaths = [...new Set(paths)].filter(Boolean);
    if (!uniquePaths.length) return;
    const { error } = await supabase.storage.from(PRODUCT_BUCKET).remove(uniquePaths);
    if (error) throw new Error(`${context}: ${error.message}`);
  }

  async function getUploadFingerprint(blob) {
    try {
      if (globalThis.crypto?.subtle && typeof blob?.arrayBuffer === "function") {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 20);
      }
    } catch {
      // Fall back to a timestamp fingerprint when the browser blocks hashing.
    }
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // --- SUBMIT UPDATE (WITH ROLLBACK) ---
  const handleUpdate = async (e) => {
    e.preventDefault();
    if (submitting || deleting || mutationInFlightRef.current) return;
    if (isOffline) return notify({ type: "error", title: "Network unavailable", message: "You must be online to update a product." });
    if (!form.category) return notify({ type: "error", title: "Category required", message: "Please select a category before continuing." });
    const textLimitError = getProductTextLimitError(form, dynamicAttrs);
    if (textLimitError) return notify({ type: "error", title: "Text too long", message: textLimitError });
    
    const hasMainImage = (existingUrls[1] && !deletedSlots[1]) || blobs[1];
    if (!hasMainImage) return notify({ type: "error", title: "Main image required", message: "The main image in Box 1 is required before you can save this product." });
    
    const oversizedSlot = [1, 2, 3].find((slot) => blobs[slot] && blobs[slot].size > PRODUCT_MAX_BYTES);
    if (oversizedSlot) return notify({ type: "error", title: "Image too large", message: `Image ${oversizedSlot} exceeds ${formatBytes(PRODUCT_MAX_BYTES)} after processing. Please re-crop it.` });
    
    const isUpdatingService = isServiceCategory(form.category);
    if (!isUpdatingService && form.isDiscount && activeOffersCount >= MAX_SPECIAL_OFFERS && (!productData.discount_price || productData.discount_price >= productData.price)) {
      return notify({ type: "error", title: "Offer limit reached", message: "You already have the maximum of 2 special offers active." });
    }

    const uploadedImagePaths = [];
    let dbUpdateSucceeded = false;

    try {
      mutationInFlightRef.current = true;
      setSubmitting(true);
      const priceVal = parseFloat(form.price);
      let discountPrice = null;
      if (!isUpdatingService && form.isDiscount && form.condition !== "Fairly Used") {
        const perc = parseFloat(form.discountPercent);
        if (!perc || perc <= 0 || perc > 20) throw new Error("Discount must be between 1% and 20%");
        discountPrice = priceVal - priceVal * (perc / 100);
      }

      const finalAttrs = { ...dynamicAttrs };
      if (form.key_features.trim()) finalAttrs["Key Features"] = form.key_features.trim();
      if (form.box_content.trim()) finalAttrs["What's in the Box"] = form.box_content.trim();
      if (form.warranty.trim()) finalAttrs["Warranty"] = form.warranty.trim();

      // Upload new blobs
      const uploadSlots = isUpdatingService ? [1] : PRODUCT_IMAGE_SLOTS;
      const uploadPromises = uploadSlots.map(async (idx) => {
        if (!blobs[idx]) return { slot: idx, url: null, path: null };
        const fingerprint = await getUploadFingerprint(blobs[idx]);
        const fName = `${user.id}_img${idx}_${fingerprint}.jpg`;
        const { error: upErr } = await supabase.storage.from(PRODUCT_BUCKET).upload(fName, blobs[idx], { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
        if (upErr) throw upErr;
        const url = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(fName).data.publicUrl;
        return { slot: idx, path: fName, url: url };
      });

      const uploadResults = await Promise.allSettled(uploadPromises);
      let hasUploadError = false;
      let newUrls = { 1: null, 2: null, 3: null };

      for (const result of uploadResults) {
        if (result.status === "fulfilled") {
          if (result.value.path) uploadedImagePaths.push(result.value.path); 
          newUrls[result.value.slot] = result.value.url;
        } else {
          hasUploadError = true;
          console.error("Image upload failed:", result.reason);
        }
      }

      if (hasUploadError) throw new Error("One or more images failed to upload. Aborting update.");

      const finalUrl1 = newUrls[1] || (deletedSlots[1] ? null : existingUrls[1]);
      const finalUrl2 = isUpdatingService ? null : newUrls[2] || (deletedSlots[2] ? null : existingUrls[2]);
      const finalUrl3 = isUpdatingService ? null : newUrls[3] || (deletedSlots[3] ? null : existingUrls[3]);

      // Update DB (Postgres trigger handles deleting old images replaced in this update)
      const { error: rpcErr } = await supabase.rpc("manage_product", {
        p_product_id: parseInt(productId), p_name: form.name.trim(), p_description: form.desc.trim(), p_price: priceVal, p_discount_price: discountPrice,
        p_condition: isUpdatingService ? "New" : form.condition, p_category: form.category, p_image_url: finalUrl1, p_image_url_2: finalUrl2, p_image_url_3: finalUrl3,
        p_stock_count: isUpdatingService ? 1 : parseInt(form.stock), p_attributes: finalAttrs, p_is_available: isUpdatingService ? true : parseInt(form.stock) > 0,
      });

      if (rpcErr) throw rpcErr;
      dbUpdateSucceeded = true;

      notify({
        type: "success",
        title: "Update Successful",
        message: isUpdatingService
          ? "Your service listing has been updated and resubmitted for approval."
          : "Your product has been updated and resubmitted for approval. You can continue editing or go back.",
      });

      setExistingUrls({ 1: finalUrl1, 2: finalUrl2, 3: finalUrl3 });
      setBlobs({ 1: null, 2: null, 3: null });
      setDeletedSlots({ 1: false, 2: false, 3: false });
      setProductData(prev => ({ ...prev, is_approved: false, rejection_reason: null }));
      window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (err) {
      if (!dbUpdateSucceeded && uploadedImagePaths.length > 0) {
        try { await removeProductImagePaths(uploadedImagePaths, "New product image rollback failed"); } 
        catch (cleanupErr) { console.warn("Rollback cleanup failed:", cleanupErr); }
      }
      notify({ type: "error", title: "Update failed", message: err.message || "Update failed." });
    } finally {
      mutationInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const deleteProduct = async () => {
    if (submitting || deleting || mutationInFlightRef.current) return;
    if (isOffline) return notify({ type: "error", title: "Network unavailable", message: "You must be online to delete a product." });
    
    const approved = await confirm({ type: "error", title: "Delete product?", message: "Are you sure you want to permanently delete this product? This action cannot be undone.", confirmText: "Delete", cancelText: "Keep product" });
    if (!approved) return;
    
    try {
      mutationInFlightRef.current = true;
      setDeleting(true);

      const { data: latestProduct, error: latestProductError } = await supabase.from("products").select("shop_id").eq("id", productId).maybeSingle();
      if (latestProductError) throw latestProductError;
      if (!latestProduct) throw new Error("Product not found or already deleted.");
      
      // Delete from DB. Your Postgres trigger `cleanup_orphaned_product_images` will handle the actual file deletion.
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;

      const nextPath = `/merchant-add-product?shop_id=${encodeURIComponent(latestProduct.shop_id)}`;
      let prefetchedAddProductData = null;
      try {
        prefetchedAddProductData = await prepareVendorRouteTransition({ path: nextPath, userId: user.id, shopId: latestProduct.shop_id });
      } catch (transitionError) { console.warn("Add product prefetch after delete failed:", transitionError); }
      
      notify({ type: "success", title: "Product deleted", message: "The product and its images have been removed. You can add a new product now." });

      navigate(nextPath, { replace: true, state: { fromVendorTransition: true, prefetchedData: prefetchedAddProductData, verifiedSubscriptionActive: true } });
    } catch (err) {
      notify({ type: "error", title: "Delete failed", message: getFriendlyErrorMessage(err, "Failed to delete product.") });
      setDeleting(false);
    } finally {
      mutationInFlightRef.current = false;
    }
  };

  const livePrice = parseFloat(form.price) || 0;
  const liveDiscPerc = parseFloat(form.discountPercent) || 0;
  const isLiveDiscValid = form.isDiscount && form.condition !== "Fairly Used" && liveDiscPerc > 0 && liveDiscPerc <= 20;
  const liveFinalPrice = isLiveDiscValid ? livePrice - livePrice * (liveDiscPerc / 100) : livePrice;
  const categoryOptions = useMemo(
    () => shopData?.is_service ? toServiceCategoryOptions(form.category) : toProductCategoryOptions(categoryRows, form.category),
    [categoryRows, form.category, shopData?.is_service],
  );
  const categoryGroup = useMemo(() => resolveProductCategoryGroup(form.category, categoryRows), [form.category, categoryRows]);
  const isServiceListing = shopData?.is_service === true || categoryGroup === "services" || isServiceCategory(form.category);
  const editorCopy = isServiceListing
    ? {
        header: "Edit Service",
        previewTitle: "Service Page Preview",
        previewName: "Service Title",
        nameLabel: "Service Title",
        detailsTitle: "Service Presentation Details",
        keyFeaturesLabel: "What You Offer",
        descLabel: "Service Details",
        boxLabel: "What Is Included",
        warrantyLabel: "After-Service Support",
        submitLabel: productData.is_approved === false && productData.rejection_reason ? "Resubmit Service" : "Update Service",
        cameraTitle: "Capture Service Photo",
      }
    : {
        header: "Edit Product",
        previewTitle: "Marketplace Preview",
        previewName: "Product Title",
        nameLabel: "Product Name / Title",
        detailsTitle: "Product Presentation Details",
        keyFeaturesLabel: "Key Features",
        descLabel: "Full Description",
        boxLabel: "What's in the Box",
        warrantyLabel: "Warranty",
        submitLabel: productData.is_approved === false && productData.rejection_reason ? "Resubmit Update" : "Update Product",
        cameraTitle: "Capture Product Photo",
      };

  if (authLoading || loading) return <EditProductShimmer />;
  if (error) return <GlobalErrorScreen error={error} message={error} onRetry={() => window.location.reload()} onBack={() => navigate("/vendor-panel")} />;

  return (
    <div className={`flex min-h-screen flex-col bg-[#F3F4F6] pb-12 text-[#0F1111] ${location.state?.fromVendorTransition ? "ctm-page-enter" : ""}`}>
      <header className="sticky top-0 z-40 flex items-center gap-4 bg-[#131921] px-4 py-3 text-white shadow-sm">
        <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]"><FaArrowLeft /></button>
        <div className="text-[1.15rem] font-bold">{editorCopy.header}</div>
      </header>

      <main className={`mx-auto w-full max-w-[680px] p-5 transition-opacity ${deleting ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
        
        {productData.is_approved === false && productData.rejection_reason && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4 animate-[slideDown_0.3s_ease]">
            <FaTriangleExclamation className="mt-0.5 shrink-0 text-xl text-[#DC2626]" />
            <div>
              <div className="mb-1 font-extrabold text-[#991B1B]">Action Required: Product Rejected</div>
              <div className="text-[0.9rem] leading-relaxed text-[#B91C1C]">
                <strong>Reason:</strong> {productData.rejection_reason}
                <div className="mt-2 text-[0.85rem] italic opacity-90">Please fix the issues mentioned above and click "Resubmit Update" at the bottom to send it back for approval.</div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <h4 className="mb-2 flex items-center gap-2 text-[0.95rem] font-extrabold"><FaWandMagicSparkles className="text-[#db2777]" /> Powered by CT Studio</h4>
          <p className="text-[0.85rem] text-[#475569] leading-relaxed">
            {isServiceListing
              ? `Use Gallery or Camera for one clear service image. Camera includes zoom support where available. Max input ${formatBytes(PRODUCT_INPUT_MAX_BYTES)}; final upload ${PRODUCT_RULE_LABEL}.`
              : `Use Gallery or Camera for each slot. Camera includes zoom support where available. Max input ${formatBytes(PRODUCT_INPUT_MAX_BYTES)}; final upload ${PRODUCT_RULE_LABEL}.`}
          </p>
        </div>

        <form onSubmit={handleUpdate} className="rounded-xl border border-[#D5D9D9] bg-white p-6 shadow-sm">
          {/* IMAGE GRID */}
          <div className={`mb-6 grid gap-3 ${isServiceListing ? "grid-cols-1" : "grid-cols-3"}`}>
            {(isServiceListing ? [1] : PRODUCT_IMAGE_SLOTS).map((slot) => (
              <div
                key={slot}
                className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${slot === 1 ? (previews[1] ? "border-[#db2777] bg-white" : "border-[#db2777] bg-[#fdf2f8]") : (previews[slot] ? "border-slate-300 bg-white" : "border-[#888C8C] bg-[#F7F7F7]")}`}
              >
                <input type="file" ref={fileInputRefs[slot]} hidden accept={PRODUCT_ACCEPT} onChange={(e) => handleFileSelect(e, slot)} />
                
                {processingSlots[slot] ? (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
                    <FaCircleNotch className="animate-spin text-2xl text-[#db2777]" />
                    <span className="mt-2 text-[0.6rem] font-black uppercase text-[#db2777]">Processing</span>
                  </div>
                ) : null}

                {previews[slot] ? (
                  <>
                    <img src={previews[slot]} className="absolute inset-0 h-full w-full object-contain bg-white z-10" alt={`Slot ${slot}`} />
                    <div className="absolute left-1 top-1 z-20 flex items-center gap-1">
                      <button type="button" onClick={() => fileInputRefs[slot].current?.click()} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0F172A] shadow-md transition hover:scale-110" title="Pick from files"><FaImage size={11} /></button>
                      <button type="button" onClick={() => setCameraSlot(slot)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F172A] text-white shadow-md transition hover:scale-110 hover:bg-[#1E293B]" title="Capture from camera"><FaCamera size={11} /></button>
                      <button type="button" onClick={() => openStudioForSlot(slot)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#db2777] text-white shadow-md transition hover:scale-110 hover:bg-[#be185d]" title="Edit in CT Studio"><FaWandMagicSparkles size={11} /></button>
                    </div>
                    <button type="button" onClick={(e) => removeImage(e, slot)} className="absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition hover:scale-110 hover:bg-red-700">
                      <FaTrashCan size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    {slot === 1 ? <FaImage className="mb-2 text-3xl text-[#db2777]" /> : <FaCamera className="mb-2 text-3xl text-[#888C8C]" />}
                    <span className={`text-center text-[0.7rem] font-bold leading-tight ${slot === 1 ? "text-[#db2777]" : "text-[#565959]"}`}>
                      {isServiceListing
                        ? slot === 1
                          ? "Service Photo\n(Required)"
                          : slot === 2
                            ? "Work Sample\n(Optional)"
                            : "Flyer/Proof\n(Optional)"
                        : slot === 1
                          ? "Main Image\n(Required)"
                          : slot === 2
                            ? "Extra Angle\n(Optional)"
                            : "Label/Box\n(Optional)"}
                    </span>
                    <div className="mt-2 flex items-center gap-1">
                      <button type="button" onClick={() => fileInputRefs[slot].current?.click()} className="rounded-md border border-[#334155] bg-white px-2 py-1 text-[0.58rem] font-extrabold uppercase tracking-wide text-[#0F172A] transition hover:bg-slate-50">File</button>
                      <button type="button" onClick={() => setCameraSlot(slot)} className="rounded-md border border-[#334155] bg-[#0F172A] px-2 py-1 text-[0.58rem] font-extrabold uppercase tracking-wide text-white transition hover:bg-[#1E293B]">Camera</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* LIVE PREVIEW */}
          <div className="mb-6 flex flex-col items-center rounded-lg border border-[#D5D9D9] bg-[#F3F4F6] p-5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
            <h4 className="mb-3 text-[0.95rem] font-extrabold"><FaRegEye className="inline mr-1" /> {editorCopy.previewTitle}</h4>
            <div className="w-[140px] overflow-hidden rounded-md border border-[#E5E7EB] bg-white p-2 shadow-md">
              <div className="relative mb-1 flex aspect-square items-center justify-center overflow-hidden rounded border border-dashed border-[#D5D9D9] bg-[#F7F7F7]">
                {previews[1] ? <img src={previews[1]} className="h-full w-full object-contain bg-white" alt="Preview" /> : <FaImage className="text-3xl text-[#D5D9D9]" />}
                {isLiveDiscValid && <div className="absolute left-1 top-1 z-10 rounded bg-red-600 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-white">-{form.discountPercent}%</div>}
                {form.condition === "Fairly Used" && <div className="absolute right-1 top-1 z-10 rounded bg-amber-500 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-white">Used</div>}
              </div>
              <div className="truncate text-[0.75rem] font-medium text-[#0F1111]">{form.name || editorCopy.previewName}</div>
              <div className="truncate text-[0.8rem] font-extrabold text-[#db2777]">
                {isLiveDiscValid && livePrice > 0 ? (
                  <><span className="mr-1 text-[0.65rem] font-medium text-[#888C8C] line-through">₦{livePrice.toLocaleString()}</span>₦{liveFinalPrice.toLocaleString()}</>
                ) : (`₦${livePrice ? livePrice.toLocaleString() : "0"}`)}
              </div>
            </div>
          </div>

          {/* CATEGORY (CUSTOM DROPDOWN) */}
          <div className="mb-5">
            <label className="mb-1.5 block text-[0.9rem] font-bold">Category</label>
            <CustomSelect
              value={form.category} onChange={handleCategoryChange} options={categoryOptions} placeholder="Select a Category..."
              className="rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
            />
          </div>

          {/* DYNAMIC FIELDS BLOCK */}
          {categoryGroup === "tech" && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Technical Specifications</div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Brand</label><input type="text" value={dynamicAttrs['Brand'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="Apple" onChange={e => handleAttrChange('Brand', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Model</label><input type="text" value={dynamicAttrs['Model'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="iPhone 14" onChange={e => handleAttrChange('Model', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">RAM</label><input type="text" value={dynamicAttrs['RAM'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="8GB" onChange={e => handleAttrChange('RAM', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Storage</label><input type="text" value={dynamicAttrs['Storage'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="256GB" onChange={e => handleAttrChange('Storage', e.target.value)} /></div>
              </div>
            </div>
          )}
          {categoryGroup === "fashion" && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Apparel Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Brand</label><input type="text" value={dynamicAttrs['Brand'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Brand', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Size</label><input type="text" value={dynamicAttrs['Size'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Size', e.target.value)} /></div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[0.85rem] font-bold">Target Audience (Gender)</label>
                  <CustomSelect value={dynamicAttrs['Gender'] || ""} onChange={(val) => handleAttrChange('Gender', val)} options={[{ value: "Unisex", label: "Unisex" }, { value: "Men", label: "Men" }, { value: "Women", label: "Women" }, { value: "Kids", label: "Kids" }]} placeholder="Select Target..." className="rounded border border-[#888C8C] p-2 text-[0.95rem]" />
                </div>
              </div>
            </div>
          )}
          {categoryGroup === "consumables" && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Product Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Brand/Maker</label><input type="text" value={dynamicAttrs['Brand'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Brand', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Weight/Vol</label><input type="text" value={dynamicAttrs['Weight'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Weight', e.target.value)} /></div>
                <div className="col-span-2"><label className="mb-1 block text-[0.85rem] font-bold text-red-600">Expiry Date *</label><input type="date" value={dynamicAttrs['Expiry Date'] || ''} required className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Expiry Date', e.target.value)} /></div>
              </div>
            </div>
          )}
          {categoryGroup === "property" && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Property Details</div>
              <div className="grid grid-cols-1 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Property Type</label><input type="text" value={dynamicAttrs['Property Type'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="e.g. 2 Bed Flat" onChange={e => handleAttrChange('Property Type', e.target.value)} /></div>
                <div>
                  <label className="mb-1 block text-[0.85rem] font-bold">Payment Cycle</label>
                  <CustomSelect value={dynamicAttrs['Payment Cycle'] || ""} onChange={(val) => handleAttrChange('Payment Cycle', val)} options={[{ value: "Per Year", label: "Per Year" }, { value: "Per Month", label: "Per Month" }, { value: "Per Night", label: "Per Night (Hotels)" }]} placeholder="Select Cycle..." className="rounded border border-[#888C8C] p-2 text-[0.95rem]" />
                </div>
              </div>
            </div>
          )}

          {/* CORE INFO */}
          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-[0.9rem] font-bold">{editorCopy.nameLabel}</label>
              <CharacterCounter value={form.name} limit={PRODUCT_TEXT_LIMITS.name} unit={PRODUCT_TEXT_LIMIT_UNITS.name} />
            </div>
            <input type="text" id="name" value={form.name} onChange={handleInputChange} required className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>

          <div className={`mb-5 grid gap-4 ${isServiceListing ? "grid-cols-1" : "grid-cols-2"}`}>
            <div>
              <label className="mb-1.5 block text-[0.9rem] font-bold">Price (₦)</label>
              <input type="number" id="price" value={form.price} onChange={handleInputChange} required min="0" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none" />
              {isServiceListing && (
                <p className="mt-1.5 text-[0.72rem] font-bold text-slate-500">
                  Starting price for this service. Use 0 if customers should request a quote.
                </p>
              )}
            </div>
            {!isServiceListing && <div>
              <label className="mb-1.5 block text-[0.9rem] font-bold">Stock Count</label>
              <input type="number" id="stock" value={form.stock} onChange={handleInputChange} required min="0" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none" />
            </div>}
          </div>

          {/* CONDITION (CUSTOM DROPDOWN) */}
          {!isServiceListing && <div className="mb-5">
            <label className="mb-1.5 block text-[0.9rem] font-bold">Condition</label>
            <CustomSelect value={form.condition} onChange={handleConditionChange} options={[{ value: "New", label: "New" }, { value: "Fairly Used", label: "Fairly Used" }]} className="rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" />
          </div>}

          {/* DISCOUNT SECTION */}
          {!isServiceListing && form.condition !== "Fairly Used" && (
            <div className="mb-6 rounded-lg border border-[#D5D9D9] bg-[#F7F7F7] p-4 transition-all">
              {activeOffersCount >= MAX_SPECIAL_OFFERS && !form.isDiscount && (
                <div className="mb-4 flex items-start gap-2 rounded bg-red-100 p-3 text-[0.85rem] text-red-800 border border-red-200">
                  <FaLock className="mt-1 shrink-0" />
                  <span><strong>Premium Limit Reached:</strong> You have 2 active Special Offers. Remove the discount from another product to enable it here.</span>
                </div>
              )}
              <div className={`flex items-center justify-between ${activeOffersCount >= MAX_SPECIAL_OFFERS && !form.isDiscount ? 'opacity-50' : ''}`}>
                <div>
                  <div className="font-bold text-[#0F1111]">Special Offer?</div>
                  <div className="text-[0.8rem] text-[#565959]">Apply a 1% to 20% discount</div>
                </div>
                <label className="relative inline-block h-6 w-11 cursor-pointer">
                  <input type="checkbox" id="isDiscount" checked={form.isDiscount} disabled={activeOffersCount >= MAX_SPECIAL_OFFERS && !form.isDiscount} onChange={handleInputChange} className="peer sr-only" />
                  <div className="absolute inset-0 rounded-full bg-[#888C8C] transition peer-checked:bg-[#db2777] peer-disabled:cursor-not-allowed peer-disabled:bg-[#D5D9D9] before:absolute before:bottom-[3px] before:left-[3px] before:h-[18px] before:w-[18px] before:rounded-full before:bg-white before:transition peer-checked:before:translate-x-[20px]"></div>
                </label>
              </div>
              {form.isDiscount && (
                <div className="mt-4 animate-[slideDown_0.3s_ease]">
                  <input type="number" id="discountPercent" value={form.discountPercent} onChange={handleInputChange} placeholder="Enter % (e.g. 10)" min="1" max="20" required className="w-full rounded border border-[#888C8C] p-3 text-[1rem] focus:border-[#db2777] focus:outline-none" />
                </div>
              )}
            </div>
          )}

          {/* DESCRIPTIONS */}
          <div className="mb-6 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-5">
            <div className="mb-4 flex items-center gap-2 border-b border-[#E2E8F0] pb-2 text-[1rem] font-extrabold">
              <FaListUl className="text-[#db2777]" /> {editorCopy.detailsTitle}
            </div>
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-[0.85rem] font-bold">{editorCopy.keyFeaturesLabel}</label>
                <CharacterCounter value={form.key_features} limit={PRODUCT_TEXT_LIMITS.key_features} />
              </div>
              <textarea id="key_features" value={form.key_features} onChange={handleInputChange} maxLength={PRODUCT_TEXT_LIMITS.key_features} rows="2" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none resize-y"></textarea>
            </div>
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-[0.85rem] font-bold">{editorCopy.descLabel} <span className="text-[#db2777]">*</span></label>
                <CharacterCounter value={form.desc} limit={PRODUCT_TEXT_LIMITS.desc} />
              </div>
              <textarea id="desc" value={form.desc} onChange={handleInputChange} maxLength={PRODUCT_TEXT_LIMITS.desc} rows="4" required className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none resize-y"></textarea>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="block text-[0.85rem] font-bold">{editorCopy.boxLabel}</label>
                  <CharacterCounter value={form.box_content} limit={PRODUCT_TEXT_LIMITS.box_content} />
                </div>
                <textarea id="box_content" value={form.box_content} onChange={handleInputChange} maxLength={PRODUCT_TEXT_LIMITS.box_content} rows="2" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none"></textarea>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="block text-[0.85rem] font-bold">{editorCopy.warrantyLabel}</label>
                  <CharacterCounter value={form.warranty} limit={PRODUCT_TEXT_LIMITS.warranty} />
                </div>
                <textarea id="warranty" value={form.warranty} onChange={handleInputChange} maxLength={PRODUCT_TEXT_LIMITS.warranty} rows="2" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none"></textarea>
              </div>
            </div>
          </div>

          <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#db2777] p-4 text-[1.05rem] font-bold text-white shadow-[0_4px_10px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:bg-[#E3E6E6] disabled:text-[#888C8C] disabled:shadow-none">
            {submitting ? <><FaCircleNotch className="animate-spin" /> Processing...</> : <><FaPaperPlane /> {editorCopy.submitLabel}</>}
          </button>

          {/* DANGER ZONE */}
          <div className="mt-10 border-t border-[#D5D9D9] pt-6">
            <h4 className="mb-3 text-[0.95rem] font-extrabold text-[#DC2626]">Danger Zone</h4>
            <button type="button" onClick={deleteProduct} disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#DC2626] bg-white p-3.5 text-[1rem] font-bold text-[#DC2626] transition hover:bg-[#FEF2F2]">
              <FaTrashCan /> Delete Entire Product
            </button>
          </div>
        </form>
      </main>

      {preparingStudio && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-[rgba(15,23,42,0.82)] backdrop-blur-sm">
          <div className="rounded-[24px] bg-white px-6 py-5 text-center shadow-2xl">
            <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-pink-200 border-t-[#db2777]" />
            <div className="text-sm font-extrabold text-slate-900">Preparing editor...</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Optimizing photo for smooth editing.</div>
          </div>
        </div>
      )}

      {/* STUDIO OVERLAY */}
      {studioOpen && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-[rgba(15,23,42,0.95)] backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-[#334155] bg-[#020617] px-5 py-4 text-white">
            <div className="flex items-center gap-2 font-extrabold"><FaWandMagicSparkles className="text-[#db2777]" /> CT Studio Editor</div>
            <button onClick={closeStudio} className="text-xl text-[#94a3b8] hover:text-white"><FaXmark /></button>
          </div>
          
          <div className="flex flex-1 flex-col overflow-y-auto md:flex-row">
            <div className="flex flex-1 items-center justify-center p-4 bg-[repeating-conic-gradient(#0f172a_0%_25%,#1e293b_0%_50%)_50%_/_20px_20px]">
              <Cropper
                ref={cropperRef}
                src={tempImage}
                style={{ height: "100%", width: "100%", filter: `brightness(${brightness}%) contrast(${contrast}%)` }}
                aspectRatio={1}
                viewMode={1}
                dragMode="move"
                background={false}
                autoCropArea={1}
                responsive={true}
                checkOrientation={false}
              />
            </div>
            
            <div className="flex w-full flex-col gap-5 border-t border-[#334155] bg-[#1e293b] p-5 md:w-[340px] md:border-l md:border-t-0">
              
              <div>
                <div className="mb-3 border-b border-[#334155] pb-2 text-[0.8rem] font-extrabold uppercase tracking-wide text-[#94a3b8]">Smart Sizing</div>
                <button onClick={applyWhiteBorders} type="button" disabled={isFitting} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#db2777] bg-transparent p-3 font-bold text-[#db2777] transition hover:bg-[rgba(219,39,119,0.1)]">
                  {isFitting ? <FaCircleNotch className="animate-spin" /> : <FaExpand />} Fit Entire Image (Add Borders)
                </button>
                <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[#94a3b8]">Prevents edges of tall/wide photos from being cut off.</p>
              </div>

              <div>
                <div className="mb-3 border-b border-[#334155] pb-2 text-[0.8rem] font-extrabold uppercase tracking-wide text-[#94a3b8]">Lighting Fixes</div>
                <div className="mb-3 flex flex-col gap-1.5 text-white">
                  <div className="flex justify-between text-[0.85rem] font-semibold"><span>Brightness</span> <span>{brightness}%</span></div>
                  <input type="range" min="50" max="150" value={brightness} onChange={e => setBrightness(e.target.value)} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#334155] accent-[#db2777]" />
                </div>
                <div className="flex flex-col gap-1.5 text-white">
                  <div className="flex justify-between text-[0.85rem] font-semibold"><span>Contrast</span> <span>{contrast}%</span></div>
                  <input type="range" min="50" max="150" value={contrast} onChange={e => setContrast(e.target.value)} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#334155] accent-[#db2777]" />
                </div>
              </div>
              
              <div className="mt-auto flex justify-end gap-3 border-t border-[#334155] pt-4">
                <button onClick={closeStudio} type="button" className="rounded-lg border border-[#334155] px-5 py-2.5 font-semibold text-[#94a3b8] hover:bg-[#334155] hover:text-white">Cancel</button>
                <button onClick={applyCrop} type="button" className="flex items-center gap-2 rounded-lg bg-[#10b981] px-6 py-2.5 font-extrabold text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)] hover:bg-[#059669]"><FaMicrochip /> Process & Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CameraCaptureModal
        open={cameraSlot !== null}
        title={editorCopy.cameraTitle}
        profile={PRODUCT_PROFILE}
        onClose={() => setCameraSlot(null)}
        onCapture={handleCameraCapture}
      />

    </div>
  );
}
