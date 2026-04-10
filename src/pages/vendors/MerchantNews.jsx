import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaBullhorn,
  FaCircleInfo,
  FaCircleNotch,
  FaPaperPlane,
  FaTriangleExclamation,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { PageLoadingScreen } from "../../components/common/PageStatusScreen";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";

// --- SHIMMER COMPONENT ---
function NewsShimmer() {
  return (
    <PageLoadingScreen
      title="Opening shop news"
      message="Please wait while we prepare your news composer."
    />
  );
}

export default function MerchantNews() {
  const navigate = useNavigate();
  const location = useLocation();
  usePreventPullToRefresh();
  const { notify } = useGlobalFeedback();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-news" &&
    (!urlShopId || String(location.state.prefetchedData.shopId) === String(urlShopId))
      ? location.state.prefetchedData
      : null

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(() => !prefetchedData);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [shopId, setShopId] = useState(() => prefetchedData?.shopId || urlShopId);
  const [newsText, setNewsText] = useState(() => prefetchedData?.newsText || "");
  const [status, setStatus] = useState(() => prefetchedData?.status || ""); // 'pending' | 'approved' | 'rejected' | ''

  // Initialization & Fetch
  useEffect(() => {
    if (prefetchedData) {
      setShopId(prefetchedData.shopId || urlShopId);
      setNewsText(prefetchedData.newsText || "");
      setStatus(prefetchedData.status || "");
      setError(null);
      setLoading(false);
      return;
    }

    async function init() {
      if (!user) return;
      if (isOffline) {
        setError("Network offline. Please connect to the internet to post news.");
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

        const { data: shopAccess, error: shopAccessErr } = await supabase
          .from("shops")
          .select("id")
          .eq("id", currentShopId)
          .eq("owner_id", user.id)
          .maybeSingle();

        if (shopAccessErr || !shopAccess) throw new Error("Shop not found or access denied.");
        if (String(shopId) !== String(shopAccess.id || currentShopId)) {
          setShopId(String(shopAccess.id));
        }

        const { data: newsData, error: newsErr } = await supabase
          .from("shop_banners_news")
          .select("content_data, status")
          .eq("shop_id", currentShopId)
          .eq("content_type", "news")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (newsErr) throw newsErr;

        if (newsData && newsData.content_data) {
          setNewsText(newsData.content_data);
          setStatus(newsData.status);
        }

      } catch (err) {
        setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."));
      } finally {
        setLoading(false);
      }
    }
    if (!authLoading) init();
  }, [user, authLoading, shopId, isOffline, prefetchedData, urlShopId]);

  const handleTextChange = (e) => {
    // Enforce 150 char limit strictly in React state
    if (e.target.value.length <= 150) {
      setNewsText(e.target.value);
      // If they edit existing news, drop the status badge to show it's 'new'
      if (status && status !== 'new') setStatus('new'); 
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (isOffline) {
      notify({ type: "error", title: "Network unavailable", message: "You must be online to submit news." });
      return;
    }

    try {
      setSubmitting(true);
      const text = newsText.trim();

      // 1. Delete existing news (Garbage Collection)
      await supabase
        .from("shop_banners_news")
        .delete()
        .eq("shop_id", shopId)
        .eq("merchant_id", user.id)
        .eq("content_type", "news");

      // 2. Insert new (if not empty)
      if (text.length === 0) {
        notify({ type: "success", title: "News removed", message: "Your shop news has been removed successfully." });
      } else {
        const { error: insertError } = await supabase.from("shop_banners_news").insert({
          shop_id: shopId,
          merchant_id: user.id,
          content_type: "news",
          content_data: text.substring(0, 150),
          status: "pending",
        });

        if (insertError) throw insertError;
        notify({ type: "success", title: "News submitted", message: "Your shop news was submitted for admin approval." });
      }

      navigate("/vendor-panel");

    } catch (err) {
      notify({ type: "error", title: "Submission failed", message: getFriendlyErrorMessage(err, "Submission failed. Please retry.") });
    } finally {
      setSubmitting(false);
    }
  };


  if (authLoading || loading) return <NewsShimmer />;

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
          <div className="text-[1.15rem] font-bold">Post Shop News</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[600px] flex-1 p-5 mt-4">
        
        <div className="rounded-xl border border-[#D5D9D9] bg-white p-8 shadow-sm">
          
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[1.2rem] font-extrabold text-[#0F1111]">Latest Updates</h2>
            {status && (
              <div className={`rounded-md border px-3 py-1 text-[0.75rem] font-extrabold uppercase tracking-wide shadow-sm ${
                status === "pending" ? "border-[#FDE68A] bg-[#FEF3C7]/95 text-[#D97706]" :
                status === "approved" ? "border-[#A7F3D0] bg-[#D1FAE5]/95 text-[#059669]" :
                status === "rejected" ? "border-[#FECACA] bg-[#FEE2E2]/95 text-[#DC2626]" :
                "border-[#D5D9D9] bg-[#F3F4F6]/95 text-[#0F1111]"
              }`}>
                {status === "new" ? "UNSAVED EDITS" : status}
              </div>
            )}
          </div>

          <p className="mb-6 text-[0.95rem] leading-relaxed text-[#565959]">
            Write a short update for your customers. It will be reviewed by an admin before appearing on your shop page and the main repository ticker.
          </p>

          <form onSubmit={handleSave}>
            <div className="relative mb-3">
              <textarea
                value={newsText}
                onChange={handleTextChange}
                maxLength={150}
                placeholder="e.g. Flash Sale! 50% off all iPhones this weekend only."
                className="h-[160px] w-full resize-none rounded-md border border-[#888C8C] bg-white p-4 text-[1rem] text-[#0F1111] shadow-[inset_0_1px_2px_rgba(15,17,17,0.15)] transition-colors focus:border-[#db2777] focus:outline-none focus:ring-4 focus:ring-[#db2777]/20"
              />
              <div className={`absolute bottom-3 right-3 text-[0.75rem] font-extrabold ${newsText.length >= 140 ? 'text-red-500' : 'text-[#888C8C]'}`}>
                {newsText.length}/150
              </div>
            </div>

            <div className="mb-8 flex items-start gap-2 text-[0.85rem] leading-snug text-[#565959]">
              <FaCircleInfo className="mt-0.5 shrink-0 text-[#db2777]" />
              <span>Leave this text box empty and click submit to completely remove your currently active news.</span>
            </div>

            <button 
              type="submit" 
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#db2777] px-4 py-3.5 text-[1.05rem] font-extrabold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:border-[#D5D9D9] disabled:bg-[#E3E6E6] disabled:text-[#888C8C] disabled:shadow-none"
            >
              {submitting ? <><FaCircleNotch className="animate-spin" /> Submitting...</> : <><FaPaperPlane /> Submit for Approval</>}
            </button>
          </form>

        </div>

      </main>
    </div>
  );
}
