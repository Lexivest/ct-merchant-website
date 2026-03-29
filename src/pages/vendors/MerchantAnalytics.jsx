import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaChartPie,
  FaEye,
  FaHandPointer,
  FaRotateRight,
  FaThumbsUp,
  FaTriangleExclamation,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { ShimmerBlock } from "../../components/common/Shimmers";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";

// --- FORMATTER ---
const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num;
};

// --- SHIMMER COMPONENT ---
function AnalyticsShimmer() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="text-xl opacity-50"><FaArrowLeft /></div>
          <div className="text-[1.15rem] font-bold opacity-50">Shop Analytics</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[800px] flex-1 p-5 pb-12">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <ShimmerBlock className="mb-2 h-6 w-48 rounded" />
            <ShimmerBlock className="h-4 w-64 rounded" />
          </div>
          <ShimmerBlock className="h-6 w-16 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-start rounded-lg border border-[#D5D9D9] bg-white p-6 shadow-sm">
              <ShimmerBlock className="mb-5 h-[52px] w-[52px] rounded-lg" />
              <ShimmerBlock className="mb-2 h-8 w-24 rounded" />
              <ShimmerBlock className="mb-1 h-5 w-32 rounded" />
              <ShimmerBlock className="h-3 w-40 rounded" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function MerchantAnalytics() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const { notify } = useGlobalFeedback();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  const [shopId, setShopId] = useState(urlShopId);
  const [stats, setStats] = useState({ views: 0, clicks: 0, likes: 0, conversion: "0.0%" });

  const fetchStats = async (isRefresh = false) => {
    if (isOffline) {
      if (!isRefresh) setError("Network offline. Please connect to the internet to view analytics.");
      else notify({ type: "error", title: "Network unavailable", message: "You must be online to refresh statistics." });
      return;
    }

    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      let currentShopId = shopId;
      if (!currentShopId) {
        const { data: shopLookup } = await supabase.from("shops").select("id").eq("owner_id", user.id).maybeSingle();
        if (!shopLookup) throw new Error("Shop not found.");
        currentShopId = shopLookup.id;
        setShopId(shopLookup.id);
      }

      // Fault-Tolerant Fetching Wrapper
      const safeCountFetch = async (table) => {
        try {
          const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("shop_id", currentShopId);
          if (error) throw error;
          return count || 0;
        } catch (err) {
          console.warn(`Failed to fetch ${table} count:`, err);
          return 0; // Fallback gracefully
        }
      };

      // Parallel Execution
      const [views, clicks, likes] = await Promise.all([
        safeCountFetch("shop_views"),
        safeCountFetch("whatsapp_clicks"),
        safeCountFetch("shop_likes"),
      ]);

      // Calculate Conversion Rate (Clicks / Views)
      let conversionRate = "0.0%";
      if (views > 0) {
        conversionRate = ((clicks / views) * 100).toFixed(1) + "%";
      }

      setStats({ views, clicks, likes, conversion: conversionRate });

    } catch (err) {
      if (!isRefresh) setError(getFriendlyErrorMessage(err, "Could not load analytics. Retry."));
      else notify({ type: "error", title: "Refresh failed", message: "We could not refresh the statistics. Please try again." });
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchStats(false);
    }
  }, [user, authLoading]); // Intentionally not including shopId so it only runs once on mount


  if (authLoading || loading) return <AnalyticsShimmer />;

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="bg-[#131921] px-4 py-3 text-white"><button onClick={() => navigate("/vendor-panel")}><FaArrowLeft /></button></header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="mb-2 font-bold text-slate-900">Failed to load analytics</h3>
            <p className="text-sm text-slate-600 max-w-sm mx-auto">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold transition hover:bg-slate-50">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-40 flex w-full items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]"><FaArrowLeft /></button>
          <div className="text-[1.15rem] font-bold">Shop Analytics</div>
        </div>
        <button 
          onClick={() => fetchStats(true)} 
          disabled={refreshing}
          className="flex items-center gap-2 rounded-md border border-[#be185d] bg-[#db2777] px-3 py-1.5 text-[0.9rem] font-bold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:border-[#565959] disabled:bg-[#565959] disabled:shadow-none"
        >
          <FaRotateRight className={refreshing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      <main className="mx-auto w-full max-w-[800px] flex-1 p-5 pb-12">
        
        <div className="mb-6 flex items-end justify-between border-b border-[#D5D9D9] pb-4">
          <div>
            <h2 className="mb-1 text-[1.4rem] font-extrabold text-[#0F1111]">Performance Overview</h2>
            <p className="text-[0.95rem] font-medium text-[#565959]">Track how customers are interacting with your shop.</p>
          </div>
          <div className="rounded-md border border-[#D5D9D9] bg-white px-2.5 py-1 text-[0.8rem] font-bold text-[#565959] shadow-sm">
            All Time
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          
          {/* 1. Visits */}
          <div className="flex flex-col items-start rounded-lg border border-[#D5D9D9] bg-white p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-[#B0B5B5] hover:shadow-[0_8px_16px_rgba(0,0,0,0.06)]">
            <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-lg border border-[#BAE6FD] bg-[#F0F8FF] text-[1.4rem] text-[#0284C7]">
              <FaEye />
            </div>
            <div className="mb-1 text-[2.2rem] font-extrabold leading-none text-[#0F1111]">{formatNumber(stats.views)}</div>
            <div className="text-[1.05rem] font-bold text-[#0F1111]">Shop Visits</div>
            <div className="mt-0.5 text-[0.8rem] font-medium text-[#565959]">Total profile views</div>
          </div>

          {/* 2. Contacts */}
          <div className="flex flex-col items-start rounded-lg border border-[#D5D9D9] bg-white p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-[#B0B5B5] hover:shadow-[0_8px_16px_rgba(0,0,0,0.06)]">
            <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] text-[1.4rem] text-[#16A34A]">
              <FaHandPointer />
            </div>
            <div className="mb-1 text-[2.2rem] font-extrabold leading-none text-[#0F1111]">{formatNumber(stats.clicks)}</div>
            <div className="text-[1.05rem] font-bold text-[#0F1111]">Contacts Initiated</div>
            <div className="mt-0.5 text-[0.8rem] font-medium text-[#565959]">WhatsApp button clicks</div>
          </div>

          {/* 3. Likes */}
          <div className="flex flex-col items-start rounded-lg border border-[#D5D9D9] bg-white p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-[#B0B5B5] hover:shadow-[0_8px_16px_rgba(0,0,0,0.06)]">
            <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-lg border border-[#fbcfe8] bg-[#fdf2f8] text-[1.4rem] text-[#db2777]">
              <FaThumbsUp />
            </div>
            <div className="mb-1 text-[2.2rem] font-extrabold leading-none text-[#0F1111]">{formatNumber(stats.likes)}</div>
            <div className="text-[1.05rem] font-bold text-[#0F1111]">Shop Likes</div>
            <div className="mt-0.5 text-[0.8rem] font-medium text-[#565959]">Customers who saved your shop</div>
          </div>

          {/* 4. Conversion Rate */}
          <div className="flex flex-col items-start rounded-lg border border-[#D5D9D9] bg-white p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-[#B0B5B5] hover:shadow-[0_8px_16px_rgba(0,0,0,0.06)]">
            <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-lg border border-[#E9D5FF] bg-[#F3E8FF] text-[1.4rem] text-[#9333EA]">
              <FaChartPie />
            </div>
            <div className="mb-1 text-[2.2rem] font-extrabold leading-none text-[#0F1111]">{stats.conversion}</div>
            <div className="text-[1.05rem] font-bold text-[#0F1111]">Conversion Rate</div>
            <div className="mt-0.5 text-[0.8rem] font-medium text-[#565959]">Percentage of visitors who contact you</div>
          </div>

        </div>
      </main>
    </div>
  );
}
