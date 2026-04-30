import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaChevronRight,
  FaCircleCheck,
  FaStoreSlash,
  FaLayerGroup,
  FaLocationDot,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import { getRetryingMessage } from "../components/common/RetryingNotice"
import { getFriendlyErrorMessage, isNetworkError } from "../lib/friendlyErrors"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"

function normalizePositiveId(value) {
  const normalized = String(value ?? "").trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return parsed
}

function Cat() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const catName = searchParams.get("name")
  const [transitionState, setTransitionState] = useState({
    pending: false,
    shopId: "",
    error: "",
  })

  // Apply pull-to-refresh prevention
  usePreventPullToRefresh()

  // 1. Unified Auth State (isOffline removed to rely on global wrapper)
  const { user, profile, loading: authLoading } = useAuthSession()

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true })
    }
  }, [authLoading, navigate, user])

  // 2. Extracted Data Fetching Logic for Hook
  const fetchCategoryData = async () => {
    const resolvedCityId = normalizePositiveId(profile?.city_id)

    if (!user || !catName || !resolvedCityId) {
      return { shops: [] }
    }

    const { data: shopsData, error: shopsError } = await supabase
      .from("shops")
      .select("*")
      .eq("city_id", resolvedCityId)
      .eq("category", catName)
      .eq("is_verified", true)
      .order("name", { ascending: true })
      .limit(100)

    if (shopsError) throw shopsError

    return { shops: shopsData || [] }
  }

  // 3. Smart Caching Hook
  const cacheKey = `cat_${catName}_city_${profile?.city_id || 'none'}`
  const {
    data,
    loading: dataLoading,
    error: dataError,
    mutate,
    isRevalidating,
  } = useCachedFetch(
    cacheKey,
    fetchCategoryData,
    {
      dependencies: [catName, profile?.city_id, user?.id],
      ttl: 1000 * 60 * 15,
      persist: "session",
      skip: authLoading || !user || !catName || !profile?.city_id,
      keepPreviousData: true,
    }
  )

  const shops = data?.shops || []

  function getDisplayImage(shop) {
    if (shop?.image_url) return shop.image_url
    if (shop?.store_front_url) return shop.store_front_url
    if (Array.isArray(shop?.banners) && shop.banners.length > 0) return shop.banners[0]
    return ""
  }

  function getDisplayId(shop) {
    const rawId = String(shop?.unique_id || "N/A")
    return rawId.includes("-") ? rawId.split("-").pop() : rawId
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
        onRetry={() => {
          if (transitionState.shopId) {
            void openShopWithTransition(transitionState.shopId)
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
        className={`flex h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${
          transitionState.pending ? "pointer-events-none select-none" : ""
        }`}
      >
      {!catName ? (
        <GlobalErrorScreen
          title="Category unavailable"
          message="This category link is incomplete or no longer available."
          onBack={() => navigate(-1)}
        />
      ) : null}
      {!catName ? null : (
      <>
      <PageSeo
        title={`${catName || "Category"} Shops | CTMerchant`}
        description={`Discover verified shops and products in the ${catName || "selected"} category on CTMerchant.`}
        canonicalPath={`/cat${catName ? `?name=${encodeURIComponent(catName)}` : ""}`}
        noindex
      />
      <header className="sticky top-0 z-50 bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex w-full max-w-[800px] items-center gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
            aria-label="Go back"
          >
            <FaArrowLeft />
          </button>
          <div className="flex-1 truncate text-[1.15rem] font-bold tracking-[0.5px]">
            {catName || "Category"}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[800px] flex-1 overflow-y-auto px-4 py-5">
        {isRevalidating ? (
          <div className="mb-4 inline-flex rounded-full bg-slate-900 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-white">
            Updating category...
          </div>
        ) : null}
        {authLoading || ((!user || !catName) && !authLoading) || (dataLoading && !data) ? (
          <PageLoadingScreen
            fullScreen={false}
            title="Loading category"
            message="Please wait while we prepare shops in this category."
          />
        ) : dataError && !data ? (
          <GlobalErrorScreen
            fullScreen={false}
            error={dataError}
            message={getRetryingMessage(dataError)}
            onRetry={mutate}
            onBack={() => navigate(-1)}
          />
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100 text-[1.4rem] text-pink-600">
                <FaLayerGroup />
              </div>
              <div>
                <div className="text-[1.4rem] font-extrabold text-[#0F1111]">{catName}</div>
                <div className="mt-0.5 text-[0.9rem] font-semibold text-[#565959]">
                  {shops.length} verified stores found in your city
                </div>
              </div>
            </div>

            {shops.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-[#D5D9D9] bg-white px-5 py-16 text-center text-[#888C8C]">
                <FaStoreSlash className="mb-4 text-[3rem] opacity-30" />
                <span className="text-[1.1rem] font-extrabold text-[#0F1111]">No stores found</span>
                <span className="mt-1 text-sm">
                  There are no verified stores for {catName} in your area yet.
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
                const imageUrl = getDisplayImage(shop)
                const displayId = getDisplayId(shop)

                return (
                  <div
                    key={shop.id}
                    onClick={() => openShopWithTransition(shop.id)}
                    className="mb-3 flex cursor-pointer items-center gap-4 rounded-lg border border-[#D5D9D9] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_4px_10px_rgba(0,0,0,0.08)] active:scale-[0.98]"
                  >
                    {imageUrl ? (
                      <StableImage
                        src={imageUrl}
                        alt={shop.name}
                        containerClassName="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white"
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-pink-200 bg-pink-50 text-[1.4rem] font-extrabold text-pink-600">
                        {String(shop?.name || "S").charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="truncate text-[1.05rem] font-extrabold text-[#0F1111]">
                          {shop.name}
                        </span>
                        {shop.is_verified ? (
                          <FaCircleCheck className="shrink-0 text-[0.9rem] text-[#007185]" title="Verified" />
                        ) : null}
                      </div>

                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="rounded bg-pink-50 px-2 py-1 text-[0.7rem] font-bold text-pink-600">
                          {shop.category || "Uncategorized"}
                        </span>
                        {shop.is_verified ? (
                          <span className="text-[0.75rem] font-semibold text-slate-500">
                            ID: {displayId}
                          </span>
                        ) : null}
                      </div>

                      <div className="truncate text-[0.85rem] font-medium text-slate-500">
                        <FaLocationDot className="mr-1 inline text-slate-400" />
                        {shop.address || "No address"}
                      </div>
                    </div>

                    <FaChevronRight className="shrink-0 text-[1.1rem] text-slate-300" />
                  </div>
                )
              })
            )}
          </>
        )}
      </main>
      </>
      )}
      </div>
    </>
  )
}

export default Cat
