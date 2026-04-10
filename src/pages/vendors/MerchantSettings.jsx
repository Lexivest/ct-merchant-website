import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FaAddressBook,
  FaAlignLeft,
  FaArrowLeft,
  FaBuilding,
  FaCheck,
  FaCircleInfo,
  FaCircleNotch,
  FaFacebookF,
  FaGlobe,
  FaInstagram,
  FaLocationDot,
  FaLock,
  FaPhone,
  FaShareNodes,
  FaShieldHalved,
  FaStore,
  FaTiktok,
  FaTriangleExclamation,
  FaXTwitter,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { PageLoadingScreen } from "../../components/common/PageStatusScreen";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";

// --- SHIMMER COMPONENT ---
function SettingsShimmer() {
  return (
    <PageLoadingScreen
      title="Opening settings"
      message="Please wait while we prepare your shop settings."
    />
  );
}

export default function MerchantSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  usePreventPullToRefresh();
  const { notify } = useGlobalFeedback();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-settings" &&
    (!urlShopId || String(location.state.prefetchedData.shopId) === String(urlShopId))
      ? location.state.prefetchedData
      : null

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(() => !prefetchedData);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [shopId, setShopId] = useState(() => prefetchedData?.shopId || urlShopId);
  const [isLocked, setIsLocked] = useState(() => prefetchedData?.isLocked || false);

  // Form State
  const [form, setForm] = useState({
    name: prefetchedData?.form?.name || "",
    desc: prefetchedData?.form?.desc || "",
    address: prefetchedData?.form?.address || "",
    phone: prefetchedData?.form?.phone || "",
    whatsapp: prefetchedData?.form?.whatsapp || "",
    website: prefetchedData?.form?.website || "",
    facebook: prefetchedData?.form?.facebook || "",
    instagram: prefetchedData?.form?.instagram || "",
    twitter: prefetchedData?.form?.twitter || "",
    tiktok: prefetchedData?.form?.tiktok || "",
  });

  // Initialization & Fetch
  useEffect(() => {
    if (prefetchedData) {
      setShopId(prefetchedData.shopId || urlShopId);
      setForm(prefetchedData.form);
      setIsLocked(prefetchedData.isLocked || false);
      setError(null);
      setLoading(false);
      return;
    }

    async function init() {
      if (!user) return;
      if (isOffline) {
        setError("Network offline. Please connect to the internet to edit settings.");
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

        const { data: shopData, error: shopErr } = await supabase
          .from("shops")
          .select("*")
          .eq("id", currentShopId)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (shopErr || !shopData) throw new Error("Could not load shop data.");

        setForm({
          name: shopData.name || "",
          desc: shopData.description || "",
          address: shopData.address || "",
          phone: shopData.phone || "",
          whatsapp: shopData.whatsapp || "",
          website: shopData.website_url || "",
          facebook: shopData.facebook_url || "",
          instagram: shopData.instagram_url || "",
          twitter: shopData.twitter_url || "",
          tiktok: shopData.tiktok_url || "",
        });

        // Apply Security Lockdown if Approved
        setIsLocked(shopData.status === "approved");

      } catch (err) {
        setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."));
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading) init();
  }, [user, authLoading, shopId, isOffline, prefetchedData, urlShopId]);


  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isOffline) {
      notify({ type: "error", title: "Network unavailable", message: "You must be online to save changes." });
      return;
    }

    try {
      setSaving(true);
      
      const cleanVal = (val) => val.trim() === "" ? null : val.trim();

      const updates = {
        name: form.name.trim(),
        description: form.desc.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        whatsapp: cleanVal(form.whatsapp),
        website_url: cleanVal(form.website),
        facebook_url: cleanVal(form.facebook),
        instagram_url: cleanVal(form.instagram),
        twitter_url: cleanVal(form.twitter),
        tiktok_url: cleanVal(form.tiktok),
      };

      const { error: updateError } = await supabase
        .from("shops")
        .update(updates)
        .eq("id", shopId)
        .eq("owner_id", user.id);
      if (updateError) throw updateError;

      // Invalidate cache
      try { localStorage.removeItem(`ctm_dashboard_cache`); } catch {
        // Ignore cache cleanup failures after a successful update.
      }

      navigate("/vendor-panel");

    } catch (err) {
      notify({ type: "error", title: "Update failed", message: getFriendlyErrorMessage(err, "Update failed. Please retry.") });
      setSaving(false);
    }
  };


  if (authLoading || loading) return <SettingsShimmer />;

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="bg-[#131921] px-4 py-3 text-white"><button onClick={() => navigate("/vendor-panel")}><FaArrowLeft /></button></header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="font-bold text-slate-900">{error}</h3>
            <button onClick={() => window.location.reload()} className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold transition hover:bg-slate-50">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]">
            <FaArrowLeft />
          </button>
          <div className="text-[1.15rem] font-bold">Shop Settings</div>
        </div>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="flex items-center gap-2 rounded-md border border-[#be185d] bg-[#db2777] px-4 py-1.5 text-[0.95rem] font-bold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:border-[#D5D9D9] disabled:bg-[#E3E6E6] disabled:text-[#888C8C] disabled:shadow-none"
        >
          {saving ? <><FaCircleNotch className="animate-spin" /> Saving</> : <><FaCheck /> Save</>}
        </button>
      </header>

      <main className="mx-auto w-full max-w-[600px] flex-1 p-5 pb-20">
        
        {/* SECURITY BANNER */}
        {isLocked && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-[#93C5FD] bg-[#EFF6FF] p-4 shadow-[0_2px_4px_rgba(59,130,246,0.1)]">
            <FaShieldHalved className="mt-0.5 shrink-0 text-2xl text-[#3B82F6]" />
            <div>
              <h4 className="mb-1 text-[0.95rem] font-extrabold text-[#1E3A8A]">Security Lockdown Active</h4>
              <p className="text-[0.85rem] leading-relaxed text-[#1E40AF]">Because your shop is fully Approved, critical details (Name & Phone) are locked to protect your account from hijacking. Contact Support if you need to update these.</p>
            </div>
          </div>
        )}

        <form id="settings-form" onSubmit={handleSave} className="rounded-xl border border-[#D5D9D9] bg-white p-6 shadow-sm">
          
          {/* BASIC INFO */}
          <div className="mb-5 mt-2 flex items-center gap-2 border-b-2 border-[#F3F4F6] pb-2 text-[1.15rem] font-extrabold">
            <FaBuilding className="text-[#db2777]" /> Basic Information
          </div>

          <div className="mb-5">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold">
              <FaStore className="mr-2 text-[#db2777]" /> Business Name
              {isLocked && <span className="ml-auto flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 text-[0.7rem] font-extrabold text-[#6B7280]"><FaLock /> Locked</span>}
            </label>
            <input type="text" id="name" value={form.name} onChange={handleInputChange} required disabled={isLocked} className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:shadow-none" />
          </div>

          <div className="mb-5">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold">
              <FaAlignLeft className="mr-2 text-[#db2777]" /> Description
            </label>
            <textarea id="desc" value={form.desc} onChange={handleInputChange} required placeholder="Tell customers what your shop is all about..." className="min-h-[120px] w-full resize-y rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>

          <div className="mb-8">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold">
              <FaLocationDot className="mr-2 text-[#db2777]" /> Physical Address
            </label>
            <input type="text" id="address" value={form.address} onChange={handleInputChange} required className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>

          <hr className="my-8 border-none bg-[#D5D9D9] h-px" />

          {/* CONTACT DETAILS */}
          <div className="mb-5 flex items-center gap-2 border-b-2 border-[#F3F4F6] pb-2 text-[1.15rem] font-extrabold">
            <FaAddressBook className="text-[#db2777]" /> Contact Details
          </div>

          <div className="mb-5">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold">
              <FaPhone className="mr-2 text-[#db2777]" /> Phone Number
              {isLocked && <span className="ml-auto flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 text-[0.7rem] font-extrabold text-[#6B7280]"><FaLock /> Locked</span>}
            </label>
            <input type="tel" id="phone" value={form.phone} onChange={handleInputChange} required disabled={isLocked} placeholder="e.g. 08012345678" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:shadow-none" />
          </div>

          <div className="mb-8">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold">
              <FaPhone className="mr-2 text-[#db2777]" /> WhatsApp Number
              {isLocked && <span className="ml-auto flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 text-[0.7rem] font-extrabold text-[#6B7280]"><FaLock /> Locked</span>}
            </label>
            <input type="tel" id="whatsapp" value={form.whatsapp} onChange={handleInputChange} disabled={isLocked} placeholder="e.g. 08012345678" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:shadow-none" />
            {!isLocked && <div className="mt-1.5 flex items-center gap-1.5 text-[0.85rem] text-[#565959]"><FaCircleInfo className="text-[#db2777]" /> Used for direct customer messaging.</div>}
          </div>

          <hr className="my-8 border-none bg-[#D5D9D9] h-px" />

          {/* SOCIAL LINKS */}
          <div className="mb-5 flex items-center gap-2 border-b-2 border-[#F3F4F6] pb-2 text-[1.15rem] font-extrabold">
            <FaShareNodes className="text-[#db2777]" /> Social Links (Optional)
          </div>

          <div className="mb-5">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold"><FaGlobe className="mr-2 text-[#4F46E5]" /> Website</label>
            <input type="url" id="website" value={form.website} onChange={handleInputChange} placeholder="e.g. https://mybusiness.com" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>
          <div className="mb-5">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold"><FaFacebookF className="mr-2 text-[#1877F2]" /> Facebook Page</label>
            <input type="url" id="facebook" value={form.facebook} onChange={handleInputChange} placeholder="e.g. https://facebook.com/myshop" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>
          <div className="mb-5">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold"><FaInstagram className="mr-2 text-[#E1306C]" /> Instagram Profile</label>
            <input type="url" id="instagram" value={form.instagram} onChange={handleInputChange} placeholder="e.g. https://instagram.com/myshop" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>
          <div className="mb-5">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold"><FaXTwitter className="mr-2 text-black" /> X (Twitter) Profile</label>
            <input type="url" id="twitter" value={form.twitter} onChange={handleInputChange} placeholder="e.g. https://x.com/myshop" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>
          <div className="mb-5">
            <label className="mb-2 flex items-center text-[0.9rem] font-bold"><FaTiktok className="mr-2 text-black" /> TikTok Profile</label>
            <input type="url" id="tiktok" value={form.tiktok} onChange={handleInputChange} placeholder="e.g. https://tiktok.com/@myshop" className="w-full rounded border border-[#888C8C] p-3 text-[1rem] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-[#db2777] focus:outline-none focus:ring-2 focus:ring-[#db2777]/20" />
          </div>

        </form>
      </main>
    </div>
  );
}
