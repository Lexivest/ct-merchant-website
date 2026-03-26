import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";
import {
  FaArrowLeft,
  FaCamera,
  FaCheck,
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
import { ShimmerBlock } from "../../components/common/Shimmers";
import CameraCaptureModal from "../../components/common/CameraCaptureModal";
import { UPLOAD_RULES, formatBytes, getAcceptValue, getRuleLabel } from "../../lib/uploadRules";
import { IMAGE_PROFILES } from "../../lib/imageProfiles";
import {
  canvasToBlobWithMaxBytes,
  fileToDataUrl,
  padImageToAspectDataUrl,
} from "../../lib/imagePipeline";

const PRODUCT_RULE = UPLOAD_RULES.products;
const PRODUCT_PROFILE = IMAGE_PROFILES.product;
const PRODUCT_BUCKET = PRODUCT_RULE.bucket;
const PRODUCT_MAX_BYTES = PRODUCT_RULE.maxBytes;
const PRODUCT_INPUT_MAX_BYTES = PRODUCT_PROFILE.maxInputBytes;
const PRODUCT_ACCEPT = getAcceptValue(PRODUCT_RULE, "image/*");
const PRODUCT_RULE_LABEL = getRuleLabel(PRODUCT_RULE);
const MAX_SPECIAL_OFFERS = 2;

const techCats = ["Mobile Phones & Accessories", "Computers & IT Services", "Electronics & Appliances"];
const fashionCats = ["Fashion & Apparel"];
const consumablesCats = ["Groceries & Supermarkets", "Beauty & Personal Care", "Pharmacies & Health Shops", "Food & Drinks", "Agriculture & Agro-Allied"];
const propertyCats = ["Real Estate & Properties", "Hotels & Accommodations"];

// --- SHIMMER COMPONENT ---
function EditProductShimmer() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111] pb-12">
      <header className="sticky top-0 z-40 flex items-center gap-4 bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="text-xl opacity-50"><FaArrowLeft /></div>
        <div className="text-[1.15rem] font-bold opacity-50">Edit Product</div>
      </header>
      <main className="mx-auto w-full max-w-[680px] p-5">
        <div className="mb-6 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <ShimmerBlock className="mb-2 h-5 w-48 rounded" />
          <ShimmerBlock className="h-4 w-full rounded" />
        </div>
        <div className="rounded-xl border border-[#D5D9D9] bg-white p-6 shadow-sm">
          <div className="mb-6 grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <ShimmerBlock key={i} className="aspect-square w-full rounded-lg" />)}
          </div>
          <div className="mb-6 flex flex-col items-center rounded-lg border border-[#D5D9D9] bg-[#F3F4F6] p-5">
            <ShimmerBlock className="mb-3 h-5 w-40 rounded" />
            <div className="w-[140px] rounded-md border border-[#E5E7EB] bg-white p-2">
              <ShimmerBlock className="mb-2 aspect-square w-full rounded" />
              <ShimmerBlock className="h-4 w-3/4 rounded" />
            </div>
          </div>
          <ShimmerBlock className="mb-5 h-12 w-full rounded" />
          <ShimmerBlock className="mb-5 h-12 w-full rounded" />
          <ShimmerBlock className="mt-8 h-14 w-full rounded-lg" />
        </div>
      </main>
    </div>
  );
}

