import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";
import {
  FaArrowLeft,
  FaCheck,
  FaCircleNotch,
  FaCropSimple,
  FaHandPointer,
  FaImage,
  FaPanorama,
  FaTrashCan,
  FaTriangleExclamation,
  FaWandMagicSparkles,
  FaXmark,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { ShimmerBlock } from "../../components/common/Shimmers";

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB
const BANNER_MAX_BYTES = 200 * 1024; // 200KB
const TARGET_W = 1280;
const TARGET_H = 720;

// --- SHIMMER COMPONENT ---
function BannerShimmer() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="text-xl opacity-50"><FaArrowLeft /></div>
          <div className="text-[1.15rem] font-bold opacity-50">Shop Banner</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[600px] p-5">
        <div className="mb-6 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <ShimmerBlock className="mb-2 h-5 w-48 rounded" />
          <ShimmerBlock className="h-4 w-full rounded" />
          <ShimmerBlock className="mt-1 h-4 w-3/4 rounded" />
        </div>
        <ShimmerBlock className="aspect-video w-full rounded-xl" />
      </main>
    </div>
  );
}

export default function MerchantBanner() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMode, setSuccessMode] = useState("upload"); // 'upload' | 'delete'

  const [shopId, setShopId] = useState(urlShopId);
  const [existingBanners, setExistingBanners] = useState([]);
  
  // Display State
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState(""); // 'pending' | 'approved' | 'rejected' | 'new' | ''
  
  // Data State
  const [activeBlob, setActiveBlob] = useState(null);
  const [shouldDeleteOld, setShouldDeleteOld] = useState(false);

  // Studio State
  const [studioOpen, setStudioOpen] = useState(false);
  const [tempImage, setTempImage] = useState("");
  const cropperRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function init() {
      if (!user) return;
      if (isOffline) {
        setError("Network offline. Please connect to the internet to manage your banner.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", user.id).maybeSingle();
        if (profile?.is_suspended) throw new Error("Account restricted.");

        let currentShopId = shopId;
        if (!currentShopId) {
          const { data: shop } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle();
          if (!shop) throw new Error("Shop not found.");
          currentShopId = shop.id;
          setShopId(shop.id);
        }

        const { data: banners, error: bannerErr } = await supabase
          .from("shop_banners_news")
          .select("*")
          .eq("shop_id", currentShopId)
          .eq("content_type", "banner")
          .order("created_at", { ascending: false });

        if (bannerErr) throw bannerErr;

        if (banners && banners.length > 0) {
          setExistingBanners(banners);
          setPreviewUrl(banners[0].content_data);
          setStatus(banners[0].status);
        }

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading) init();
  }, [user, authLoading, shopId, isOffline]);

  // --- STUDIO LOGIC ---
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      alert("File is too large! Max 4MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setTempImage(ev.target.result);
      setStudioOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const closeStudio = () => {
    setStudioOpen(false);
    setTempImage("");
  };

  const applyCrop = () => {
    if (!cropperRef.current?.cropper) return;
    const cropper = cropperRef.current.cropper;

    const canvas = cropper.getCroppedCanvas({
      width: TARGET_W,
      height: TARGET_H,
      fillColor: "#FFFFFF",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    let quality = 0.8;
    const attemptCompress = () => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          if (blob.size <= BANNER_MAX_BYTES || quality <= 0.2) {
            setActiveBlob(blob);
            setShouldDeleteOld(true);
            setPreviewUrl(URL.createObjectURL(blob));
            setStatus("new");
            closeStudio();
          } else {
            quality -= 0.15;
            attemptCompress();
          }
        },
        "image/jpeg",
        quality
      );
    };
    attemptCompress();
  };

  const removeImage = (e) => {
    e.stopPropagation();
    setShouldDeleteOld(true);
    setActiveBlob(null);
    setPreviewUrl("");
    setStatus("");
  };

  // --- SUBMIT ---
  const handleSave = async () => {
    if (isOffline) {
      alert("You must be online to save changes.");
      return;
    }
    if (!shouldDeleteOld && !activeBlob) {
      navigate("/vendor-panel");
      return;
    }

    try {
      setSaving(true);

      // 1. Garbage Collection
      if (shouldDeleteOld && existingBanners.length > 0) {
        const pathsToDelete = [];
        const idsToDelete = [];

        existingBanners.forEach((b) => {
          idsToDelete.push(b.id);
          if (b.content_data && b.content_data.includes("/shops-banner-storage/")) {
            try {
              const fileName = decodeURIComponent(new URL(b.content_data).pathname.split("/").pop());
              if (fileName) pathsToDelete.push(`${shopId}/${fileName}`);
            } catch (e) {}
          }
        });

        if (pathsToDelete.length > 0) {
          await supabase.storage.from("shops-banner-storage").remove(pathsToDelete);
        }
        if (idsToDelete.length > 0) {
          await supabase.from("shop_banners_news").delete().in("id", idsToDelete);
        }
      }

      // 2. Upload New
      if (activeBlob) {
        const fName = `${shopId}/${Date.now()}_banner.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("shops-banner-storage")
          .upload(fName, activeBlob, { contentType: "image/jpeg", upsert: false });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("shops-banner-storage").getPublicUrl(fName);

        // 3. Insert Record
        const { error: dbError } = await supabase.from("shop_banners_news").insert({
          shop_id: parseInt(shopId),
          merchant_id: user.id,
          content_type: "banner",
          content_data: data.publicUrl,
          status: "pending",
        });

        if (dbError) throw dbError;
        setSuccessMode("upload");
      } else {
        setSuccessMode("delete");
      }

      setShowSuccess(true);
      setTimeout(() => {
        navigate("/vendor-panel");
      }, 2500);

    } catch (err) {
      alert("Error saving banner: " + err.message);
      setSaving(false);
    }
  };


  if (authLoading || loading) return <BannerShimmer />;

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="bg-[#131921] px-4 py-3 text-white"><button onClick={() => navigate("/vendor-panel")}><FaArrowLeft /></button></header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="font-bold text-slate-900">{error}</h3>
            <button onClick={() => navigate("/vendor-panel")} className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold transition hover:bg-slate-50">Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]">
            <FaArrowLeft />
          </button>
          <div className="text-[1.15rem] font-bold">Shop Banner</div>
        </div>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="flex items-center gap-2 rounded-md border border-[#be185d] bg-[#db2777] px-4 py-1.5 text-[0.95rem] font-bold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:border-[#D5D9D9] disabled:bg-[#E3E6E6] disabled:text-[#888C8C] disabled:shadow-none"
        >
          {saving ? <><FaCircleNotch className="animate-spin" /> Saving</> : <><FaCheck /> Save</>}
        </button>
      </header>

      <main className="mx-auto w-full max-w-[600px] flex-1 p-5">
        
        <div className="mb-6 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <h4 className="mb-2 flex items-center gap-2 text-[0.95rem] font-extrabold text-[#0F1111]">
            <FaPanorama className="text-[#007185]" /> Landscape Shop Banner
          </h4>
          <p className="text-[0.85rem] text-[#475569] leading-relaxed">
            Upload <strong>1 Landscape Banner</strong> to feature your shop. To ensure fast loading speeds, images over <strong>200KB</strong> will be automatically compressed. All banners are reviewed by an admin.
          </p>
        </div>

        <div className="relative w-full">
          <div
            onClick={() => !previewUrl && fileInputRef.current?.click()}
            className={`relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 transition-colors ${previewUrl ? "cursor-default border-[#D5D9D9] bg-white shadow-sm" : "cursor-pointer border-dashed border-[#888C8C] bg-[#F7F7F7] hover:border-[#db2777] hover:bg-[#fdf2f8]"}`}
          >
            <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileSelect} />
            
            {previewUrl ? (
              <>
                <img src={previewUrl} className="absolute inset-0 h-full w-full object-cover z-0" alt="Banner Preview" />
                <button 
                  type="button" 
                  onClick={removeImage} 
                  className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition hover:scale-110 hover:bg-red-700"
                >
                  <FaTrashCan />
                </button>
                
                {status && (
                  <div className={`absolute left-3 top-3 z-10 rounded-md border px-3 py-1.5 text-[0.75rem] font-extrabold shadow-sm backdrop-blur-sm ${
                    status === "pending" ? "border-[#FDE68A] bg-[#FEF3C7]/95 text-[#D97706]" :
                    status === "approved" ? "border-[#A7F3D0] bg-[#D1FAE5]/95 text-[#059669]" :
                    status === "rejected" ? "border-[#FECACA] bg-[#FEE2E2]/95 text-[#DC2626]" :
                    "border-[#D5D9D9] bg-[#F3F4F6]/95 text-[#0F1111]"
                  }`}>
                    {status === "pending" ? "PENDING APPROVAL" : status === "approved" ? "APPROVED" : status === "rejected" ? "REJECTED" : "UNSAVED CHANGES"}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center p-5">
                <FaImage className="mx-auto mb-3 text-5xl text-[#888C8C]" />
                <span className="text-[0.9rem] font-bold leading-relaxed text-[#565959]">Tap to Upload Banner<br/>(Landscape, Max 200KB)</span>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* STUDIO OVERLAY (16:9 STRICT) */}
      {studioOpen && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-[rgba(15,23,42,0.95)] backdrop-blur-sm">
          <div className="flex items-center justify-between bg-black/50 px-5 py-4 text-white">
            <div className="flex items-center gap-2 font-extrabold text-[1.2rem]"><FaCropSimple className="text-[#db2777]" /> Frame Banner</div>
            <button onClick={closeStudio} className="text-2xl text-white hover:text-[#db2777]"><FaXmark /></button>
          </div>
          
          <div className="flex flex-1 items-center justify-center overflow-hidden p-5">
            <Cropper
              ref={cropperRef}
              src={tempImage}
              style={{ height: "100%", width: "100%" }}
              aspectRatio={16 / 9}
              viewMode={1}
              dragMode="move"
              background={true}
              autoCropArea={1}
              responsive={true}
              checkOrientation={false}
            />
          </div>
          
          <div className="flex flex-col items-center justify-center gap-4 bg-black/50 p-5">
            <div className="text-center text-[0.85rem] font-medium text-white">
              <FaHandPointer className="inline mr-1" /> Drag to move. Pinch to zoom in/out.
            </div>
            <div className="flex items-center justify-center gap-4">
              <button onClick={closeStudio} className="rounded-lg bg-[#374151] px-6 py-3 font-semibold text-white transition hover:bg-[#4B5563]">Cancel</button>
              <button onClick={applyCrop} className="flex items-center gap-2 rounded-lg bg-[#db2777] px-8 py-3 font-extrabold text-white shadow-md transition hover:bg-[#be185d]">Apply Crop</button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {showSuccess && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-[rgba(15,23,42,0.95)] backdrop-blur-sm">
          <div className="w-[90%] max-w-[420px] animate-[scaleUp_0.4s_cubic-bezier(0.16,1,0.3,1)_forwards] rounded-[28px] bg-white p-10 text-center shadow-2xl">
            <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${successMode === 'delete' ? 'bg-[#FEE2E2]' : 'bg-[#D1FAE5]'}`}>
              {successMode === 'delete' ? <FaTrashCan className="text-4xl text-[#DC2626]" /> : <FaCheck className="text-4xl text-[#10B981]" />}
            </div>
            <h2 className={`mb-2 text-[1.6rem] font-extrabold ${successMode === 'delete' ? 'text-[#991B1B]' : 'text-[#1F2937]'}`}>
              {successMode === 'delete' ? 'Banner Deleted' : 'Upload Successful!'}
            </h2>
            <p className="mb-6 font-medium text-[#6B7280]">
              {successMode === 'delete' ? 'Banner successfully removed from your shop.' : 'New Banner uploaded! It will be reviewed shortly.'}
            </p>
            <div className={`mx-auto h-7 w-7 animate-spin rounded-full border-4 ${successMode === 'delete' ? 'border-[#DC2626]/30 border-t-[#DC2626]' : 'border-[#db2777]/30 border-t-[#db2777]'}`}></div>
            <p className={`mt-4 text-[0.8rem] font-bold ${successMode === 'delete' ? 'text-[#565959]' : 'text-[#db2777]'}`}>Redirecting to dashboard...</p>
          </div>
          <style dangerouslySetOrigin={{__html: `@keyframes scaleUp { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}}/>
        </div>
      )}
    </div>
  );
}