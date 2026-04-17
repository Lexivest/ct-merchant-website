import React, { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";
import {
  FaArrowLeft,
  FaBoxesPacking,
  FaCamera,
  FaCheck,
  FaChevronDown,
  FaCircleNotch,
  FaExpand,
  FaImage,
  FaListUl,
  FaLock,
  FaMicrochip,
  FaRegEye,
  FaTrashCan,
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
import {
  loadProductCategoryRows,
  resolveProductCategoryGroup,
  toProductCategoryOptions,
} from "../../lib/productCategories";
import {
  autoProcessImage,
  canvasToBlobWithMaxBytes,
  optimizeImageForEditor,
  padImageToAspectDataUrl,
} from "../../lib/imagePipeline";

const PRODUCT_RULE = UPLOAD_RULES.products;
const PRODUCT_PROFILE = IMAGE_PROFILES.product;
const PRODUCT_BUCKET = PRODUCT_RULE.bucket;
const PRODUCT_MAX_BYTES = PRODUCT_RULE.maxBytes;
const PRODUCT_INPUT_MAX_BYTES = PRODUCT_PROFILE.maxInputBytes;
const PRODUCT_ACCEPT = getAcceptValue(PRODUCT_RULE, "image/*");
const PRODUCT_RULE_LABEL = getRuleLabel(PRODUCT_RULE);
const MAX_PRODUCTS_LIMIT = 30;
const MAX_SPECIAL_OFFERS = 2;

// --- PROFESSIONAL SHIMMER COMPONENT ---
function AddProductShimmer() {
  return (
    <PageLoadingScreen
      title="Opening add product"
      message="Please wait while we prepare the product editor."
    />
  );
}

// --- CUSTOM DROPDOWN COMPONENT (Bypasses Mobile OS Native Fullscreen Menus) ---
function CustomSelect({ value, onChange, options, placeholder, className }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex cursor-pointer items-center justify-between bg-white transition-all ${className} ${
          isOpen ? "border-[#db2777] ring-2 ring-[#db2777]/20" : ""
        }`}
      >
        <span className={value ? "text-[#0F1111]" : "text-[#888C8C]"}>
          {value || placeholder}
        </span>
        <FaChevronDown
          className={`text-xs text-[#888C8C] transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#db2777]" : ""
          }`}
        />
      </div>
      {isOpen && (
        <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#D5D9D9] bg-white py-1 shadow-xl animate-[slideDown_0.2s_ease]">
          {options.map((opt) => (
            <li
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`cursor-pointer px-4 py-3 text-[0.95rem] transition-colors hover:bg-pink-50 ${
                value === opt.value
                  ? "bg-pink-50 font-extrabold text-[#db2777]"
                  : "font-medium text-[#0F1111]"
              }`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


export default function AddProduct() {
  const navigate = useNavigate();
  const location = useLocation();
  usePreventPullToRefresh();
  const { notify } = useGlobalFeedback();
  const [searchParams] = useSearchParams();
  const shopId = searchParams.get("shop_id");
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-add-product" &&
    (!shopId || String(location.state.prefetchedData.shopId) === String(shopId))
      ? location.state.prefetchedData
      : null

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(() => !prefetchedData);
  const [error, setError] = useState(null);
  const [limitReached, setLimitReached] = useState(() => prefetchedData?.limitReached || false);
  const [activeOffersCount, setActiveOffersCount] = useState(() => prefetchedData?.activeOffersCount || 0);
  const [submitting, setSubmitting] = useState(false);
  const [categoryRows, setCategoryRows] = useState(() => prefetchedData?.categoryRows || []);

  // Form State
  const [form, setForm] = useState({
    name: "",
    price: "",
    stock: "1",
    condition: "New",
    category: "",
    desc: "",
    key_features: "",
    box_content: "",
    warranty: "",
    isDiscount: false,
    discountPercent: "",
  });

  const [dynamicAttrs, setDynamicAttrs] = useState({});

  // Image State
  const [blobs, setBlobs] = useState({ 1: null, 2: null, 3: null });
  const [previews, setPreviews] = useState({ 1: "", 2: "", 3: "" });
  const [processingSlots, setProcessingSlots] = useState({ 1: false, 2: false, 3: false });

  // Studio State
  const [studioOpen, setStudioOpen] = useState(false);
  const [cameraSlot, setCameraSlot] = useState(null);
  const cameraSlotRef = useRef(null);
  const [activeSlot, setActiveSlot] = useState(null);
  const [tempImage, setTempImage] = useState("");
  const [tempSize, setTempSize] = useState(0);
  const [preparingStudio, setPreparingStudio] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isFitting, setIsFitting] = useState(false);
  const cropperRef = useRef(null);
  const fileInputRefs = {
    1: useRef(null),
    2: useRef(null),
    3: useRef(null),
  };

  useEffect(() => {
    cameraSlotRef.current = cameraSlot;
  }, [cameraSlot]);

  // Initialization & Security Checks
  useEffect(() => {
    if (prefetchedData) {
      setLimitReached(prefetchedData.limitReached || false);
      setActiveOffersCount(prefetchedData.activeOffersCount || 0);
      setCategoryRows(prefetchedData.categoryRows || []);
      setError(null);
      setLoading(false);
      return;
    }

    async function init() {
      if (!user) return;
      if (!shopId) {
        navigate("/vendor-panel", { replace: true });
        return;
      }
      if (isOffline) {
        setError("Network offline. Please connect to the internet to add products.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", user.id).maybeSingle();
        if (profile?.is_suspended) throw new Error("Account restricted.");

        const { data: shop } = await supabase.from("shops").select("id, is_open").eq("id", shopId).eq("owner_id", user.id).maybeSingle();
        if (!shop) throw new Error("Shop not found or access denied.");
        if (shop.is_open === false) throw new Error("Shop is suspended.");

        // Check Limits
        const [prodRes, discountRes, loadedCategoryRows] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
          supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId).not("discount_price", "is", null),
          loadProductCategoryRows(supabase),
        ]);

        if (prodRes.count >= MAX_PRODUCTS_LIMIT) setLimitReached(true);
        setActiveOffersCount(discountRes.count || 0);
        setCategoryRows(loadedCategoryRows);

      } catch (err) {
        setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."));
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading) init();
  }, [user, authLoading, shopId, isOffline, navigate, prefetchedData]);


  // --- HANDLERS ---
  const handleInputChange = (e) => {
    const { id, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [id]: type === "checkbox" ? checked : value }));
  };

  const handleAttrChange = (key, value) => {
    setDynamicAttrs((prev) => ({ ...prev, [key]: value }));
  };

  const handleCategoryChange = (val) => {
    setForm((prev) => ({ ...prev, category: val }));
    setDynamicAttrs({}); 
  };

  const handleConditionChange = (val) => {
    setForm((prev) => ({ ...prev, condition: val }));
  };

  // --- BACKGROUND PROCESSING PIPELINE ---
  const processImageInSlot = async (file, slot) => {
    if (!file || !slot) return;

    if (!file.type.startsWith("image/")) {
      notify({ type: "error", title: "Invalid image", message: "Please upload a valid image file." });
      return;
    }

    if (file.size > PRODUCT_INPUT_MAX_BYTES) {
      notify({
        type: "error",
        title: "Image too large",
        message: `Maximum input size for products is ${formatBytes(PRODUCT_INPUT_MAX_BYTES)}.`,
      });
      return;
    }

    setProcessingSlots((prev) => ({ ...prev, [slot]: true }));
    try {
      const result = await autoProcessImage(file, {
        aspectRatio: PRODUCT_PROFILE.aspectRatio,
        targetWidth: PRODUCT_PROFILE.targetWidth,
        targetHeight: PRODUCT_PROFILE.targetHeight,
        maxBytes: PRODUCT_MAX_BYTES,
        qualityStart: PRODUCT_PROFILE.qualityStart,
        qualityFloor: PRODUCT_PROFILE.qualityFloor,
        qualityStep: PRODUCT_PROFILE.qualityStep,
      });

      if (previews[slot] && previews[slot].startsWith("blob:")) {
        URL.revokeObjectURL(previews[slot]);
      }

      setBlobs((prev) => ({ ...prev, [slot]: result.blob }));
      setPreviews((prev) => ({ ...prev, [slot]: result.previewUrl }));
    } catch (err) {
      notify({
        type: "error",
        title: "Processing failed",
        message: getFriendlyErrorMessage(err, "Could not process this image. Please try another one."),
      });
    } finally {
      setProcessingSlots((prev) => ({ ...prev, [slot]: false }));
    }
  };

  const handleFileSelect = async (e, slot) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // Reset
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

  // --- STUDIO LOGIC (NOW OPTIONAL) ---
  const openStudioForSlot = async (slot) => {
    const existingBlob = blobs[slot];
    if (!existingBlob) return;

    setPreparingStudio(true);
    try {
      const preparedImage = await optimizeImageForEditor(existingBlob, {
        maxDimension: 1800,
        mimeType: "image/jpeg",
        quality: 0.9,
      });

      if (tempImage && tempImage.startsWith("blob:")) {
        URL.revokeObjectURL(tempImage);
      }

      setActiveSlot(slot);
      setTempSize(preparedImage.blob.size || existingBlob.size);
      setTempImage(preparedImage.src);
      setBrightness(100);
      setContrast(100);
      setStudioOpen(true);
    } catch (err) {
      notify({ type: "error", title: "Editor failed", message: "Could not open the image editor." });
    } finally {
      setPreparingStudio(false);
    }
  };

  const closeStudio = () => {
    if (tempImage && tempImage.startsWith("blob:")) {
      URL.revokeObjectURL(tempImage);
    }
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
      if (cropperRef.current?.cropper) {
        cropperRef.current.cropper.replace(fitted);
      }
    } catch (error) {
      notify({ type: "error", title: "Auto-fit failed", message: getFriendlyErrorMessage(error, "Could not auto-fit the image.") });
    } finally {
      setIsFitting(false);
    }
  };

  const applyCrop = async () => {
    if (!cropperRef.current?.cropper) return;
    const cropper = cropperRef.current.cropper;

    const croppedCanvas = cropper.getCroppedCanvas({
      width: PRODUCT_PROFILE.targetWidth,
      height: PRODUCT_PROFILE.targetHeight,
      fillColor: "#FFFFFF",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = PRODUCT_PROFILE.targetWidth;
    finalCanvas.height = PRODUCT_PROFILE.targetHeight;
    const ctx = finalCanvas.getContext("2d");
    if (!ctx) {
      notify({ type: "error", title: "Editor unavailable", message: "Could not initialize the image editor canvas." });
      return;
    }

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
    ctx.fillText("CTMerchant", PRODUCT_PROFILE.targetWidth - 20, PRODUCT_PROFILE.targetHeight - 20);

    try {
      const blob = await canvasToBlobWithMaxBytes(finalCanvas, {
        maxBytes: PRODUCT_MAX_BYTES,
        mimeType: PRODUCT_PROFILE.outputMimeType,
        qualityStart: PRODUCT_PROFILE.qualityStart,
        qualityFloor: PRODUCT_PROFILE.qualityFloor,
        qualityStep: PRODUCT_PROFILE.qualityStep,
      });

      if (!blob) throw new Error("Compression failed.");

      if (previews[activeSlot] && previews[activeSlot].startsWith("blob:")) {
        URL.revokeObjectURL(previews[activeSlot]);
      }

      setBlobs((prev) => ({ ...prev, [activeSlot]: blob }));
      setPreviews((prev) => ({ ...prev, [activeSlot]: URL.createObjectURL(blob) }));

      closeStudio();
    } catch (err) {
      notify({
        type: "error",
        title: "Crop failed",
        message: getFriendlyErrorMessage(err, "Could not save cropped image."),
      });
    }
  };

  const removeImage = (e, slot) => {
    e.stopPropagation();
    if (previews[slot] && previews[slot].startsWith("blob:")) {
      URL.revokeObjectURL(previews[slot]);
    }
    setBlobs((prev) => ({ ...prev, [slot]: null }));
    setPreviews((prev) => ({ ...prev, [slot]: "" }));
    setSavings((prev) => ({ ...prev, [slot]: "" }));
  };

  // --- SUBMIT ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (isOffline) {
      notify({ type: "error", title: "Network unavailable", message: "You must be online to upload a product." });
      return;
    }
    if (!form.category) {
      notify({ type: "error", title: "Category required", message: "Please select a category before continuing." });
      return;
    }
    if (!blobs[1]) {
      notify({ type: "error", title: "Main image required", message: "The main image is required before you can submit this product." });
      return;
    }
    const oversizedSlot = [1, 2, 3].find((slot) => blobs[slot] && blobs[slot].size > PRODUCT_MAX_BYTES);
    if (oversizedSlot) {
      notify({
        type: "error",
        title: "Image too large",
        message: `Image ${oversizedSlot} exceeds ${formatBytes(PRODUCT_MAX_BYTES)} after processing. Please re-crop it.`,
      });
      return;
    }
    if (form.isDiscount && activeOffersCount >= MAX_SPECIAL_OFFERS) {
      notify({
        type: "error",
        title: "Offer limit reached",
        message: "You already have the maximum of 2 special offers active.",
      });
      return;
    }

    try {
      setSubmitting(true);

      const priceVal = parseFloat(form.price);
      let discountPrice = null;
      if (form.isDiscount && form.condition !== "Fairly Used") {
        const perc = parseFloat(form.discountPercent);
        if (!perc || perc <= 0 || perc > 20) throw new Error("Discount must be between 1% and 20%");
        discountPrice = priceVal - priceVal * (perc / 100);
      }

      const finalAttrs = { ...dynamicAttrs };
      if (form.key_features.trim()) finalAttrs["Key Features"] = form.key_features.trim();
      if (form.box_content.trim()) finalAttrs["What's in the Box"] = form.box_content.trim();
      if (form.warranty.trim()) finalAttrs["Warranty"] = form.warranty.trim();

      const uploadPromises = [1, 2, 3].map(async (idx) => {
        if (!blobs[idx]) return null;
        const fName = `${user.id}_${Date.now()}_img${idx}.jpg`;
        try {
          const { error: upErr } = await supabase.storage.from(PRODUCT_BUCKET).upload(fName, blobs[idx], {
            contentType: "image/jpeg",
            upsert: false,
            cacheControl: "31536000",
          });
          if (upErr) throw upErr;
          return supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(fName).data.publicUrl;
        } catch (uploadErr) {
          console.error(`Image ${idx} upload failed:`, uploadErr);
          throw new Error(`Failed to upload image ${idx}. Please check your connection.`);
        }
      });

      const [url1, url2, url3] = await Promise.all(uploadPromises);

      let lastInsertError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { error: insertError } = await supabase.from("products").insert({
          shop_id: parseInt(shopId),
          name: form.name.trim(),
          description: form.desc.trim(),
          price: priceVal,
          discount_price: discountPrice,
          condition: form.condition,
          category: form.category,
          image_url: url1,
          image_url_2: url2,
          image_url_3: url3,
          stock_count: parseInt(form.stock),
          attributes: finalAttrs,
          is_available: parseInt(form.stock) > 0,
        });

        if (!insertError) {
          lastInsertError = null;
          break;
        }
        lastInsertError = insertError;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }

      if (lastInsertError) throw lastInsertError;

      notify({
        type: "success",
        title: "Product Added",
        message: "Your product has been successfully added to the marketplace. You can now add another item.",
      });

      // Reset form but keep category for convenience
      setForm({
        name: "",
        price: "",
        stock: "1",
        condition: "New",
        category: form.category,
        desc: "",
        key_features: "",
        box_content: "",
        warranty: "",
        isDiscount: false,
        discountPercent: "",
      });
      setDynamicAttrs({});
      setBlobs({ 1: null, 2: null, 3: null });
      setPreviews({ 1: "", 2: "", 3: "" });
      
      // Reset scroll for next entry
      window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (err) {
      notify({ type: "error", title: "Upload failed", message: getFriendlyErrorMessage(err, "Upload failed.") });
    } finally {
      setSubmitting(false);
    }
  };

  const livePrice = parseFloat(form.price) || 0;
  const liveDiscPerc = parseFloat(form.discountPercent) || 0;
  const isLiveDiscValid = form.isDiscount && form.condition !== "Fairly Used" && liveDiscPerc > 0 && liveDiscPerc <= 20;
  const liveFinalPrice = isLiveDiscValid ? livePrice - livePrice * (liveDiscPerc / 100) : livePrice;
  const categoryOptions = useMemo(() => toProductCategoryOptions(categoryRows), [categoryRows]);
  const categoryGroup = useMemo(
    () => resolveProductCategoryGroup(form.category, categoryRows),
    [form.category, categoryRows],
  );


  if (authLoading || loading) {
    return <AddProductShimmer />;
  }

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

  if (limitReached) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="bg-[#131921] px-4 py-3 text-white"><button onClick={() => navigate("/vendor-panel")}><FaArrowLeft /></button></header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-amber-200 bg-white p-8 shadow-sm max-w-md">
            <FaBoxesPacking className="mx-auto mb-4 text-5xl text-amber-500" />
            <h2 className="mb-2 text-xl font-extrabold">Upload Limit Reached</h2>
            <p className="mb-6 text-sm text-slate-600">You have reached the maximum allowed limit of 30 active products. Please delete an older item first.</p>
            <button onClick={() => window.location.reload()} className="rounded-lg border border-[#D5D9D9] px-6 py-2 font-bold hover:bg-slate-50">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-screen flex-col bg-[#F3F4F6] pb-12 text-[#0F1111] ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <header className="sticky top-0 z-40 flex items-center gap-4 bg-[#131921] px-4 py-3 text-white shadow-sm">
        <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]"><FaArrowLeft /></button>
        <div className="text-[1.15rem] font-bold">Add Product</div>
      </header>

      <main className="mx-auto w-full max-w-[680px] p-5">
        
        <div className="mb-6 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <h4 className="mb-2 flex items-center gap-2 text-[0.95rem] font-extrabold"><FaWandMagicSparkles className="text-[#db2777]" /> Powered by CT Studio</h4>
          <p className="text-[0.85rem] text-[#475569] leading-relaxed">
            {`Use Gallery or Camera for each slot. Camera includes zoom support where available. Max input ${formatBytes(PRODUCT_INPUT_MAX_BYTES)}; final upload ${PRODUCT_RULE_LABEL}.`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-[#D5D9D9] bg-white p-6 shadow-sm">
          
          {/* IMAGE GRID */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            {[1, 2, 3].map((slot) => (
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
                      <button
                        type="button"
                        onClick={() => fileInputRefs[slot].current?.click()}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0F172A] shadow-md transition hover:scale-110"
                        title="Pick from files"
                      >
                        <FaImage size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCameraSlot(slot)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F172A] text-white shadow-md transition hover:scale-110 hover:bg-[#1E293B]"
                        title="Capture from camera"
                      >
                        <FaCamera size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openStudioForSlot(slot)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-[#db2777] text-white shadow-md transition hover:scale-110 hover:bg-[#be185d]"
                        title="Edit in CT Studio"
                      >
                        <FaWandMagicSparkles size={11} />
                      </button>
                    </div>
                    <button type="button" onClick={(e) => removeImage(e, slot)} className="absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition hover:scale-110 hover:bg-red-700">
                      <FaTrashCan size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    {slot === 1 ? <FaImage className="mb-2 text-3xl text-[#db2777]" /> : <FaCamera className="mb-2 text-3xl text-[#888C8C]" />}
                    <span className={`text-center text-[0.7rem] font-bold leading-tight ${slot === 1 ? "text-[#db2777]" : "text-[#565959]"}`}>
                      {slot === 1 ? "Main Image\n(Required)" : slot === 2 ? "Extra Angle\n(Optional)" : "Label/Box\n(Optional)"}
                    </span>
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => fileInputRefs[slot].current?.click()}
                        className="rounded-md border border-[#334155] bg-white px-2 py-1 text-[0.58rem] font-extrabold uppercase tracking-wide text-[#0F172A] transition hover:bg-slate-50"
                      >
                        File
                      </button>
                      <button
                        type="button"
                        onClick={() => setCameraSlot(slot)}
                        className="rounded-md border border-[#334155] bg-[#0F172A] px-2 py-1 text-[0.58rem] font-extrabold uppercase tracking-wide text-white transition hover:bg-[#1E293B]"
                      >
                        Camera
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* LIVE PREVIEW */}
          <div className="mb-6 flex flex-col items-center rounded-lg border border-[#D5D9D9] bg-[#F3F4F6] p-5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
            <h4 className="mb-3 text-[0.95rem] font-extrabold"><FaRegEye className="inline mr-1" /> Marketplace Preview</h4>
            <div className="w-[140px] overflow-hidden rounded-md border border-[#E5E7EB] bg-white p-2 shadow-md">
              <div className="relative mb-1 flex aspect-square items-center justify-center overflow-hidden rounded border border-dashed border-[#D5D9D9] bg-[#F7F7F7]">
                {previews[1] ? (
                  <img src={previews[1]} className="h-full w-full object-contain bg-white" alt="Preview" />
                ) : (
                  <FaImage className="text-3xl text-[#D5D9D9]" />
                )}
                {isLiveDiscValid && (
                  <div className="absolute left-1 top-1 z-10 rounded bg-red-600 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-white">
                    -{form.discountPercent}%
                  </div>
                )}
                {form.condition === "Fairly Used" && (
                  <div className="absolute right-1 top-1 z-10 rounded bg-amber-500 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-white">
                    Used
                  </div>
                )}
              </div>
              <div className="truncate text-[0.75rem] font-medium text-[#0F1111]">{form.name || "Product Title"}</div>
              <div className="truncate text-[0.8rem] font-extrabold text-[#db2777]">
                {isLiveDiscValid && livePrice > 0 ? (
                  <>
                    <span className="mr-1 text-[0.65rem] font-medium text-[#888C8C] line-through">₦{livePrice.toLocaleString()}</span>
                    ₦{liveFinalPrice.toLocaleString()}
                  </>
                ) : (
                  `₦${livePrice ? livePrice.toLocaleString() : "0"}`
                )}
              </div>
            </div>
          </div>

          {/* CATEGORY (CUSTOM DROPDOWN) */}
          <div className="mb-5">
            <label className="mb-1.5 block text-[0.9rem] font-bold">Category</label>
            <CustomSelect
              value={form.category}
              onChange={handleCategoryChange}
              options={categoryOptions}
              placeholder="Select a Category..."
              className="rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
            />
          </div>

          {/* DYNAMIC FIELDS BLOCK */}
          {categoryGroup === "tech" && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Technical Specifications</div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Brand</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="Apple" onChange={e => handleAttrChange('Brand', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Model</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="iPhone 14" onChange={e => handleAttrChange('Model', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">RAM</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="8GB" onChange={e => handleAttrChange('RAM', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Storage</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="256GB" onChange={e => handleAttrChange('Storage', e.target.value)} /></div>
              </div>
            </div>
          )}
          {categoryGroup === "fashion" && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Apparel Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Brand</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Brand', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Size</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Size', e.target.value)} /></div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[0.85rem] font-bold">Target Audience (Gender)</label>
                  <CustomSelect
                    value={dynamicAttrs['Gender'] || ""}
                    onChange={(val) => handleAttrChange('Gender', val)}
                    options={[
                      { value: "Unisex", label: "Unisex" },
                      { value: "Men", label: "Men" },
                      { value: "Women", label: "Women" },
                      { value: "Kids", label: "Kids" }
                    ]}
                    placeholder="Select Target..."
                    className="rounded border border-[#888C8C] p-2 text-[0.95rem]"
                  />
                </div>
              </div>
            </div>
          )}
          {categoryGroup === "consumables" && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Product Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Brand/Maker</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Brand', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Weight/Vol</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Weight', e.target.value)} /></div>
                <div className="col-span-2"><label className="mb-1 block text-[0.85rem] font-bold text-red-600">Expiry Date *</label><input type="date" required className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Expiry Date', e.target.value)} /></div>
              </div>
            </div>
          )}
          {categoryGroup === "property" && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Property Details</div>
              <div className="grid grid-cols-1 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Property Type</label><input type="text" className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="e.g. 2 Bed Flat" onChange={e => handleAttrChange('Property Type', e.target.value)} /></div>
                <div>
                  <label className="mb-1 block text-[0.85rem] font-bold">Payment Cycle</label>
                  <CustomSelect
                    value={dynamicAttrs['Payment Cycle'] || ""}
                    onChange={(val) => handleAttrChange('Payment Cycle', val)}
                    options={[
                      { value: "Per Year", label: "Per Year" },
                      { value: "Per Month", label: "Per Month" },
                      { value: "Per Night", label: "Per Night (Hotels)" }
                    ]}
                    placeholder="Select Cycle..."
                    className="rounded border border-[#888C8C] p-2 text-[0.95rem]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* CORE INFO */}
          <div className="mb-5">
            <label className="mb-1.5 block text-[0.9rem] font-bold">Product Name / Title</label>
            <input type="text" id="name" value={form.name} onChange={handleInputChange} required className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[0.9rem] font-bold">Price (₦)</label>
              <input type="number" id="price" value={form.price} onChange={handleInputChange} required min="0" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.9rem] font-bold">Stock Count</label>
              <input type="number" id="stock" value={form.stock} onChange={handleInputChange} required min="1" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none" />
            </div>
          </div>

          {/* CONDITION (CUSTOM DROPDOWN) */}
          <div className="mb-5">
            <label className="mb-1.5 block text-[0.9rem] font-bold">Condition</label>
            <CustomSelect
              value={form.condition}
              onChange={handleConditionChange}
              options={[
                { value: "New", label: "New" },
                { value: "Fairly Used", label: "Fairly Used" }
              ]}
              className="rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
            />
          </div>

          {/* DISCOUNT SECTION */}
          {form.condition !== "Fairly Used" && (
            <div className="mb-6 rounded-lg border border-[#D5D9D9] bg-[#F7F7F7] p-4 transition-all">
              {activeOffersCount >= MAX_SPECIAL_OFFERS}
              <div className={`flex items-center justify-between ${activeOffersCount >= MAX_SPECIAL_OFFERS ? 'opacity-50' : ''}`}>
                <div>
                  <div className="font-bold text-[#0F1111]">Special Offer?</div>
                  <div className="text-[0.8rem] text-[#565959]">Apply a 1% to 20% discount</div>
                </div>
                <label className="relative inline-block h-6 w-11 cursor-pointer">
                  <input type="checkbox" id="isDiscount" checked={form.isDiscount} disabled={activeOffersCount >= MAX_SPECIAL_OFFERS} onChange={handleInputChange} className="peer sr-only" />
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
              <FaListUl className="text-[#db2777]" /> Product Presentation Details
            </div>
            
            <div className="mb-4">
              <label className="mb-1.5 block text-[0.85rem] font-bold">Key Features</label>
              <textarea id="key_features" value={form.key_features} onChange={handleInputChange} rows="2" placeholder="e.g. 5G Network, 120Hz Display" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none resize-y"></textarea>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-[0.85rem] font-bold">Full Description <span className="text-[#db2777]">*</span></label>
              <textarea id="desc" value={form.desc} onChange={handleInputChange} rows="4" required placeholder="Enter full detailed product description..." className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none resize-y"></textarea>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1.5 block text-[0.85rem] font-bold">What's in the Box</label><textarea id="box_content" value={form.box_content} onChange={handleInputChange} rows="2" placeholder="1x Phone, Charger" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none"></textarea></div>
              <div><label className="mb-1.5 block text-[0.85rem] font-bold">Warranty</label><textarea id="warranty" value={form.warranty} onChange={handleInputChange} rows="2" placeholder="1 Year Mfg Warranty" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none"></textarea></div>
            </div>
          </div>

          <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#db2777] p-4 text-[1.05rem] font-bold text-white shadow-[0_4px_10px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:bg-[#E3E6E6] disabled:text-[#888C8C] disabled:shadow-none">
            {submitting ? <><FaCircleNotch className="animate-spin" /> Processing...</> : "Upload to Marketplace"}
          </button>
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
            <div className="flex items-center gap-2 font-extrabold"><FaWandMagicSparkles className="text-[#db2777]" /> CT Studio</div>
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
              <div className="rounded-lg border border-[#10b981]/20 bg-[#10b981]/10 p-3 text-center text-[0.85rem] font-semibold text-[#10b981]">
                <FaExpand className="inline mr-1" /> Drag and zoom the image to fill the square completely.
              </div>

              <div>
                <div className="mb-3 border-b border-[#334155] pb-2 text-[0.8rem] font-extrabold uppercase tracking-wide text-[#94a3b8]">Framing Mode</div>
                <button onClick={applyWhiteBorders} type="button" disabled={isFitting} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#db2777] bg-transparent p-3 font-bold text-[#db2777] transition hover:bg-[rgba(219,39,119,0.1)]">
                  {isFitting ? <FaCircleNotch className="animate-spin" /> : <FaExpand />} Auto Fit (Keep All Edges)
                </button>
                <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[#94a3b8]">Adds white padding so no part of the product image is cut off in marketplace slots.</p>
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
                <button onClick={applyCrop} type="button" className="flex items-center gap-2 rounded-lg bg-[#10b981] px-6 py-2.5 font-extrabold text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)] hover:bg-[#059669]"><FaMicrochip /> Crop & Process</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CameraCaptureModal
        open={cameraSlot !== null}
        title="Capture Product Photo"
        profile={PRODUCT_PROFILE}
        onClose={() => setCameraSlot(null)}
        onCapture={handleCameraCapture}
      />
    </div>
  );
}