// --- CUSTOM DROPDOWN ---
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
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between bg-white transition-all ${className} ${disabled ? 'cursor-not-allowed opacity-70 bg-slate-50' : 'cursor-pointer'} ${isOpen ? "border-[#db2777] ring-2 ring-[#db2777]/20" : ""}`}
      >
        <span className={value ? "text-[#0F1111]" : "text-[#888C8C]"}>{value || placeholder}</span>
        <FaChevronDown className={`text-xs text-[#888C8C] transition-transform duration-200 ${isOpen ? "rotate-180 text-[#db2777]" : ""}`} />
      </div>
      {isOpen && !disabled && (
        <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#D5D9D9] bg-white py-1 shadow-xl animate-[slideDown_0.2s_ease]">
          {options.map((opt) => (
            <li
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`cursor-pointer px-4 py-3 text-[0.95rem] transition-colors hover:bg-pink-50 ${value === opt.value ? "bg-pink-50 font-extrabold text-[#db2777]" : "font-medium text-[#0F1111]"}`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EditProduct() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const [searchParams] = useSearchParams();
  const productId = searchParams.get("id");

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMode, setSuccessMode] = useState("update"); // 'update' | 'delete'

  const [productData, setProductData] = useState(null);
  const [activeOffersCount, setActiveOffersCount] = useState(0);

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

  // Image State (Mixed existing URLs and new Blobs)
  const [existingUrls, setExistingUrls] = useState({ 1: null, 2: null, 3: null });
  const [blobs, setBlobs] = useState({ 1: null, 2: null, 3: null });
  const [previews, setPreviews] = useState({ 1: "", 2: "", 3: "" });
  const [deletedSlots, setDeletedSlots] = useState({ 1: false, 2: false, 3: false });
  const [savings, setSavings] = useState({ 1: "", 2: "", 3: "" });

  // Studio State
  const [studioOpen, setStudioOpen] = useState(false);
  const [cameraSlot, setCameraSlot] = useState(null);
  const [activeSlot, setActiveSlot] = useState(null);
  const [tempImage, setTempImage] = useState("");
  const [tempSize, setTempSize] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isFitting, setIsFitting] = useState(false);
  const cropperRef = useRef(null);
  const fileInputRefs = { 1: useRef(null), 2: useRef(null), 3: useRef(null) };

  // --- INITIALIZATION ---
  useEffect(() => {
    async function fetchProduct() {
      if (!user) return;
      if (!productId) {
        navigate("/vendor-panel", { replace: true });
        return;
      }
      if (isOffline) {
        setError("Network offline. Please connect to the internet to edit products.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", user.id).maybeSingle();
        if (profile?.is_suspended) throw new Error("Account restricted.");

        const { data: prod, error: prodErr } = await supabase.from("products").select("*").eq("id", productId).maybeSingle();
        if (prodErr || !prod) throw new Error("Product not found.");

        const { data: shop } = await supabase.from("shops").select("id, is_open").eq("id", prod.shop_id).eq("owner_id", user.id).maybeSingle();
        if (!shop) throw new Error("Access denied to this product's shop.");
        if (shop.is_open === false) throw new Error("Shop is suspended.");

        setProductData(prod);

        // Check Special Offer Limits for this Shop (Excluding THIS product)
        const { count } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('shop_id', prod.shop_id)
          .not('discount_price', 'is', null)
          .neq('id', productId);
        setActiveOffersCount(count || 0);

        // Hydrate Form
        const isSpecial = prod.discount_price && prod.discount_price < prod.price;
        const discountPerc = isSpecial ? Math.round(((prod.price - prod.discount_price) / prod.price) * 100) : "";

        setForm({
          name: prod.name || "",
          price: prod.price || "",
          stock: prod.stock_count || 0,
          condition: prod.condition || "New",
          category: prod.category || "",
          desc: prod.description || "",
          key_features: prod.attributes?.["Key Features"] || "",
          box_content: prod.attributes?.["What's in the Box"] || "",
          warranty: prod.attributes?.["Warranty"] || "",
          isDiscount: isSpecial,
          discountPercent: discountPerc,
        });

        // Hydrate Dynamic Attrs (excluding our standard descriptions)
        const attrs = { ...prod.attributes };
        delete attrs["Key Features"];
        delete attrs["What's in the Box"];
        delete attrs["Warranty"];
        setDynamicAttrs(attrs);

        // Hydrate Images
        const urls = { 1: prod.image_url, 2: prod.image_url_2, 3: prod.image_url_3 };
        setExistingUrls(urls);
        setPreviews({ 1: urls[1] || "", 2: urls[2] || "", 3: urls[3] || "" });

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading) fetchProduct();
  }, [user, authLoading, productId, isOffline, navigate]);


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
    setForm((prev) => {
      const next = { ...prev, condition: val };
      if (val === "Fairly Used") {
        next.isDiscount = false;
        next.discountPercent = "";
      }
      return next;
    });
  };

  // --- STUDIO LOGIC ---
  const openStudioForFile = async (file, slot) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      throw new Error("Please upload a valid image file.");
    }
    if (file.size > PRODUCT_INPUT_MAX_BYTES) {
      throw new Error(`File is too large. Max input size is ${formatBytes(PRODUCT_INPUT_MAX_BYTES)}.`);
    }

    const src = await fileToDataUrl(file);
    setActiveSlot(slot);
    setTempSize(file.size);
    setTempImage(src);
    setBrightness(100);
    setContrast(100);
    setStudioOpen(true);
  };

  const handleFileSelect = async (e, slot) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await openStudioForFile(file, slot);
    } catch (error) {
      alert(error?.message || "Could not open selected image.");
    }
  };

  const handleCameraCapture = async ({ blob }) => {
    if (!blob || !cameraSlot) return;
    try {
      const file = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
      await openStudioForFile(file, cameraSlot);
      setCameraSlot(null);
    } catch (error) {
      alert(error?.message || "Could not process captured image.");
    }
  };

  const closeStudio = () => {
    setStudioOpen(false);
    setTempImage("");
    setActiveSlot(null);
  };

  const applyWhiteBorders = async () => {
    if (!tempImage) return;
    setIsFitting(true);
    try {
      const fitted = await padImageToAspectDataUrl(tempImage, PRODUCT_PROFILE.aspectRatio);
      setTempImage(fitted);
      if (cropperRef.current?.cropper) {
        cropperRef.current.cropper.replace(fitted);
      }
    } catch (error) {
      alert(error?.message || "Could not auto-fit image.");
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
    if (!ctx) {
      alert("Could not initialize image editor canvas.");
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
    ctx.fillText("Verified CTMerchant", PRODUCT_PROFILE.targetWidth - 20, PRODUCT_PROFILE.targetHeight - 20);

    const blob = await canvasToBlobWithMaxBytes(finalCanvas, {
      maxBytes: PRODUCT_MAX_BYTES,
      mimeType: PRODUCT_PROFILE.outputMimeType,
      qualityStart: PRODUCT_PROFILE.qualityStart,
      qualityFloor: PRODUCT_PROFILE.qualityFloor,
      qualityStep: PRODUCT_PROFILE.qualityStep,
    });
    if (!blob) {
      alert(`Unable to compress this image under ${formatBytes(PRODUCT_MAX_BYTES)}. Try a simpler image.`);
      return;
    }

    setBlobs((prev) => ({ ...prev, [activeSlot]: blob }));
    setDeletedSlots((prev) => ({ ...prev, [activeSlot]: false }));
    setPreviews((prev) => ({ ...prev, [activeSlot]: URL.createObjectURL(blob) }));
    
    const saved = tempSize - blob.size;
    if (saved > 0) setSavings((prev) => ({ ...prev, [activeSlot]: `Saved ${Math.round((saved / tempSize) * 100)}%` }));
    else setSavings((prev) => ({ ...prev, [activeSlot]: "Ready" }));
    
    closeStudio();
  };

  const removeImage = (e, slot) => {
    e.stopPropagation();
    setDeletedSlots((prev) => ({ ...prev, [slot]: true }));
    setBlobs((prev) => ({ ...prev, [slot]: null }));
    setPreviews((prev) => ({ ...prev, [slot]: "" }));
    setSavings((prev) => ({ ...prev, [slot]: "" }));
  };

  // --- SUBMIT ---
  const handleUpdate = async (e) => {
    e.preventDefault();
    if (submitting || deleting) return;
    if (isOffline) return alert("You must be online to update a product.");
    if (!form.category) return alert("Please select a category.");
    
    const hasMainImage = (existingUrls[1] && !deletedSlots[1]) || blobs[1];
    if (!hasMainImage) return alert("The Main Image (Box 1) is strictly required!");
    const oversizedSlot = [1, 2, 3].find((slot) => blobs[slot] && blobs[slot].size > PRODUCT_MAX_BYTES);
    if (oversizedSlot) {
      return alert(`Image ${oversizedSlot} exceeds ${formatBytes(PRODUCT_MAX_BYTES)} after processing. Please re-crop.`);
    }
    
    if (form.isDiscount && activeOffersCount >= MAX_SPECIAL_OFFERS && (!productData.discount_price || productData.discount_price >= productData.price)) {
      return alert("Security Block: You already have the maximum of 2 Special Offers active.");
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

      // Upload new blobs
      const uploadPromises = [1, 2, 3].map(async (idx) => {
        if (!blobs[idx]) return null;
        const fName = `${user.id}_${Date.now()}_img${idx}.jpg`;
        const { error: upErr } = await supabase.storage.from(PRODUCT_BUCKET).upload(fName, blobs[idx], { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        return supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(fName).data.publicUrl;
      });

      const [url1, url2, url3] = await Promise.all(uploadPromises);

      const finalUrl1 = url1 || (deletedSlots[1] ? null : existingUrls[1]);
      const finalUrl2 = url2 || (deletedSlots[2] ? null : existingUrls[2]);
      const finalUrl3 = url3 || (deletedSlots[3] ? null : existingUrls[3]);

      // Update DB
      const { error: updateError } = await supabase.from("products").update({
        name: form.name.trim(),
        description: form.desc.trim(),
        price: priceVal,
        discount_price: discountPrice,
        condition: form.condition,
        category: form.category,
        image_url: finalUrl1,
        image_url_2: finalUrl2,
        image_url_3: finalUrl3,
        stock_count: parseInt(form.stock),
        attributes: finalAttrs,
        is_available: parseInt(form.stock) > 0,
        is_approved: false, // Reset approval
        rejection_reason: null
      }).eq("id", productId);

      if (updateError) throw updateError;

      // Garbage collect deleted original images
      const pathsToDelete = [];
      [1, 2, 3].forEach(i => {
        if (existingUrls[i] && (deletedSlots[i] || blobs[i])) {
          try {
            const fileName = decodeURIComponent(new URL(existingUrls[i]).pathname.split('/').pop());
            if (fileName) pathsToDelete.push(fileName);
          } catch(e) {}
        }
      });
      if (pathsToDelete.length > 0) {
        await supabase.storage.from(PRODUCT_BUCKET).remove(pathsToDelete);
      }

      setSuccessMode("update");
      setShowSuccess(true);
      setTimeout(() => navigate("/vendor-panel"), 2500);

    } catch (err) {
      alert(err.message || "Update failed.");
      setSubmitting(false);
    }
  };

  const deleteProduct = async () => {
    if (submitting || deleting) return;
    if (isOffline) return alert("You must be online to delete a product.");
    if (!window.confirm("Are you sure you want to permanently delete this product? This action cannot be undone.")) return;
    
    try {
      setDeleting(true);
      
      const pathsToDelete = [];
      [productData.image_url, productData.image_url_2, productData.image_url_3].forEach(url => {
        if(url && url.includes(`/${PRODUCT_BUCKET}/`)) {
          try {
            const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop());
            if(fileName) pathsToDelete.push(fileName);
          } catch(e) {}
        }
      });
      
      if(pathsToDelete.length > 0) {
        await supabase.storage.from(PRODUCT_BUCKET).remove(pathsToDelete);
      }
      
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      
      setSuccessMode("delete");
      setShowSuccess(true);
      setTimeout(() => navigate("/vendor-panel"), 2500);

    } catch (err) {
      alert("Failed to delete product: " + err.message);
      setDeleting(false);
    }
  };

  // --- LIVE CALCS ---
  const livePrice = parseFloat(form.price) || 0;
  const liveDiscPerc = parseFloat(form.discountPercent) || 0;
  const isLiveDiscValid = form.isDiscount && form.condition !== "Fairly Used" && liveDiscPerc > 0 && liveDiscPerc <= 20;
  const liveFinalPrice = isLiveDiscValid ? livePrice - livePrice * (liveDiscPerc / 100) : livePrice;


  if (authLoading || loading) return <EditProductShimmer />;

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="bg-[#131921] px-4 py-3 text-white"><button onClick={() => navigate(-1)}><FaArrowLeft /></button></header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="font-bold text-slate-900">{error}</h3>
            <button onClick={() => navigate(-1)} className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold transition hover:bg-slate-50">Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  const categoryOptions = [
    ...techCats.map(c => ({ value: c, label: c })),
    ...fashionCats.map(c => ({ value: c, label: c })),
    ...consumablesCats.map(c => ({ value: c, label: c })),
    ...propertyCats.map(c => ({ value: c, label: c })),
    { value: "Logistics & Delivery", label: "Logistics & Delivery" },
    { value: "Education & Training", label: "Education & Training" },
    { value: "Artisans", label: "Artisans" },
    { value: "Other", label: "Other" }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111] pb-12">
      <header className="sticky top-0 z-40 flex items-center gap-4 bg-[#131921] px-4 py-3 text-white shadow-sm">
        <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]"><FaArrowLeft /></button>
        <div className="text-[1.15rem] font-bold">Edit Product</div>
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
            {`Use Gallery or Camera for each slot. Camera includes zoom support where available. Max input ${formatBytes(PRODUCT_INPUT_MAX_BYTES)}; final upload ${PRODUCT_RULE_LABEL}.`}
          </p>
        </div>

        <form onSubmit={handleUpdate} className="rounded-xl border border-[#D5D9D9] bg-white p-6 shadow-sm">
          
          {/* IMAGE GRID */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            {[1, 2, 3].map((slot) => (
              <div
                key={slot}
                onClick={() => !previews[slot] && fileInputRefs[slot].current?.click()}
                className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${slot === 1 ? (previews[1] ? "border-[#db2777] bg-white" : "border-[#db2777] bg-[#fdf2f8]") : (previews[slot] ? "border-slate-300 bg-white" : "border-[#888C8C] bg-[#F7F7F7] hover:border-[#db2777]")}`}
              >
                <input type="file" ref={fileInputRefs[slot]} hidden accept={PRODUCT_ACCEPT} onChange={(e) => handleFileSelect(e, slot)} />
                
                {previews[slot] ? (
                  <>
                    <img src={previews[slot]} className="absolute inset-0 h-full w-full object-contain bg-white z-10" alt={`Slot ${slot}`} />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCameraSlot(slot);
                      }}
                      className="absolute left-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-[#0F172A] text-white shadow-md transition hover:scale-110 hover:bg-[#1E293B]"
                      title="Capture from camera"
                    >
                      <FaCamera size={11} />
                    </button>
                    <button type="button" onClick={(e) => removeImage(e, slot)} className="absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition hover:scale-110 hover:bg-red-700">
                      <FaTrashCan size={12} />
                    </button>
                    {savings[slot] && (
                      <div className="absolute bottom-1 left-1 right-1 z-20 rounded bg-[#10B981]/90 px-1 py-0.5 text-center text-[0.6rem] font-extrabold text-white backdrop-blur-sm">
                        {savings[slot]}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {slot === 1 ? <FaImage className="mb-2 text-3xl text-[#db2777]" /> : <FaCamera className="mb-2 text-3xl text-[#888C8C]" />}
                    <span className={`text-center text-[0.7rem] font-bold leading-tight ${slot === 1 ? "text-[#db2777]" : "text-[#565959]"}`}>
                      {slot === 1 ? "Main Image\n(Required)" : slot === 2 ? "Extra Angle\n(Optional)" : "Label/Box\n(Optional)"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCameraSlot(slot);
                      }}
                      className="mt-2 rounded-md border border-[#334155] bg-[#0F172A] px-2 py-1 text-[0.6rem] font-extrabold uppercase tracking-wide text-white transition hover:bg-[#1E293B]"
                    >
                      Camera
                    </button>
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
          {techCats.includes(form.category) && (
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
          {fashionCats.includes(form.category) && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Apparel Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Brand</label><input type="text" value={dynamicAttrs['Brand'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Brand', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Size</label><input type="text" value={dynamicAttrs['Size'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Size', e.target.value)} /></div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[0.85rem] font-bold">Target Audience (Gender)</label>
                  <CustomSelect
                    value={dynamicAttrs['Gender'] || ""}
                    onChange={(val) => handleAttrChange('Gender', val)}
                    options={[{ value: "Unisex", label: "Unisex" }, { value: "Men", label: "Men" }, { value: "Women", label: "Women" }, { value: "Kids", label: "Kids" }]}
                    placeholder="Select Target..."
                    className="rounded border border-[#888C8C] p-2 text-[0.95rem]"
                  />
                </div>
              </div>
            </div>
          )}
          {consumablesCats.includes(form.category) && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Product Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Brand/Maker</label><input type="text" value={dynamicAttrs['Brand'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Brand', e.target.value)} /></div>
                <div><label className="mb-1 block text-[0.85rem] font-bold">Weight/Vol</label><input type="text" value={dynamicAttrs['Weight'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Weight', e.target.value)} /></div>
                <div className="col-span-2"><label className="mb-1 block text-[0.85rem] font-bold text-red-600">Expiry Date *</label><input type="date" value={dynamicAttrs['Expiry Date'] || ''} required className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" onChange={e => handleAttrChange('Expiry Date', e.target.value)} /></div>
              </div>
            </div>
          )}
          {propertyCats.includes(form.category) && (
            <div className="mb-6 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-wide text-[#db2777]">Property Details</div>
              <div className="grid grid-cols-1 gap-4">
                <div><label className="mb-1 block text-[0.85rem] font-bold">Property Type</label><input type="text" value={dynamicAttrs['Property Type'] || ''} className="w-full rounded border border-[#888C8C] p-2 text-[0.95rem]" placeholder="e.g. 2 Bed Flat" onChange={e => handleAttrChange('Property Type', e.target.value)} /></div>
                <div>
                  <label className="mb-1 block text-[0.85rem] font-bold">Payment Cycle</label>
                  <CustomSelect
                    value={dynamicAttrs['Payment Cycle'] || ""}
                    onChange={(val) => handleAttrChange('Payment Cycle', val)}
                    options={[{ value: "Per Year", label: "Per Year" }, { value: "Per Month", label: "Per Month" }, { value: "Per Night", label: "Per Night (Hotels)" }]}
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
              <input type="number" id="stock" value={form.stock} onChange={handleInputChange} required min="0" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none" />
            </div>
          </div>

          {/* CONDITION (CUSTOM DROPDOWN) */}
          <div className="mb-5">
            <label className="mb-1.5 block text-[0.9rem] font-bold">Condition</label>
            <CustomSelect
              value={form.condition}
              onChange={handleConditionChange}
              options={[{ value: "New", label: "New" }, { value: "Fairly Used", label: "Fairly Used" }]}
              className="rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
            />
          </div>

          {/* DISCOUNT SECTION */}
          {form.condition !== "Fairly Used" && (
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
              <FaListUl className="text-[#db2777]" /> Product Presentation Details
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-[0.85rem] font-bold">Key Features</label>
              <textarea id="key_features" value={form.key_features} onChange={handleInputChange} rows="2" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none resize-y"></textarea>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-[0.85rem] font-bold">Full Description <span className="text-[#db2777]">*</span></label>
              <textarea id="desc" value={form.desc} onChange={handleInputChange} rows="4" required className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none resize-y"></textarea>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1.5 block text-[0.85rem] font-bold">What's in the Box</label><textarea id="box_content" value={form.box_content} onChange={handleInputChange} rows="2" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none"></textarea></div>
              <div><label className="mb-1.5 block text-[0.85rem] font-bold">Warranty</label><textarea id="warranty" value={form.warranty} onChange={handleInputChange} rows="2" className="w-full rounded border border-[#888C8C] p-3 text-[0.9rem] focus:border-[#db2777] focus:outline-none"></textarea></div>
            </div>
          </div>

          <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#db2777] p-4 text-[1.05rem] font-bold text-white shadow-[0_4px_10px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:bg-[#E3E6E6] disabled:text-[#888C8C] disabled:shadow-none">
            {submitting ? <><FaCircleNotch className="animate-spin" /> Processing...</> : <><FaPaperPlane /> {productData.is_approved === false && productData.rejection_reason ? "Resubmit Update" : "Update Product"}</>}
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
                <button onClick={applyWhiteBorders} disabled={isFitting} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#db2777] bg-transparent p-3 font-bold text-[#db2777] transition hover:bg-[rgba(219,39,119,0.1)]">
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
                <button onClick={closeStudio} className="rounded-lg border border-[#334155] px-5 py-2.5 font-semibold text-[#94a3b8] hover:bg-[#334155] hover:text-white">Cancel</button>
                <button onClick={applyCrop} className="flex items-center gap-2 rounded-lg bg-[#10b981] px-6 py-2.5 font-extrabold text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)] hover:bg-[#059669]"><FaMicrochip /> Process & Save</button>
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

      {/* SUCCESS MODAL (Handles both Update and Delete States) */}
      {showSuccess && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-[rgba(15,23,42,0.95)] backdrop-blur-sm">
          <div className="w-[90%] max-w-[420px] animate-[scaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)_forwards] rounded-[28px] bg-white p-10 text-center shadow-2xl">
            <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${successMode === 'delete' ? 'bg-[#FEE2E2]' : 'bg-[#D1FAE5]'}`}>
              {successMode === 'delete' ? <FaTrashCan className="text-4xl text-[#DC2626]" /> : <FaCheck className="text-4xl text-[#10B981]" />}
            </div>
            <h2 className={`mb-2 text-[1.6rem] font-extrabold ${successMode === 'delete' ? 'text-[#991B1B]' : 'text-[#1F2937]'}`}>
              {successMode === 'delete' ? 'Product Deleted' : 'Update Successful!'}
            </h2>
            <p className="mb-6 font-medium text-[#6B7280]">
              {successMode === 'delete' ? 'This product has been permanently removed from your shop.' : 'Your product has been updated and resubmitted for approval.'}
            </p>
            <div className={`mx-auto h-7 w-7 animate-spin rounded-full border-4 ${successMode === 'delete' ? 'border-[#DC2626]/30 border-t-[#DC2626]' : 'border-[#db2777]/30 border-t-[#db2777]'}`}></div>
            <p className={`mt-4 text-[0.8rem] font-bold ${successMode === 'delete' ? 'text-[#565959]' : 'text-[#db2777]'}`}>Redirecting to dashboard...</p>
          </div>
          <style dangerouslySetInnerHTML={{ __html: "@keyframes scaleUp { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }" }} />
        </div>
      )}
    </div>
  );
}
