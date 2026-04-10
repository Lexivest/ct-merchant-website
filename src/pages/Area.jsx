import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaLocationDot,
  FaChevronRight,
  FaStoreSlash,
  FaMapLocationDot,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import { ShimmerList } from "../components/common/Shimmers"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import RetryingNotice, { getRetryingMessage } from "../components/common/RetryingNotice"
import { getFriendlyErrorMessage, isNetworkError } from "../lib/friendlyErrors"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"

function Area() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const areaId = searchParams.get("id")
  const [transitionState, setTransitionState] = useState({
    pending: false,
    shopId: "",
    error: "",
  })

  // Apply pull-to-refresh prevention
  usePreventPullToRefresh()

  // 1. Unified Auth State (isOffline removed to rely on global wrapper)
  const { user, loading: authLoading } = useAuthSession()

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true })
    }
  }, [authLoading, navigate, user])

  // 2. Extracted Data Fetching Logic for Hook
  const fetchAreaShops = async () => {
    if (!areaId) {
      throw new Error("Area ID missing.")
    }

    if (!user) {
      return {
        areaName: "Area",
        shops: [],
      }
    }

    const [
      { data: areaData, error: areaError },
      { data: shopsData, error: shopsError }
    ] = await Promise.all([
      supabase.from("areas").select("name").eq("id", areaId).single(),
      supabase
        .from("shops")
        .select("*")
        .eq("area_id", areaId)
        .order("name", { ascending: true })
        .limit(100)
    ])

    if (areaError) throw areaError
    if (shopsError) throw shopsError

    return {
      areaName: areaData?.name || "Area",
      shops: shopsData || [],
    }
  }

  // 3. Smart Caching Hook
  const cacheKey = `area_data_${areaId || 'none'}`
  const { data, loading: dataLoading, error: dataError, mutate } = useCachedFetch(
    cacheKey,
    fetchAreaShops,
    { dependencies: [areaId, user?.id], ttl: 1000 * 60 * 15 } // Cache area data for 15 minutes
  )

  const areaName = data?.areaName || ""
  const shops = data?.shops || []

  function getDisplayImage(shop) {
    if (shop.image_url) return shop.image_url
    if (shop.store_front_url) return shop.store_front_url
    if (Array.isArray(shop.banners) && shop.banners.length > 0) return shop.banners[0]
    return ""
  }

  async function openShopWithTransition(shopId) {
    if (!shopId) return

    setTransitionState({
      pending: true,
      shopId,
      error: "",
    })

    try {
      await prepareShopDetailTransition({
        shopId,
        userId: user?.id || null,
      })
      navigate(`/shop-detail?id=${shopId}`, {
        state: { fromDiscoveryTransition: true },
      })
    } catch (error) {
      const safeMessage = isNetworkError(error)
        ? "We could not open this shop right now. Please try again."
        : getFriendlyErrorMessage(
            error,
            "We could not open this shop right now. Please try again."
          )

      setTransitionState({
        pending: false,
        shopId,
        error: safeMessage,
      })
    }
  }

  return (
    <>
      <PageTransitionOverlay
        visible={transitionState.pending}
        error={transitionState.error}
        onRetry={() => openShopWithTransition(transitionState.shopId)}
        onDismiss={() =>
          setTransitionState((prev) => ({
            ...prev,
            pending: false,
            error: "",
          }))
        }
      />
      <div
        className={`min-h-screen bg-[#F3F4F6] text-[#0F1111] ${
          transitionState.pending ? "pointer-events-none select-none" : ""
        }`}
      >
      <PageSeo
        title={`${areaName || "Area"} Shops | CTMerchant`}
        description={`Browse verified shops and local merchants in ${areaName || "this area"} on CTMerchant.`}
        canonicalPath={`/area${areaId ? `?id=${encodeURIComponent(areaId)}` : ""}`}
      />
      <header className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex w-full max-w-[800px] items-center gap-4 px-4 py-3 text-white">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
            aria-label="Go back"
          >
            <FaArrowLeft />
          </button>
          <div className="flex-1 truncate text-[1.15rem] font-bold tracking-[0.5px]">
            {areaName || "Area"}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[800px] flex-1 px-4 py-5">
        {authLoading || (!user && !authLoading) || (dataLoading && !data) ? (
          <div className="pt-2">
            <ShimmerList />
          </div>
        ) : dataError && !data ? (
          <RetryingNotice fullScreen={false} message={getRetryingMessage(dataError)} onRetry={mutate} />
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100 text-[1.4rem] text-pink-600">
                <FaMapLocationDot />
              </div>
              <div>
                <div className="text-[1.4rem] font-extrabold text-[#0F1111]">{areaName}</div>
                <div className="mt-0.5 text-[0.9rem] font-semibold text-[#565959]">
                  {shops.length} verified stores found in this area
                </div>
              </div>
            </div>

            {shops.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-[#D5D9D9] bg-white px-5 py-16 text-center text-[#888C8C]">
                <FaStoreSlash className="mb-4 text-[3rem] opacity-30" />
                <span className="text-[1.1rem] font-extrabold text-[#0F1111]">No stores found</span>
                <span className="mt-1 text-sm">
                  There are no verified stores in {areaName} yet.
                </span>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold text-[#0F1111] transition hover:bg-slate-50"
                >
                  Back
                </button>
              </div>
            ) : (
              shops.map((shop) => {
                const displayImg = getDisplayImage(shop)
                const rawId = shop.unique_id || "N/A"
                const displayId = rawId.includes("-") ? rawId.split("-").pop() : rawId

                return (
                  <div
                    key={shop.id}
                    onClick={() => openShopWithTransition(shop.id)}
                    className="mb-3 flex cursor-pointer items-center gap-4 rounded-lg border border-[#D5D9D9] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:translate-y-[-2px] hover:border-[#B0B5B5] hover:shadow-[0_4px_10px_rgba(0,0,0,0.08)] active:scale-[0.98]"
                  >
                    {displayImg ? (
                      <StableImage
                        src={displayImg}
                        alt={shop.name}
                        containerClassName="h-16 w-16 shrink-0 rounded-lg border border-[#E5E7EB] bg-white"
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-pink-200 bg-pink-100 text-[1.4rem] font-extrabold text-pink-600">
                        {shop.name?.charAt(0)?.toUpperCase() || "S"}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="truncate text-[1.05rem] font-extrabold">{shop.name}</span>
                        {shop.is_verified ? (
                          <span title="Verified" className="text-[0.9rem] text-[#007185]">✓</span>
                        ) : null}
                      </div>

                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="rounded bg-pink-100 px-2 py-1 text-[0.7rem] font-bold text-pink-600">
                          {shop.category}
                        </span>
                        {shop.is_verified ? (
                          <span className="text-[0.75rem] font-semibold text-[#565959]">
                            ID: {displayId}
                          </span>
                        ) : null}
                      </div>

                      <div className="truncate text-[0.85rem] font-medium text-[#565959]">
                        <FaLocationDot className="mr-1 inline text-[#888C8C]" />
                        {shop.address}
                      </div>
                    </div>

                    <FaChevronRight className="text-[1.1rem] text-[#D5D9D9]" />
                  </div>
                )
              })
            )}
          </>
        )}
      </main>
      </div>
    </>
  )
}

export default Area
