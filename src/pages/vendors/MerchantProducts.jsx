import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaBoxOpen,
  FaCircleCheck,
  FaClock,
  FaPen,
  FaPlus,
  FaTriangleExclamation,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import useCachedFetch from "../../hooks/useCachedFetch";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { ShimmerBlock } from "../../components/common/Shimmers";

// --- PROFESSIONAL SHIMMER COMPONENT ---
function MerchantProductsShimmer() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="text-xl opacity-50"><FaArrowLeft /></div>
          <div className="text-[1.15rem] font-bold opacity-50">Manage Products</div>
        </div>
        <ShimmerBlock className="h-9 w-20 rounded-md" />
      </header>
      <main className="mx-auto w-full max-w-[800px] p-5">
        <div className="flex flex-col gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-[#D5D9D9] bg-white p-4 shadow-sm">
              <ShimmerBlock className="h-20 w-20 flex-shrink-0 rounded-md" />
              <div className="flex-1">
                <ShimmerBlock className="mb-2 h-5 w-3/4 rounded" />
                <ShimmerBlock className="mb-2 h-4 w-1/3 rounded" />
                <div className="flex gap-2">
                  <ShimmerBlock className="h-5 w-16 rounded" />
                  <ShimmerBlock className="h-5 w-16 rounded" />
                </div>
              </div>
              <ShimmerBlock className="h-9 w-9 flex-shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function MerchantProducts() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");

  const { user, loading: authLoading, isOffline } = useAuthSession();
  const [activeShopId, setActiveShopId] = useState(urlShopId);

  // 1. Fetch Logic
  const fetchProductsList = async () => {
    if (!user) throw new Error("Authentication required");

    let shopIdToUse = activeShopId;

    // If no shop ID in URL, fetch it from DB
    if (!shopIdToUse) {
      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (shopErr || !shop) throw new Error("SHOP_NOT_FOUND");
      shopIdToUse = shop.id;
      setActiveShopId(shop.id);
    }

    const { data: products, error } = await supabase
      .from("products")
      .select("*")
      .eq("shop_id", shopIdToUse)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return products || [];
  };

  const { data: products, loading, error } = useCachedFetch(
    `merchant_products_${activeShopId || user?.id}`,
    fetchProductsList,
    { dependencies: [activeShopId, user?.id, isOffline], ttl: 1000 * 60 * 5 }
  );

  // 2. Auth & Routing Checks
  useEffect(() => {
    if (!authLoading && !user) navigate("/");
    if (error === "SHOP_NOT_FOUND") navigate("/vendor-panel", { replace: true });
  }, [authLoading, user, error, navigate]);


  // 3. Handlers
  const goToAdd = () => {
    if (isOffline) return alert("You must be online to add a new product.");
    if (!activeShopId) return alert("Shop ID is missing.");
    navigate(`/merchant-add-product?shop_id=${activeShopId}`);
  };

  const editProduct = (id) => {
    navigate(`/merchant-edit-product?id=${id}`);
  };


  // 4. Loading & Error States
  if (authLoading || (loading && !products)) {
    return <MerchantProductsShimmer />;
  }

  if (error && error !== "SHOP_NOT_FOUND" && !products) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="bg-[#131921] px-4 py-3 text-white"><button onClick={() => navigate("/vendor-panel")}><FaArrowLeft /></button></header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-600" />
            <h3 className="font-bold text-slate-900">{error === "Failed to fetch" ? "Network offline" : "Connection Error"}</h3>
            <button onClick={() => navigate("/vendor-panel")} className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold transition hover:bg-slate-50">Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      
      {/* OFFLINE BANNER */}
      {isOffline && (
        <div className="z-[101] bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-800 shadow-sm border-b border-amber-200">
          <i className="fa-solid fa-wifi-slash mr-2"></i>
          You are offline. Showing cached inventory.
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]">
            <FaArrowLeft />
          </button>
          <div className="text-[1.15rem] font-bold">Manage Products</div>
        </div>
        <button 
          onClick={goToAdd} 
          className="flex items-center gap-2 rounded-md border border-[#be185d] bg-[#db2777] px-4 py-2 text-[0.95rem] font-bold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d]"
        >
          <FaPlus /> Add
        </button>
      </header>

      {/* MAIN CONTAINER */}
      <main className="mx-auto w-full max-w-[800px] flex-1 p-5">
        
        {!products || products.length === 0 ? (
          <div className="rounded-lg border border-[#D5D9D9] bg-white p-12 text-center text-[#565959] shadow-sm mt-4">
            <FaBoxOpen className="mx-auto mb-4 text-5xl text-[#888C8C]" />
            <h3 className="mb-1 text-lg font-extrabold text-[#0F1111]">No products found</h3>
            <p>You haven't uploaded any products to your shop yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {products.map((p) => {
              const hasDiscount = p.discount_price && p.discount_price < p.price;
              
              return (
                <div 
                  key={p.id} 
                  onClick={() => editProduct(p.id)}
                  className="flex cursor-pointer items-center gap-4 rounded-lg border border-[#D5D9D9] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#B0B5B5] hover:shadow-[0_6px_12px_rgba(0,0,0,0.06)]"
                >
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#E3E6E6] bg-[#F7F7F7] p-1">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <FaImage className="text-2xl text-[#888C8C]" />
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-hidden">
                    <div className="mb-1 truncate text-[1rem] font-extrabold text-[#0F1111]" title={p.name}>
                      {p.name}
                    </div>
                    
                    <div className="mb-2 flex flex-wrap items-baseline gap-2">
                      {hasDiscount ? (
                        <>
                          <span className="text-[1.05rem] font-extrabold text-[#db2777]">₦{p.discount_price.toLocaleString()}</span>
                          <span className="text-[0.8rem] font-medium text-[#888C8C] line-through">₦{p.price.toLocaleString()}</span>
                        </>
                      ) : (
                        <span className="text-[1.05rem] font-extrabold text-[#db2777]">₦{(p.price || 0).toLocaleString()}</span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <div className="inline-flex items-center gap-1 rounded bg-[#F3F4F6] px-2 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[#565959] border border-[#E3E6E6]">
                        {p.condition}
                      </div>
                      
                      {p.is_approved ? (
                        <div className="inline-flex items-center gap-1 rounded bg-[#DCFCE7] px-2 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[#16A34A] border border-[#BBF7D0]">
                          <FaCircleCheck /> Active
                        </div>
                      ) : p.rejection_reason ? (
                        <div className="inline-flex items-center gap-1 rounded bg-[#FEE2E2] px-2 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[#DC2626] border border-[#FECACA]">
                          <FaTriangleExclamation /> Rejected
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 rounded bg-[#FEF3C7] px-2 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-[#D97706] border border-[#FDE68A]">
                          <FaClock /> Pending
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <button 
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-[#D5D9D9] bg-white text-[1rem] text-[#0F1111] shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:border-[#B0B5B5] hover:bg-[#F7FAFA]"
                      title="Edit Product"
                    >
                      <FaPen />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}