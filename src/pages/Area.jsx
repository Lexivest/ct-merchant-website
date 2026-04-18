import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaChevronRight,
  FaCircleCheck,
  FaLocationDot,
  FaMagnifyingGlass,
  FaStoreSlash,
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

function Area() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const areaId = searchParams.get("id")
  
  usePreventPullToRefresh()

  // 1. Unified Auth State
  const { user, loading: authLoading } = useAuthSession()
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [transitionState, setTransitionState] = useState({
    pending: false,
    shopId: "",
    error: "",
  })

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true })
    }
  }, [authLoading, navigate, user])

  // 2. Extracted Data Fetching Logic for Hook
  const fetchAreaShops = async () => {
    if (!areaId) throw new Error("Area ID missing.")

    const [{ data: areaData, error: areaError }] = await Promise.all([
      supabase.from("areas").select("name").eq("id", areaId).maybeSingle()
    ])
    if (areaError) throw areaError

    let query = supabase
      .from("shops")
      .select("*")
      .eq("area_id", areaId)
      .order("name", { ascending: true })
      .limit(100)

    if (debouncedSearch) {
      const q = debouncedSearch.trim().replace(/,/g, "")
      const ilikeQuery = `%${q}%`
      query = query.or(`name.ilike.${ilikeQuery},category.ilike.${ilikeQuery},unique_id.ilike.${ilikeQuery},address.ilike.${ilikeQuery}`)
    }

    const { data: shops, error: shopsError } = await query
    if (shopsError) throw shopsError

    return {
      areaName: areaData?.name || "Area",
      shops: shops || [],
    }
  }

  // 3. Smart Caching Hook
  const cacheKey = `area_shops_${areaId || 'none'}_q_${debouncedSearch}`
  const { data, loading: dataLoading, error: dataError, mutate } = useCachedFetch(
    cacheKey,
    fetchAreaShops,
    { dependencies: [areaId, debouncedSearch, user?.id], ttl: 1000 * 60 * 15 }
  )

  const areaName = data?.areaName || "Area"
  const shops = data?.shops || []
  const headerTitle = `Shops in ${areaName}`

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
    setTransitionState({ pending: true, shopId, error: "" })
    try {
      await prepareShopDetailTransition({ shopId, userId: user?.id || null })
      navigate(`/shop-detail?id=${shopId}`, { state: { fromDiscoveryTransition: true } })
    } catch (error) {
      const safeMsg = isNetworkError(error) ? "Network error. Please try again." : getFriendlyErrorMessage(error)
      setTransitionState({ pending: false, shopId, error: safeMsg })
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
      <div className={`flex h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${transitionState.pending ? "pointer-events-none select-none" : ""}`}>
        <PageSeo
          title={`${headerTitle} | CTMerchant`}
          description={`Browse verified shops and local merchants in ${areaName} on CTMerchant.`}
          canonicalPath={`/area?id=${areaId}`}
        />
        
        <div className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <header className="mx-auto flex w-full max-w-[800px] items-center gap-4 px-4 py-3 text-white">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
            >
              <FaArrowLeft />
            </button>
            <div className="truncate text-[1.15rem] font-bold tracking-[0.5px]">
              {headerTitle}
            </div>
          </header>

          <div className="mx-auto w-full max-w-[800px] px-4 pb-4">
            <div className="flex h-11 overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`Search shops in ${areaName}...`}
                className="flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
              />
              <button
                type="button"
                className="flex w-[52px] items-center justify-center bg-pink-600 text-white"
                aria-label="Search"
              >
                <FaMagnifyingGlass className="text-[1.1rem]" />
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[800px] flex-1 overflow-y-auto px-4 py-5">
          {authLoading || (dataLoading && !data) ? (
            <PageLoadingScreen
              fullScreen={false}
              title="Loading shops"
              message={`Preparing stores in ${areaName}...`}
            />
          ) : dataError && !data ? (
            <GlobalErrorScreen
              fullScreen={false}
              error={dataError}
              message={getRetryingMessage(dataError)}
              onRetry={mutate}
            />
          ) : shops.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-5 text-center text-slate-400">
              <FaStoreSlash className="mb-4 text-5xl opacity-30" />
              <span className="font-semibold text-[#0F1111]">No shops found here.</span>
              <span className="mt-1 text-[0.85rem]">Try searching for something else or check back later.</span>
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
        </div>
      </div>
    </>
  )
}

export default Area
