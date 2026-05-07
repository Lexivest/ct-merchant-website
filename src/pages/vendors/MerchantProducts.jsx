import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaBoxOpen,
  FaCircleCheck,
  FaClock,
  FaImage,
  FaPen,
  FaPlus,
  FaTriangleExclamation,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import useCachedFetch from "../../hooks/useCachedFetch";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import PageTransitionOverlay from "../../components/common/PageTransitionOverlay";
import { PageLoadingScreen } from "../../components/common/PageStatusScreen";
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage, isNetworkError } from "../../lib/friendlyErrors";
import { prepareVendorRouteTransition } from "../../lib/vendorRouteTransitions";

// --- PROFESSIONAL SHIMMER COMPONENT ---
function MerchantProductsShimmer() {
  return (
    <PageLoadingScreen
      title="Opening listings"
      message="Please wait while we prepare your listings."
    />
  );
}

export default function MerchantProducts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useGlobalFeedback();
  usePreventPullToRefresh();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-products" &&
    (!urlShopId || String(location.state.prefetchedData.shopId) === String(urlShopId))
      ? location.state.prefetchedData
      : null;

  const { user, loading: authLoading, isOffline } = useAuthSession();
  const [activeShopId, setActiveShopId] = useState(prefetchedData?.shopId || urlShopId);
  const [isServiceMode, setIsServiceMode] = useState(() => prefetchedData?.shopData?.is_service === true);
  const [transitionState, setTransitionState] = useState({
    pending: false,
    path: "",
    error: "",
  });

  // 1. Fetch Logic
  const fetchProductsList = async () => {
    if (!user) throw new Error("Authentication required");

    let shopIdToUse = activeShopId;

    // If no shop ID in URL, fetch it from DB
    if (!shopIdToUse) {
      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .select("id, is_service")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (shopErr || !shop) throw new Error("SHOP_NOT_FOUND");
      shopIdToUse = shop.id;
      setActiveShopId(shop.id);
      setIsServiceMode(shop.is_service === true);
    }

    const { data: shopAccess, error: accessErr } = await supabase
      .from("shops")
      .select("id, is_service")
      .eq("id", shopIdToUse)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (accessErr || !shopAccess) throw new Error("SHOP_NOT_FOUND");
    if (String(activeShopId || "") !== String(shopAccess.id)) {
      setActiveShopId(String(shopAccess.id));
    }
    setIsServiceMode(shopAccess.is_service === true);

    const { data: products, error } = await supabase
      .from("products")
      .select("*")
      .eq("shop_id", shopAccess.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return products || [];
  };

  const { data: products, loading, error } = useCachedFetch(
    `merchant_products_${activeShopId || user?.id}`,
    fetchProductsList,
    { dependencies: [activeShopId, user?.id, isOffline], ttl: 1000 * 60 * 5 }
  );

  const entityName = isServiceMode ? "service" : "shop";
  const entityTitle = isServiceMode ? "Service" : "Shop";
  const itemName = isServiceMode ? "service" : "product";
  const itemPlural = isServiceMode ? "services" : "products";
  const itemTitle = isServiceMode ? "Service" : "Product";
  const itemPluralTitle = itemPlural.charAt(0).toUpperCase() + itemPlural.slice(1);

  // 2. Auth & Routing Checks
  useEffect(() => {
    if (!authLoading && !user) navigate("/");
    if (error === "SHOP_NOT_FOUND") navigate("/vendor-panel", { replace: true });
  }, [authLoading, user, error, navigate]);


  // 3. Handlers
  const openVendorTool = async (path, fallbackMessage) => {
    if (!path) return;
    if (isOffline) {
      setTransitionState({
        pending: false,
        path,
        error: "Network unavailable. Retry.",
      });
      return;
    }

    setTransitionState({
      pending: true,
      path,
      error: "",
    });

    try {
      const prefetchedData = await prepareVendorRouteTransition({
        path,
        userId: user?.id || null,
        shopId: activeShopId,
      });

      navigate(path, {
        state: {
          fromVendorTransition: true,
          prefetchedData,
          verifiedSubscriptionActive: true,
        },
      });
    } catch (error) {
      const safeMessage = isNetworkError(error)
        ? "Network unavailable. Retry."
        : getFriendlyErrorMessage(
            error,
            fallbackMessage
          );

      setTransitionState({
        pending: false,
        path,
        error: safeMessage,
      });
    }
  };

  const goToAdd = () => {
    if (!activeShopId) {
      notify({
        type: "error",
        title: `${entityTitle} unavailable`,
        message: `${entityTitle} details are not ready yet. Please retry.`,
      });
      return;
    }

    void openVendorTool(
      `/merchant-add-product?shop_id=${activeShopId}`,
      `We could not open the add ${itemName} page right now. Please try again.`
    );
  };

  const editProduct = (id) => {
    if (!id) return;

    void openVendorTool(
      `/merchant-edit-product?id=${id}`,
      `We could not open this ${itemName} editor right now. Please try again.`
    );
  };


  // 4. Loading & Error States
  if (authLoading || (loading && !products)) {
    return <MerchantProductsShimmer />;
  }

  if (error && error !== "SHOP_NOT_FOUND" && !products) {
    return (
      <GlobalErrorScreen
        error={error}
        message={getFriendlyErrorMessage(error, "Please retry or go back.")}
        onRetry={() => window.location.reload()}
        onBack={() => navigate("/vendor-panel")}
      />
    );
  }

  return (
    <>
      <PageTransitionOverlay
        visible={transitionState.pending}
        error={transitionState.error}
        onRetry={() => {
          if (transitionState.path) {
            void openVendorTool(
              transitionState.path,
              transitionState.path.startsWith("/merchant-add-product")
                ? `We could not open the add ${itemName} page right now. Please try again.`
                : `We could not open this ${itemName} editor right now. Please try again.`
            );
          }
        }}
        onDismiss={() =>
          setTransitionState((prev) => ({
            ...prev,
            pending: false,
            error: "",
          }))
        }
      />
      <div
        className={`flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${
          location.state?.fromVendorTransition ? "ctm-page-enter" : ""
        } ${transitionState.pending ? "pointer-events-none select-none" : ""}`}
      >
      
      {/* HEADER */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]">
            <FaArrowLeft />
          </button>
          <div className="text-[1.15rem] font-bold">Manage {itemPluralTitle}</div>
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
            <h3 className="mb-1 text-lg font-extrabold text-[#0F1111]">No {itemPlural} found</h3>
            <p>You haven't uploaded any {itemPlural} to your {entityName} page yet.</p>
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
                        {isServiceMode ? "Service" : p.condition}
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
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-[#D5D9D9] bg-white text-[1rem] text-[#0F1111] shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:border-[#B0B5B5] hover:bg-[#F7FAFA]"
                      title={`Edit ${itemTitle}`}
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
    </>
  );
}
